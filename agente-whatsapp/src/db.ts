/** Camada mínima sobre o banco: o Worker usa D1; os testes usam node:sqlite com a mesma interface. */
export interface Db {
  all<T = Record<string, unknown>>(sql: string, p?: unknown[]): Promise<T[]>;
  first<T = Record<string, unknown>>(sql: string, p?: unknown[]): Promise<T | null>;
  run(sql: string, p?: unknown[]): Promise<{ changes: number; lastId: number }>;
}

export function d1Db(d: D1Database): Db {
  return {
    async all<T>(sql: string, p: unknown[] = []) {
      const r = await d.prepare(sql).bind(...p).all<T>();
      return r.results;
    },
    async first<T>(sql: string, p: unknown[] = []) {
      return (await d.prepare(sql).bind(...p).first<T>()) ?? null;
    },
    async run(sql: string, p: unknown[] = []) {
      const r = await d.prepare(sql).bind(...p).run();
      return { changes: r.meta.changes ?? 0, lastId: r.meta.last_row_id ?? 0 };
    },
  };
}
