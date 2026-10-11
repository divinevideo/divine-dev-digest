import { describe, expect, it } from "vitest";
import { listUpdatedPulls, MembershipChecker } from "../src/github";

interface Call { url: string; init: RequestInit }

function routes(handler: (url: string) => Response): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return handler(url);
  }) as typeof fetch;
  return { fetchFn, calls };
}

function apiPull(number: number, updatedAt: string, extra: Record<string, unknown> = {}) {
  return {
    number,
    title: `feat: ${number}`,
    body: null,
    user: { login: "dev" },
    draft: false,
    state: "open",
    merged_at: null,
    updated_at: updatedAt,
    ...extra,
  };
}

const since = new Date("2026-10-10T16:00:00Z");

describe("listUpdatedPulls", () => {
  it("maps the API shape and sends auth headers", async () => {
    const { fetchFn, calls } = routes(() =>
      Response.json([apiPull(7, "2026-10-11T00:00:00Z", { merged_at: "2026-10-11T00:00:00Z", state: "closed" })]),
    );
    const pulls = await listUpdatedPulls(fetchFn, "tok", "divinevideo/divine-mobile", since);
    expect(pulls).toEqual([
      {
        number: 7,
        title: "feat: 7",
        body: "",
        author: "dev",
        draft: false,
        state: "closed",
        mergedAt: "2026-10-11T00:00:00Z",
        updatedAt: "2026-10-11T00:00:00Z",
      },
    ]);
    expect(calls[0]?.url).toBe(
      "https://api.github.com/repos/divinevideo/divine-mobile/pulls?state=all&sort=updated&direction=desc&per_page=100&page=1",
    );
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer tok");
    expect(headers.get("accept")).toBe("application/vnd.github+json");
    expect(headers.get("user-agent")).toBeTruthy();
  });

  it("pages until it passes the window", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => apiPull(1000 - i, "2026-10-11T12:00:00Z"));
    const page2 = [apiPull(5, "2026-10-11T01:00:00Z"), apiPull(4, "2026-10-09T00:00:00Z"), apiPull(3, "2026-10-08T00:00:00Z")];
    const { fetchFn, calls } = routes((url) => Response.json(url.endsWith("page=1") ? page1 : page2));
    const pulls = await listUpdatedPulls(fetchFn, "tok", "o/r", since);
    expect(calls).toHaveLength(2);
    expect(pulls.map((p) => p.number)).toEqual([...page1.map((p) => p.number), 5]);
  });

  it("throws on a failed response", async () => {
    const { fetchFn } = routes(() => new Response("boom", { status: 502 }));
    await expect(listUpdatedPulls(fetchFn, "tok", "o/r", since)).rejects.toThrow();
  });
});

describe("MembershipChecker", () => {
  it("treats 204 as a member and 404 or 302 as not", async () => {
    const { fetchFn, calls } = routes((url) =>
      new Response(null, { status: url.endsWith("/in") ? 204 : url.endsWith("/out") ? 404 : 302 }),
    );
    const checker = new MembershipChecker(fetchFn, "tok", "divinevideo");
    expect(await checker.isMember("in")).toBe(true);
    expect(await checker.isMember("out")).toBe(false);
    expect(await checker.isMember("redirected")).toBe(false);
    expect(calls[0]?.url).toBe("https://api.github.com/orgs/divinevideo/members/in");
    expect(calls[0]?.init.redirect).toBe("manual");
  });

  it("throws on a server error instead of treating the author as an outsider", async () => {
    const { fetchFn } = routes(() => new Response(null, { status: 500 }));
    await expect(new MembershipChecker(fetchFn, "tok", "o").isMember("x")).rejects.toThrow();
  });

  it("asks once per login", async () => {
    const { fetchFn, calls } = routes(() => new Response(null, { status: 204 }));
    const checker = new MembershipChecker(fetchFn, "tok", "o");
    await checker.isMember("x");
    await checker.isMember("x");
    expect(calls).toHaveLength(1);
  });
});
