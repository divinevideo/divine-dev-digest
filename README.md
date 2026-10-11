# divine-dev-digest

A Cloudflare Worker that posts a short, plain-language daily update to a Divine
community Discord channel about what the app team is building, with
screenshots from pull requests. The community can react and give feedback in
the channel.

Design: `docs/superpowers/specs/2026-10-11-dev-digest-design.md`.

## How it works

Every day at 16:00 UTC the Worker:

1. Reads `divinevideo/divine-mobile` pull requests updated since the last post.
2. Keeps pull requests that were merged, or are open with screenshots, that
   aren't internal work (`chore`, `ci`, `test`, `build`, `refactor`, `style`,
   `docs`), and whose author is a `divinevideo` org member.
3. Asks Claude to write a friendly intro, 2 to 5 short items, and a closing
   line, all without jargon or links.
4. Downloads up to 4 screenshots per item and posts a short run of messages:
   the intro, one message per item with its own screenshots, then the closing.
   Mentions are always disabled.

If nothing is worth sharing, it posts nothing.

## Setup

```sh
npm install
npx wrangler kv namespace create DIGEST_STATE   # paste the id into wrangler.jsonc
```

Secrets (`npx wrangler secret put <NAME>`):

| Name | What |
| --- | --- |
| `DISCORD_WEBHOOK_URL` | Webhook in the community dev-updates channel |
| `TEST_DISCORD_WEBHOOK_URL` | Webhook in a private test channel |
| `ANTHROPIC_API_KEY` | Claude API key |
| `GITHUB_TOKEN` | Fine-grained token with org **Members: read** and read-only access to public repositories. It must be able to see private org members, or their pull requests are skipped. |
| `RUN_TOKEN` | Any long random string, for manual test runs |

## Test and deploy

```sh
npm run check     # typecheck and tests
npm run deploy
```

To try a run against the test channel:

```sh
curl -X POST -H "Authorization: Bearer $RUN_TOKEN" https://divine-dev-digest.<subdomain>.workers.dev/run
```

A manual run posts to the test channel and leaves the daily run's state alone,
so whatever it shows still goes to the community channel later.
