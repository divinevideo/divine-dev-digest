# Dev Digest: daily plain-language Discord post about what we're building

## Intent

Divine's community is very non-technical, but they want to know what is coming
and to help shape it. Today the team's work in progress, including design
screenshots, lives on public GitHub pull requests that community members will
never read.

The dev digest is a once-a-day Discord post, in its own channel, that turns the
day's public app work into a short, friendly note with screenshots. Its purpose
is co-design: make the development process transparent and inclusive, so the
community sees ideas while they are still being explored and reacts to them.
Feedback happens in the Discord channel itself.

Success: community members read the post, understand it without any technical
background, and reply in the channel with reactions and opinions about what we
are exploring.

## Goals

- One daily update in a dedicated Discord channel, sent as a short run of
  messages: an intro, one message per item with that item's own screenshots,
  and a closing line inviting replies (decided by rabble).
- Written for very non-technical readers: what changed or is being explored,
  in terms of what a person using the app would see or do.
- Show UI screenshots from pull requests, especially the in-progress design
  work Sebastian (`Chardot`) posts on his pull requests.
- Cover both what is coming (open pull requests that are still being explored)
  and what just landed (merged pull requests).
- Runs on its own with no approval step. Anything public on GitHub is treated
  as public.

## Non-goals

- Collecting, tracking, or routing feedback. Replies stay in the channel.
- Threads, polls, reactions handling, or any interactive bot behavior.
- A website, archive, or RSS feed.
- Covering every repository. Start with `divinevideo/divine-mobile`, the
  primary app repository.
- Changing divine-badges or its "awards bot" webhook.

## Anti-goals (a failure even if it technically works)

- Jargon: pull request numbers, branch names, commit types, library names,
  "refactor", "CI", "migration", and similar. If a non-technical reader would
  stumble, it failed.
- A changelog dump. It is a short note, not a list of everything merged.
- Posting internal-only or meaningless work (dependency bumps, tests, CI,
  build changes) as if it were news.
- Posting text that someone outside the team planted in a pull request (see
  Trust below).
- An empty or filler post on a day with nothing worth sharing.

## Constraints

- Source: only public repositories. Start with `divinevideo/divine-mobile`
  (public).
- **Trust boundary.** Pull request titles, bodies, and images are untrusted
  input: anyone can open a pull request on a public repository. Only pull
  requests authored by current members of the `divinevideo` GitHub org are
  eligible. Verify membership through the GitHub API, not by name. Text from
  pull requests is passed to the model as data to summarize, never as
  instructions.
- **Screenshot links expire.** Images on pull requests are
  `https://github.com/user-attachments/assets/<id>` links. They load without a
  GitHub login, but redirect to a signed storage URL that expires after five
  minutes. Linking them in Discord would break, so the service downloads each
  image and uploads it to Discord as a file attachment.
- Discord limits: message text at most 2000 characters, at most 10
  attachments per message, and a per-file size limit. Skip any image over
  8 MB. Each item message carries only its own pull request's screenshots
  (at most 4 per item, so a gallery stays readable).
- Never commit secrets. The Discord webhook URL, model API key, and GitHub
  token are deployment secrets.

## Decided (by rabble in conversation)

- A new public repository, `divinevideo/divine-dev-digest`, not part of
  divine-badges.
- Its own Discord channel, separate from the Diviner of the Day posts.
- Feedback stays in the Discord channel. Do not overbuild.
- No human approval before posting; public on GitHub means public.
- `divine-mobile` is the primary source.
- The daily update can be several Discord messages, one per item.

## Builder's calls (made by the agent, rabble may override)

- **Platform:** a Cloudflare Worker on a daily cron trigger, in TypeScript, the
  same stack as divine-engagement. Deployed to the Divine Cloudflare account.
- **Schedule:** once a day at 16:00 UTC, covering activity since the last
  successful post (first run: the previous 24 hours).
- **What is eligible:** pull requests in `divine-mobile` by org members that
  were merged, or opened or updated with new screenshots, since the last post.
  Exclude pull requests whose Conventional Commit type is `chore`, `ci`,
  `test`, `build`, `refactor`, `style`, or `docs`, and drafts with no
  screenshots.
- **Writing:** the model (Claude, `claude-sonnet-5`) receives the eligible pull
  request titles, descriptions, and screenshot counts, and writes the post:
  a one-line greeting, two to five short items in plain language (each tied to
  one pull request so its screenshots go with it), and a closing line inviting
  replies. The model returns structured output (intro, items with their source
  pull request, closing), not one text block. It may drop items that would not mean anything to a
  user. If nothing is worth sharing, it says so and the service skips the post.
- **Screenshots:** images only (PNG, JPEG, GIF, WebP), up to 4 per item, from
  that item's pull request description. Sebastian's design work is preferred
  when choosing items.
  Videos are out of scope for the first version.
- **No links to GitHub** in the post; readers are not expected to go there.
- **Webhook identity:** a new webhook in the new channel; name and avatar are
  set in Discord, not in code.
- **GitHub credential:** a fine-grained token with read access to public
  repositories and the org "Members: read" permission, created by an org
  admin. Membership must be checked with `orgs/divinevideo/members/<login>`
  using that token: several team members, including Sebastian, are private
  members, and an unauthenticated or outside check only sees public members,
  so their pull requests would be silently dropped.
- **State:** a small Cloudflare KV namespace storing the time of the last
  successful post, so a failed day is covered by the next run.
- **Failure behavior:** gather everything (pull requests, model output, image
  downloads) before sending anything; a failure there posts nothing and the
  next run covers both days. A single image that fails to download is dropped,
  not fatal. Messages are then sent in order; if one fails mid-run, stop. KV
  records each pull request already featured, so a later run never repeats an
  item that was posted, and the last-post time advances only after the closing
  message is sent.

## Left to the builder

- Prompt wording, within the anti-goals above.
- Exact eligibility heuristics for "updated with new screenshots".
- Tests, project layout, and how the cron handler is structured.
- A manual trigger for testing (for example, an authenticated HTTP route that
  runs the job against a test webhook).
