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

  it("writes one expiring key per featured pull request and reads them all back", async () => {
    const fake = new FakeKV();
    const kv = fake.asKV();
    for (const n of [7, 8, 9, 10, 11]) await addFeatured(kv, n);
    expect(await getFeatured(kv)).toEqual(new Set([7, 8, 9, 10, 11]));
    const keys = fake.puts.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length); // never the same key twice in a row
    expect(fake.puts.every((p) => (p.options?.expirationTtl ?? 0) >= 90 * 24 * 3600)).toBe(true);
  });
});
