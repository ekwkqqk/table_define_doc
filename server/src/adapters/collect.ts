import type { TableMeta, TableRef } from "../types.js";

export interface CollectFailure {
  schema: string;
  name: string;
  error: string;
}

export interface CollectResult {
  tables: TableMeta[];
  failures: CollectFailure[];
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => run()));
  return results;
}

export async function collectTablesWithWorker(
  refs: TableRef[],
  concurrency: number,
  worker: (ref: TableRef) => Promise<TableMeta>,
): Promise<CollectResult> {
  const tables: TableMeta[] = [];
  const failures: CollectFailure[] = [];

  await mapLimit(refs, concurrency, async (ref) => {
    try {
      tables.push(await worker(ref));
    } catch (e) {
      failures.push({
        schema: ref.schema,
        name: ref.name,
        error: e instanceof Error ? e.message : "수집 실패",
      });
    }
  });

  // keep selection order
  const order = new Map(refs.map((r, i) => [`${r.schema}.${r.name}`, i]));
  tables.sort(
    (a, b) =>
      (order.get(`${a.schema}.${a.name}`) ?? 0) - (order.get(`${b.schema}.${b.name}`) ?? 0),
  );

  return { tables, failures };
}
