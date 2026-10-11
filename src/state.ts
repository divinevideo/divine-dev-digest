const LAST_POST_AT = "last_post_at";

export async function getLastPostAt(kv: KVNamespace): Promise<Date | null> {
  const value = await kv.get(LAST_POST_AT);
  return value ? new Date(value) : null;
}

export async function setLastPostAt(kv: KVNamespace, at: Date): Promise<void> {
  await kv.put(LAST_POST_AT, at.toISOString());
}

const FEATURED_PREFIX = "featured:";
// Long enough that no window ever reaches back past it.
const FEATURED_TTL_SECONDS = 180 * 24 * 60 * 60;

/** Pull requests already posted, so a later run never repeats one. */
export async function getFeatured(kv: KVNamespace): Promise<Set<number>> {
  const featured = new Set<number>();
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: FEATURED_PREFIX, cursor });
    for (const key of page.keys) featured.add(Number(key.name.slice(FEATURED_PREFIX.length)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return featured;
}

/**
 * One key per pull request: Workers KV allows about one write per second to
 * a single key, and items are posted faster than that.
 */
export async function addFeatured(kv: KVNamespace, prNumber: number): Promise<void> {
  await kv.put(`${FEATURED_PREFIX}${prNumber}`, "1", { expirationTtl: FEATURED_TTL_SECONDS });
}
