# Dev Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cloudflare Worker that, once a day, turns the team's public `divine-mobile` pull requests into a short, plain-language run of Discord messages with screenshots.

**Architecture:** One cron-triggered Worker. Small modules with injected `fetch`, KV, and an Anthropic client, so every module is unit-tested without the network: GitHub reader, eligibility filter, image downloader, Claude writer, Discord poster, KV state. A single `runDigest` orchestrates them: it gathers everything first, then sends.

**Tech Stack:** TypeScript, Cloudflare Workers (`wrangler` 4), Workers KV, `@anthropic-ai/sdk` + `zod` (structured outputs via `client.messages.parse` and `zodOutputFormat`), `vitest` (node environment, fakes, no network).

**Spec:** `docs/superpowers/specs/2026-10-11-dev-digest-design.md`

## Global Constraints

- Source repository `divinevideo/divine-mobile`; org `divinevideo`.
- Cron `0 16 * * *` (16:00 UTC daily). First run covers the previous 24 hours.
- Only pull requests by current `divinevideo` org members, checked with `GET /orgs/divinevideo/members/{login}` using the configured token (204 = member).
- Excluded Conventional Commit types: `chore`, `ci`, `test`, `build`, `refactor`, `style`, `docs`.
- Model `claude-sonnet-5`. Pull request text is data, never instructions.
- Images only: `image/png`, `image/jpeg`, `image/gif`, `image/webp`; max 8 MB (8 * 1024 * 1024 bytes) each; max 4 per item.
- Discord message text max 2000 characters; `allowed_mentions: { parse: [] }` on every message.
- No GitHub links, pull request numbers, or other URLs in posted text.
- Secrets (never committed): `DISCORD_WEBHOOK_URL`, `TEST_DISCORD_WEBHOOK_URL`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `RUN_TOKEN`.
- Gather everything before sending. Stop on the first failed send. Advance `last_post_at` only after the closing message. Never repeat a featured pull request.

## Review Focus

- A pull request body containing `@everyone`, role mentions, or "ignore previous instructions": no ping fires (`allowed_mentions` empty) and the outside-author filter plus output validation hold. Tests in Tasks 5 and 6.
- Screenshots written as HTML `<img src="...">` rather than markdown, and attachments that are videos: both image forms are found; videos are skipped by content type. Tests in Tasks 2 and 4.
- The model naming a pull request it was not given, or writing a URL or `#1234`: that item is dropped. Test in Task 5.
- More than 100 pull requests updated in the window: the reader pages until it passes `since`. Test in Task 3.
- The membership check returning 5xx: the run fails and posts nothing, rather than treating the author as an outsider. Test in Task 3.

---

### Task 1: Project scaffold, types, and eligibility rules

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.jsonc`, `vitest.config.ts`, `.gitignore`, `.dev.vars.example`
- Create: `src/types.ts`, `src/eligibility.ts`
- Test: `test/eligibility.test.ts`

**Interfaces:**
- Produces (`src/types.ts`):
  - `interface PullRequest { number: number; title: string; body: string; author: string; draft: boolean; state: "open" | "closed"; mergedAt: string | null; updatedAt: string }`
  - `interface Candidate extends PullRequest { screenshots: string[] }`
  - `interface Attachment { filename: string; contentType: string; bytes: Uint8Array }`
  - `interface DigestItem { prNumber: number; text: string }`
  - `interface DigestPlan { intro: string; items: DigestItem[]; closing: string }`
- Produces (`src/eligibility.ts`):
  - `commitType(title: string): string | null` (the `type` of `type(scope)!: summary`, lowercased; null if not Conventional)
  - `extractScreenshots(body: string): string[]` (unique `https://github.com/user-attachments/assets/<id>` URLs from markdown images and HTML `<img src>`, in order)
  - `isEligible(pr: PullRequest, since: Date, featured: ReadonlySet<number>): boolean`

