import { describe, expect, it } from "vitest";
import { downloadImage, MAX_IMAGE_BYTES } from "../src/images";

const URL_ = "https://github.com/user-attachments/assets/aaa-1";

function fakeFetch(response: Response | Error, seen: RequestInit[] = []): typeof fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(init ?? {});
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
}

function image(bytes: number, type: string, headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(bytes), { headers: { "content-type": type, ...headers } });
}

describe("downloadImage", () => {
  it("returns the image with an extension from its content type, following redirects", async () => {
    const seen: RequestInit[] = [];
    const result = await downloadImage(fakeFetch(image(10, "image/png"), seen), URL_, "shot-1");
    expect(result).toEqual({ filename: "shot-1.png", contentType: "image/png", bytes: new Uint8Array(10) });
    expect(seen[0]?.redirect).toBe("follow");
  });

  it("names jpeg, gif and webp files", async () => {
    for (const [type, ext] of [["image/jpeg", "jpg"], ["image/gif", "gif"], ["image/webp", "webp"]]) {
      const result = await downloadImage(fakeFetch(image(1, type!)), URL_, "s");
      expect(result?.filename).toBe(`s.${ext}`);
    }
  });

  it("skips videos", async () => {
    expect(await downloadImage(fakeFetch(image(10, "video/mp4")), URL_, "s")).toBeNull();
  });

  it("skips images over the size limit by header", async () => {
    const big = image(1, "image/png", { "content-length": String(MAX_IMAGE_BYTES + 1) });
    expect(await downloadImage(fakeFetch(big), URL_, "s")).toBeNull();
  });

  it("skips images over the size limit by body", async () => {
    expect(await downloadImage(fakeFetch(image(MAX_IMAGE_BYTES + 1, "image/png")), URL_, "s")).toBeNull();
  });

  it("returns null on a failed response or network error", async () => {
    expect(await downloadImage(fakeFetch(new Response("no", { status: 404 })), URL_, "s")).toBeNull();
    expect(await downloadImage(fakeFetch(new Error("offline")), URL_, "s")).toBeNull();
  });
});
