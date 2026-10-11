import { describe, expect, it } from "vitest";
import { addFeatured, getFeatured, getLastPostAt, setLastPostAt } from "../src/state";
import { FakeKV } from "./support/fake-kv";

describe("state", () => {
  it("starts empty", async () => {
    const kv = new FakeKV().asKV();
    expect(await getLastPostAt(kv)).toBeNull();
    expect(await getFeatured(kv)).toEqual(new Set());
  });

  it("round-trips the last post time", async () => {
    const kv = new FakeKV().asKV();
    const at = new Date("2026-10-11T16:00:00Z");
    await setLastPostAt(kv, at);
    expect(await getLastPostAt(kv)).toEqual(at);
  });

  it("remembers featured pull requests, keeping the newest 1000", async () => {
    const kv = new FakeKV().asKV();
    await addFeatured(kv, 7);
    expect(await getFeatured(kv)).toEqual(new Set([7]));
    for (let n = 1; n <= 1001; n++) await addFeatured(kv, 10_000 + n);
    const featured = await getFeatured(kv);
    expect(featured.size).toBe(1000);
    expect(featured.has(7)).toBe(false);
    expect(featured.has(11_001)).toBe(true);
  });
});