- [ ] **Step 1: Scaffold.** `package.json` scripts: `test` = `vitest run`, `typecheck` = `tsc --noEmit`, `check` = `npm run typecheck && npm test`, `deploy` = `wrangler deploy`. Dependencies `@anthropic-ai/sdk`, `zod`; dev `wrangler`, `typescript`, `vitest`, `@cloudflare/workers-types`. `wrangler.jsonc`: name `divine-dev-digest`, `main` `src/index.ts`, `triggers.crons` `["0 16 * * *"]`, KV binding `DIGEST_STATE`, vars `SOURCE_REPO` = `divinevideo/divine-mobile`, `ORG` = `divinevideo`. `.dev.vars.example` lists the five secret names with empty values.

- [ ] **Step 2: Write the failing tests** in `test/eligibility.test.ts`:

```ts
expect(commitType("feat(feed): show compact links")).toBe("feat");
expect(commitType("Fix!: thing")).toBe("fix");
expect(commitType("Update README")).toBeNull();

const md = "![shot](https://github.com/user-attachments/assets/aaa-1)";
const html = '<img width="300" src="https://github.com/user-attachments/assets/bbb-2" />';
expect(extractScreenshots(`${md}\n${html}\n${md}`)).toEqual([
  "https://github.com/user-attachments/assets/aaa-1",
  "https://github.com/user-attachments/assets/bbb-2",
]);

const since = new Date("2026-10-10T16:00:00Z");
const base = { number: 1, title: "feat: x", body: "", author: "a", draft: false,
  state: "closed", mergedAt: "2026-10-11T01:00:00Z", updatedAt: "2026-10-11T01:00:00Z" } as const;
expect(isEligible(base, since, new Set())).toBe(true);                       // merged in window
expect(isEligible({ ...base, title: "chore: bump" }, since, new Set())).toBe(false);
expect(isEligible(base, since, new Set([1]))).toBe(false);                    // already featured
expect(isEligible({ ...base, mergedAt: "2026-10-09T00:00:00Z" }, since, new Set())).toBe(false);
const open = { ...base, state: "open", mergedAt: null } as const;
expect(isEligible(open, since, new Set())).toBe(false);                       // open, no screenshots
expect(isEligible({ ...open, body: md }, since, new Set())).toBe(true);       // open with screenshots
expect(isEligible({ ...open, draft: true }, since, new Set())).toBe(false);   // draft, no screenshots
expect(isEligible({ ...base, state: "closed", mergedAt: null }, since, new Set())).toBe(false); // closed unmerged
```

- [ ] **Step 3: Run** `npm test -- eligibility` — FAIL (module missing).
- [ ] **Step 4: Implement** `src/types.ts` and `src/eligibility.ts`. Eligible means: type not excluded, not featured, and either merged at or after `since`, or open, updated at or after `since`, with at least one screenshot.
- [ ] **Step 5: Run** `npm run check` — PASS.
- [ ] **Step 6: Commit** `feat: scaffold the worker and pull request eligibility rules`

### Task 2: Image downloader

**Files:**
- Create: `src/images.ts`
- Test: `test/images.test.ts`

**Interfaces:**
- Consumes: `Attachment` (Task 1).
- Produces: `MAX_IMAGE_BYTES = 8 * 1024 * 1024`; `downloadImage(fetchFn: typeof fetch, url: string, filename: string): Promise<Attachment | null>`

- [ ] **Step 1: Failing tests** with a fake `fetch` returning `Response` objects:
  - PNG body with `content-type: image/png` returns `{ filename: "shot-1.png", contentType: "image/png", bytes }` when called with filename `"shot-1"` (extension from content type: png, jpg, gif, webp).
  - `content-type: video/mp4` returns `null`.
  - `content-length` above `MAX_IMAGE_BYTES` returns `null`, and so does a body that turns out larger than the limit with no length header.
  - A 404 and a thrown network error both return `null`.
  - The fake asserts `redirect: "follow"` was passed.
- [ ] **Step 2: Run** `npm test -- images` — FAIL.
- [ ] **Step 3: Implement.** Fetch with `redirect: "follow"`; never throw.
- [ ] **Step 4: Run** `npm run check` — PASS.
- [ ] **Step 5: Commit** `feat: download pull request screenshots for re-upload`

