import { describe, expect, it, vi } from "vitest";

const runDigest = vi.fn();
vi.mock("../src/run", () => ({ runDigest: (...args: unknown[]) => runDigest(...args) }));
const { default: worker } = await import("../src/index");

const env = {
  DIGEST_STATE: {} as KVNamespace,
  SOURCE_REPO: "divinevideo/divine-mobile",
  ORG: "divinevideo",
  DISCORD_WEBHOOK_URL: "https://discord.test/live",
  TEST_DISCORD_WEBHOOK_URL: "https://discord.test/test",
  ANTHROPIC_API_KEY: "key",
  GITHUB_TOKEN: "tok",
  RUN_TOKEN: "secret",
};

function ctx() {
  const waits: Promise<unknown>[] = [];
  return { waits, ctx: { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext };
}

describe("fetch", () => {
  it("rejects a run without the token", async () => {
    const res = await worker.fetch(new Request("https://w/run", { method: "POST" }), env, ctx().ctx);
    expect(res.status).toBe(401);
    const wrong = await worker.fetch(
      new Request("https://w/run", { method: "POST", headers: { authorization: "Bearer nope" } }),
      env,
      ctx().ctx,
    );
    expect(wrong.status).toBe(401);
  });

  it("rejects every run when no token is configured", async () => {
    const res = await worker.fetch(
      new Request("https://w/run", { method: "POST", headers: { authorization: "Bearer " } }),
      { ...env, RUN_TOKEN: "" },
      ctx().ctx,
    );
    expect(res.status).toBe(401);
  });

  it("runs against the test webhook with the token", async () => {
    runDigest.mockResolvedValueOnce({ status: "posted", items: 2 });
    const res = await worker.fetch(
      new Request("https://w/run", { method: "POST", headers: { authorization: "Bearer secret" } }),
      env,
      ctx().ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "posted", items: 2 });
    expect(runDigest.mock.calls.at(-1)?.[0].webhookUrl).toBe("https://discord.test/test");
    expect(runDigest.mock.calls.at(-1)?.[0].recordProgress).toBe(false);
  });

  it("returns 404 elsewhere", async () => {
    expect((await worker.fetch(new Request("https://w/"), env, ctx().ctx)).status).toBe(404);
  });
});

describe("scheduled", () => {
  it("runs against the live webhook and logs failures", async () => {
    runDigest.mockRejectedValueOnce(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = ctx();
    await worker.scheduled({} as ScheduledController, env, c.ctx);
    await Promise.all(c.waits);
    expect(runDigest.mock.calls.at(-1)?.[0].webhookUrl).toBe("https://discord.test/live");
    expect(runDigest.mock.calls.at(-1)?.[0].recordProgress).toBe(true);
    expect(error).toHaveBeenCalled();
  });
});
