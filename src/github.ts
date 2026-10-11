import type { PullRequest } from "./types";

const API = "https://api.github.com";

interface ApiPull {
  number: number;
  title: string;
  body: string | null;
  user: { login: string } | null;
  draft?: boolean;
  state: "open" | "closed";
  merged_at: string | null;
  updated_at: string;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "divine-dev-digest",
  };
}

/** Pull requests updated at or after `since`, newest first, paging until the window is passed. */
export async function listUpdatedPulls(
  fetchFn: typeof fetch,
  token: string,
  repo: string,
  since: Date,
): Promise<PullRequest[]> {
  const pulls: PullRequest[] = [];
  for (let page = 1; ; page++) {
    const url = `${API}/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`;
    const response = await fetchFn(url, { headers: headers(token) });
    if (!response.ok) throw new Error(`GitHub pull list failed with ${response.status}`);
    const batch = (await response.json()) as ApiPull[];
    for (const pull of batch) {
      if (new Date(pull.updated_at) < since) return pulls;
      pulls.push({
        number: pull.number,
        title: pull.title,
        body: pull.body ?? "",
        author: pull.user?.login ?? "",
        draft: pull.draft ?? false,
        state: pull.state,
        mergedAt: pull.merged_at,
        updatedAt: pull.updated_at,
      });
    }
    if (batch.length < 100) return pulls;
  }
}

/**
 * Checks org membership with the configured token. Private members are only
 * visible to a token that can read the org's members, so an outside check
 * would silently drop them. A server error throws rather than guessing.
 */
export class MembershipChecker {
  private readonly cache = new Map<string, boolean>();

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly token: string,
    private readonly org: string,
  ) {}

  async isMember(login: string): Promise<boolean> {
    const cached = this.cache.get(login);
    if (cached !== undefined) return cached;
    const response = await this.fetchFn(`${API}/orgs/${this.org}/members/${encodeURIComponent(login)}`, {
      headers: headers(this.token),
      redirect: "manual",
    });
    let member: boolean;
    if (response.status === 204) member = true;
    else if (response.status === 404 || response.status === 302) member = false;
    else throw new Error(`GitHub membership check failed with ${response.status}`);
    this.cache.set(login, member);
    return member;
  }
}