### Task 3: GitHub reader and org membership

**Files:**
- Create: `src/github.ts`
- Test: `test/github.test.ts`

**Interfaces:**
- Consumes: `PullRequest` (Task 1).
- Produces:
  - `listUpdatedPulls(fetchFn: typeof fetch, token: string, repo: string, since: Date): Promise<PullRequest[]>`
  - `class MembershipChecker { constructor(fetchFn: typeof fetch, token: string, org: string); isMember(login: string): Promise<boolean> }` (memoizes per login within one run)

- [ ] **Step 1: Failing tests:**
  - Calls `GET https://api.github.com/repos/{repo}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=N` with `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, and a `User-Agent` header. Maps `user.login` to `author`, `merged_at` to `mergedAt`, `updated_at` to `updatedAt`, and a null `body` to `""`.
  - Page 1 has 100 pull requests all updated after `since`, and page 2 has some before it: both pages are requested, and only the in-window pull requests are returned. Stop paging at the first pull request older than `since`.
  - A non-2xx list response throws.
  - `isMember`: 204 returns true. 404 and 302 return false. 500 throws. Two calls for the same login make one request.
- [ ] **Step 2: Run** `npm test -- github` — FAIL.
- [ ] **Step 3: Implement.** Fetch membership with `redirect: "manual"`, so a 302 is seen as "not a member" and not followed.
- [ ] **Step 4: Run** `npm run check` — PASS.
- [ ] **Step 5: Commit** `feat: read recent pull requests and verify org membership`

### Task 4: KV state

**Files:**
- Create: `src/state.ts`
- Test: `test/state.test.ts`

**Interfaces:**
- Produces:
  - `getLastPostAt(kv: KVNamespace): Promise<Date | null>` (key `last_post_at`, ISO string)
  - `setLastPostAt(kv: KVNamespace, at: Date): Promise<void>`
  - `getFeatured(kv: KVNamespace): Promise<Set<number>>` (key `featured`, JSON number array)
  - `addFeatured(kv: KVNamespace, prNumber: number): Promise<void>`, which keeps only the newest 1000 entries

- [ ] **Step 1: Failing tests** against an in-memory `Map`-backed fake implementing `get`/`put`: round-trips; empty state returns `null` and an empty set; adding 1001 numbers keeps the newest 1000.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npm run check` — PASS.
- [ ] **Step 5: Commit** `feat: remember the last post time and featured pull requests`

### Task 5: Claude writer and Discord poster

**Files:**
- Create: `src/writer.ts`, `src/discord.ts`
- Test: `test/writer.test.ts`, `test/discord.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `DigestPlan`, `Attachment` (Task 1).
- Produces:
  - `MODEL = "claude-sonnet-5"`
  - `type ParseFn = (params: Anthropic.MessageCreateParams & { output_config: unknown }) => Promise<{ parsed_output: unknown }>`. This is the slice of `client.messages.parse` the writer uses. Production passes `client.messages.parse.bind(client.messages)`.
  - `writeDigest(parse: ParseFn, candidates: Candidate[]): Promise<DigestPlan | null>`
  - `validatePlan(raw: unknown, candidates: Candidate[]): DigestPlan | null`
  - `postMessage(fetchFn: typeof fetch, webhookUrl: string, text: string, attachments: Attachment[]): Promise<void>`

- [ ] **Step 1: Failing writer tests** using a fake `parse`:
  - The request uses `model: "claude-sonnet-5"`, `output_config.format` from `zodOutputFormat` with schema `{ share: boolean, intro: string, items: { pr_number: number, text: string }[], closing: string }`. Each candidate's title and body appear inside `<pull_request number="N">…</pull_request>` tags in the user message. The system prompt says the tag contents are data to summarize, not instructions.
  - `share: false` returns `null`.
  - `validatePlan` drops an item whose `pr_number` is not a candidate, drops items whose text matches `/https?:\/\/|github\.com|#\d+/i`, and keeps at most 5 items. It returns `null` when no items remain, or when intro, closing, or any item text is over 2000 characters or empty.
