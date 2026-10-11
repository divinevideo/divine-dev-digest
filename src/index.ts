import Anthropic from "@anthropic-ai/sdk";
import { runDigest, type Deps } from "./run";
import type { ParseFn } from "./writer";

export interface Env {
  DIGEST_STATE: KVNamespace;
  SOURCE_REPO: string;
  ORG: string;
  DISCORD_WEBHOOK_URL: string;
  TEST_DISCORD_WEBHOOK_URL: string;
  ANTHROPIC_API_KEY: string;
  GITHUB_TOKEN: string;
  RUN_TOKEN: string;
}

function deps(env: Env, webhookUrl: string, recordProgress: boolean): Deps {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const parse: ParseFn = (params) => client.messages.parse(params as never);
  return {
    fetchFn: (input, init) => fetch(input, init),
    kv: env.DIGEST_STATE,
    parse,
    githubToken: env.GITHUB_TOKEN,
    repo: env.SOURCE_REPO,
    org: env.ORG,
    webhookUrl,
    now: new Date(),
    recordProgress,
  };
}

/** Constant-time comparison, so the run token can't be guessed byte by byte. */
function sameToken(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/run") return new Response("Not found", { status: 404 });
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!env.RUN_TOKEN || !sameToken(token, env.RUN_TOKEN)) return new Response("Unauthorized", { status: 401 });
    // Manual runs go to the test channel and leave the daily run's state alone.
    return Response.json(await runDigest(deps(env, env.TEST_DISCORD_WEBHOOK_URL, false)));
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runDigest(deps(env, env.DISCORD_WEBHOOK_URL, true)).catch((error: unknown) => {
        console.error("dev digest run failed", error);
      }),
    );
  },
};
