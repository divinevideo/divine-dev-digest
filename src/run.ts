import { postMessage } from "./discord";
import { extractScreenshots, isEligible } from "./eligibility";
import { listUpdatedPulls, MembershipChecker } from "./github";
import { downloadImage } from "./images";
import { addFeatured, getFeatured, getLastPostAt, setLastPostAt } from "./state";
import type { Attachment, Candidate } from "./types";
import { writeDigest, type ParseFn } from "./writer";

const MAX_IMAGES_PER_ITEM = 4;
const FIRST_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface Deps {
  fetchFn: typeof fetch;
  kv: KVNamespace;
  parse: ParseFn;
  githubToken: string;
  repo: string;
  org: string;
  webhookUrl: string;
  now: Date;
  /**
   * False for manual test runs: they post to the test channel and must not
   * advance the window or mark items featured, or the community would never
   * see them.
   */
  recordProgress: boolean;
}

export type RunResult =
  | { status: "posted"; items: number }
  | { status: "skipped"; reason: "no-candidates" | "nothing-to-share" };

async function candidatesSince(deps: Deps, since: Date): Promise<Candidate[]> {
  const featured = await getFeatured(deps.kv);
  const pulls = await listUpdatedPulls(deps.fetchFn, deps.githubToken, deps.repo, since);
  const members = new MembershipChecker(deps.fetchFn, deps.githubToken, deps.org);
  const candidates: Candidate[] = [];
  for (const pull of pulls) {
    if (!isEligible(pull, since, featured)) continue;
    // Anyone can open a pull request on a public repo; only the team's reach the model.
    if (!(await members.isMember(pull.author))) continue;
    candidates.push({ ...pull, screenshots: extractScreenshots(pull.body) });
  }
  return candidates;
}

/**
 * One daily run. Everything is gathered before the first message is sent, so
 * a GitHub, model, or membership failure posts nothing and the next run covers
 * this window too. Sending stops at the first failure; each sent item is
 * recorded at once so it is never repeated, and the window only advances after
 * the closing message.
 */
export async function runDigest(deps: Deps): Promise<RunResult> {
  const since = (await getLastPostAt(deps.kv)) ?? new Date(deps.now.getTime() - FIRST_RUN_WINDOW_MS);
  const candidates = await candidatesSince(deps, since);
  if (candidates.length === 0) {
    if (deps.recordProgress) await setLastPostAt(deps.kv, deps.now);
    return { status: "skipped", reason: "no-candidates" };
  }

  const plan = await writeDigest(deps.parse, candidates);
  if (!plan) {
    if (deps.recordProgress) await setLastPostAt(deps.kv, deps.now);
    return { status: "skipped", reason: "nothing-to-share" };
  }

  const byNumber = new Map(candidates.map((c) => [c.number, c]));
  const messages: { prNumber: number; text: string; images: Attachment[] }[] = [];
  for (const item of plan.items) {
    // A screenshot that fails to download is skipped and the next one takes its place.
    const images: Attachment[] = [];
    for (const url of byNumber.get(item.prNumber)?.screenshots ?? []) {
      if (images.length === MAX_IMAGES_PER_ITEM) break;
      const image = await downloadImage(deps.fetchFn, url, `screenshot-${images.length + 1}`);
      if (image) images.push(image);
    }
    messages.push({ ...item, images });
  }

  await postMessage(deps.fetchFn, deps.webhookUrl, plan.intro, []);
  for (const message of messages) {
    await postMessage(deps.fetchFn, deps.webhookUrl, message.text, message.images);
    if (deps.recordProgress) await addFeatured(deps.kv, message.prNumber);
  }
  await postMessage(deps.fetchFn, deps.webhookUrl, plan.closing, []);
  if (deps.recordProgress) await setLastPostAt(deps.kv, deps.now);
  return { status: "posted", items: messages.length };
}
