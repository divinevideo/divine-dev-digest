export class FakeKV {
  readonly store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  readonly puts: { key: string; options?: KVNamespacePutOptions }[] = [];
  async put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void> {
    this.puts.push({ key, options });
    this.store.set(key, value);
  }
  async list(options: { prefix?: string; cursor?: string } = {}) {
    const keys = [...this.store.keys()].filter((k) => k.startsWith(options.prefix ?? "")).sort();
    const start = options.cursor ? Number(options.cursor) : 0;
    const page = keys.slice(start, start + 2); // tiny pages so paging is exercised
    const done = start + 2 >= keys.length;
    return { keys: page.map((name) => ({ name })), list_complete: done, cursor: done ? "" : String(start + 2) };
  }
  asKV(): KVNamespace {
    return this as unknown as KVNamespace;
  }
}
