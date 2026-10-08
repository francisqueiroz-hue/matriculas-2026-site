import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "../src/db";

/** Banco em memória com as migrações reais aplicadas — só para testes. */
export function sqliteDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  const dir = join(import.meta.dirname, "..", "migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(join(dir, f), "utf8"));
  }
  type P = import("node:sqlite").SQLInputValue;
  return {
    async all<T>(sql: string, p: unknown[] = []) {
      return sqlite.prepare(sql).all(...(p as P[])) as T[];
    },
    async first<T>(sql: string, p: unknown[] = []) {
      return (sqlite.prepare(sql).get(...(p as P[])) as T | undefined) ?? null;
    },
    async run(sql: string, p: unknown[] = []) {
      const r = sqlite.prepare(sql).run(...(p as P[]));
      return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
    },
  };
}
