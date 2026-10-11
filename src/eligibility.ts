import type { PullRequest } from "./types";

// Work that means nothing to someone using the app.
const EXCLUDED_TYPES = new Set(["chore", "ci", "test", "build", "refactor", "style", "docs"]);

const ATTACHMENT = String.raw`https://github\.com/user-attachments/assets/[A-Za-z0-9-]+`;
const MARKDOWN_IMAGE = new RegExp(String.raw`!\[[^\]]*\]\((${ATTACHMENT})\)`, "g");
const HTML_IMAGE = new RegExp(String.raw`<img\b[^>]*\bsrc=["'](${ATTACHMENT})["']`, "gi");

export function commitType(title: string): string | null {
  const match = /^([A-Za-z]+)(\([^)]*\))?!?:/.exec(title.trim());
  return match?.[1] ? match[1].toLowerCase() : null;
}

/** Screenshot URLs attached to a pull request description, deduplicated, in order of appearance. */
export function extractScreenshots(body: string): string[] {
  const found: { index: number; url: string }[] = [];
  for (const pattern of [MARKDOWN_IMAGE, HTML_IMAGE]) {
    for (const match of body.matchAll(pattern)) {
      if (match[1]) found.push({ index: match.index ?? 0, url: match[1] });
    }
  }
  found.sort((a, b) => a.index - b.index);
  return [...new Set(found.map((f) => f.url))];
}

/**
 * Merged in the window, or open work with screenshots updated in the window.
 * Open work without screenshots has nothing for the community to look at yet.
 */
export function isEligible(pr: PullRequest, since: Date, featured: ReadonlySet<number>): boolean {
  if (featured.has(pr.number)) return false;
  const type = commitType(pr.title);
  if (type && EXCLUDED_TYPES.has(type)) return false;
  if (pr.mergedAt) return new Date(pr.mergedAt) >= since;
  if (pr.state !== "open") return false;
  return new Date(pr.updatedAt) >= since && extractScreenshots(pr.body).length > 0;
}