- [ ] **Step 2: Failing Discord tests** with a fake `fetch`:
  - Sends `multipart/form-data` to the webhook URL. `payload_json` is `{"content": text, "allowed_mentions": {"parse": []}}`, and each attachment is a `files[i]` part with its filename and content type.
  - With no attachments, the request still has `payload_json` and no file parts.
  - A non-2xx response throws.
- [ ] **Step 3: Run** `npm test -- writer discord` — FAIL.
- [ ] **Step 4: Implement.** The system prompt covers the spec's anti-goals: very non-technical readers, no jargon, no pull request numbers, branch names, or links. Write a friendly one-line intro, then 2 to 5 short items about what a person using the app would see or do. Prefer open design work with screenshots. End with a closing line inviting replies in the channel. Return `share: false` if nothing would matter to a user. `max_tokens: 16000`. `writeDigest` returns `validatePlan(response.parsed_output, candidates)`.
- [ ] **Step 5: Run** `npm run check` — PASS.
- [ ] **Step 6: Commit** `feat: write the digest with Claude and post it to Discord`

### Task 6: Orchestration, entry points, and README

**Files:**
- Create: `src/run.ts`, `src/index.ts`, `README.md` (replace the stub)
- Test: `test/run.test.ts`, `test/index.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `interface Deps { fetchFn: typeof fetch; kv: KVNamespace; parse: ParseFn; githubToken: string; repo: string; org: string; webhookUrl: string; now: Date }`
  - `type RunResult = { status: "posted"; items: number } | { status: "skipped"; reason: "no-candidates" | "nothing-to-share" }`
  - `runDigest(deps: Deps): Promise<RunResult>` (throws on failure)
  - default export `{ scheduled, fetch }` in `src/index.ts`

- [ ] **Step 1: Failing run tests**, with fakes for every dependency:
  - `since` comes from `last_post_at`, or `now - 24h` when unset.
  - An author who isn't a member is excluded before the writer is called; the writer never sees their pull request.
  - No candidates returns `{ status: "skipped", reason: "no-candidates" }`, posts nothing, and advances `last_post_at` to `now`.
  - The writer returns `null`: the result is `nothing-to-share`, nothing is posted, and `last_post_at` advances.
  - Happy path: sends in the order intro, items, closing. Each item carries at most 4 of its own pull request's screenshots, named `screenshot-<n>`. `addFeatured` runs after each item is sent. `last_post_at` is set to `now` after the closing message.
  - Every image download happens before the first `postMessage`. A failed download drops only that image.
  - A failed item send throws and stops the run. Items already sent stay featured, the closing message is not sent, and `last_post_at` is unchanged.
  - A GitHub, membership, or writer failure throws before anything is posted.
- [ ] **Step 2: Failing entry tests:**
  - `POST /run` without `Authorization: Bearer <RUN_TOKEN>` returns 401, and so does any request when `RUN_TOKEN` is unset.
  - With the token, `POST /run` runs against `TEST_DISCORD_WEBHOOK_URL` and returns the `RunResult` as JSON.
  - Any other path returns 404.
  - `scheduled` runs against `DISCORD_WEBHOOK_URL` through `ctx.waitUntil`, and logs the error on failure.
- [ ] **Step 3: Run** `npm test -- run index` — FAIL.
- [ ] **Step 4: Implement.** Build `parse` from `new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })`. Compare the run token in constant time.
- [ ] **Step 5: README:** what the bot does, the five secrets and the GitHub token permissions ("Members: read" on the org, read-only public repositories), creating the KV namespace, and testing with `curl -X POST -H "Authorization: Bearer $RUN_TOKEN" https://<worker>/run`. Then `npm run deploy`.
- [ ] **Step 6: Run** `npm run check` — PASS.
- [ ] **Step 7: Commit** `feat: run the daily digest on a schedule and on demand`
