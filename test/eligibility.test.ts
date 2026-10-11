import { describe, expect, it } from "vitest";
import { commitType, extractScreenshots, isEligible } from "../src/eligibility";
import type { PullRequest } from "../src/types";

const md = "![shot](https://github.com/user-attachments/assets/aaa-1)";
const html = '<img width="300" src="https://github.com/user-attachments/assets/bbb-2" />';
const since = new Date("2026-10-10T16:00:00Z");
const base: PullRequest = {
  number: 1,
  title: "feat: x",
  body: "",
  author: "a",
  draft: false,
  state: "closed",
  mergedAt: "2026-10-11T01:00:00Z",
  updatedAt: "2026-10-11T01:00:00Z",
};
const open: PullRequest = { ...base, state: "open", mergedAt: null };

describe("commitType", () => {
  it("reads the conventional commit type", () => {
    expect(commitType("feat(feed): show compact links")).toBe("feat");
    expect(commitType("Fix!: thing")).toBe("fix");
  });
  it("returns null for a non-conventional title", () => {
    expect(commitType("Update README")).toBeNull();
  });
});

describe("extractScreenshots", () => {
  it("finds markdown and html attachment images once each, in order", () => {
    expect(extractScreenshots(`${md}\n${html}\n${md}`)).toEqual([
      "https://github.com/user-attachments/assets/aaa-1",
      "https://github.com/user-attachments/assets/bbb-2",
    ]);
  });
  it("ignores other image hosts", () => {
    expect(extractScreenshots("![x](https://example.com/a.png)")).toEqual([]);
  });
});

describe("isEligible", () => {
  it("accepts a pull request merged in the window", () => {
    expect(isEligible(base, since, new Set())).toBe(true);
  });
  it("rejects excluded commit types", () => {
    expect(isEligible({ ...base, title: "chore: bump" }, since, new Set())).toBe(false);
  });
  it("rejects an already featured pull request", () => {
    expect(isEligible(base, since, new Set([1]))).toBe(false);
  });
  it("rejects a merge before the window", () => {
    expect(isEligible({ ...base, mergedAt: "2026-10-09T00:00:00Z" }, since, new Set())).toBe(false);
  });
  it("needs screenshots for open work", () => {
    expect(isEligible(open, since, new Set())).toBe(false);
    expect(isEligible({ ...open, body: md }, since, new Set())).toBe(true);
    expect(isEligible({ ...open, draft: true }, since, new Set())).toBe(false);
  });
  it("rejects open work not updated in the window", () => {
    expect(isEligible({ ...open, body: md, updatedAt: "2026-10-09T00:00:00Z" }, since, new Set())).toBe(false);
  });
  it("rejects closed unmerged pull requests", () => {
    expect(isEligible({ ...base, mergedAt: null }, since, new Set())).toBe(false);
  });
});
