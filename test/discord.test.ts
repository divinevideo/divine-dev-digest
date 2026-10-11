import { describe, expect, it } from "vitest";
import { postMessage } from "../src/discord";

function capture(status = 204) {
  const calls: { url: string; body: FormData }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body as FormData });
    return new Response(null, { status });
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe("postMessage", () => {
  it("sends text with mentions disabled and each image as a file", async () => {
    const { fetchFn, calls } = capture();
    await postMessage(fetchFn, "https://discord.test/hook", "@everyone hello", [
      { filename: "screenshot-1.png", contentType: "image/png", bytes: new Uint8Array([1, 2]) },
    ]);
    expect(calls[0]?.url).toBe("https://discord.test/hook");
    const form = calls[0]!.body;
    expect(JSON.parse(String(form.get("payload_json")))).toEqual({
      content: "@everyone hello",
      allowed_mentions: { parse: [] },
    });
    const file = form.get("files[0]") as File;
    expect(file.name).toBe("screenshot-1.png");
    expect(file.type).toBe("image/png");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  });

  it("sends text alone when there are no images", async () => {
    const { fetchFn, calls } = capture();
    await postMessage(fetchFn, "https://discord.test/hook", "hi", []);
    expect(calls[0]!.body.get("files[0]")).toBeNull();
    expect(calls[0]!.body.get("payload_json")).toBeTruthy();
  });

  it("throws when Discord rejects the message", async () => {
    const { fetchFn } = capture(400);
    await expect(postMessage(fetchFn, "https://discord.test/hook", "hi", [])).rejects.toThrow();
  });

  it("waits and retries when Discord rate limits", async () => {
    const statuses = [429, 204];
    const waits: number[] = [];
    const fetchFn = (async () => {
      const status = statuses.shift()!;
      return status === 429 ? Response.json({ retry_after: 1.5 }, { status }) : new Response(null, { status });
    }) as typeof fetch;
    await postMessage(fetchFn, "https://discord.test/hook", "hi", [], async (ms) => void waits.push(ms));
    expect(waits).toEqual([1500]);
    expect(statuses).toEqual([]);
  });

  it("gives up after repeated rate limits", async () => {
    const fetchFn = (async () => Response.json({ retry_after: 0.1 }, { status: 429 })) as typeof fetch;
    await expect(postMessage(fetchFn, "https://discord.test/hook", "hi", [], async () => {})).rejects.toThrow();
  });
});
