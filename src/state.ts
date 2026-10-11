const LAST_POST_AT = "last_post_at";
const FEATURED = "featured";
const FEATURED_LIMIT = 1000;

export async function getLastPostAt(kv: KVNamespace): Promise<Date | null> {
  const value = await kv.get(LAST_POST_AT);
  return value ? new Date(value) : null;
}

export async function setLastPostAt(kv: KVNamespace, at: Date): Promise<void> {
  await kv.put(LAST_POST_AT, at.toISOString());
}

async function featuredList(kv: KVNamespace): Promise<number[]> {
  const value = await kv.get(FEATURED);
  return value ? (JSON.parse(value) as number[]) : [];
}

/** Pull requests already posted, so a later run never repeats one. */
export async function getFeatured(kv: KVNamespace): Promise<Set<number>> {
  return new Set(await featuredList(kv));
}

export async function addFeatured(kv: KVNamespace, prNumber: number): Promise<void> {
  const list = await featuredList(kv);
  list.push(prNumber);
  await kv.put(FEATURED, JSON.stringify(list.slice(-FEATURED_LIMIT)));
}
