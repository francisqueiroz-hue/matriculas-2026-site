import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gerarSqlSemente } from "../scripts/semear-base";

function banco() {
  const db = new DatabaseSync(":memory:");
  const dir = join(import.meta.dirname, "..", "migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
  return db;
}
const contar = (db: DatabaseSync, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe("semear a base", () => {
  it("rodar de novo não duplica nem apaga o que o dono aprovou depois", () => {
    const db = banco();
    const sql = gerarSqlSemente();
    db.exec(sql);
    const total = contar(db, "SELECT COUNT(*) AS n FROM base");
    expect(total).toBeGreaterThan(5);
    db.exec("INSERT INTO base (id, pergunta, resposta, aprovado) VALUES (9999, 'Tem natação?', 'Sim, às terças.', 1)");
    db.exec("INSERT INTO base_fts (rowid, pergunta, resposta) VALUES (9999, 'Tem natação?', 'Sim, às terças.')");
    db.exec(sql);
    expect(contar(db, "SELECT COUNT(*) AS n FROM base")).toBe(total + 1);
    expect(contar(db, "SELECT COUNT(*) AS n FROM base WHERE pergunta = 'Tem natação?'")).toBe(1);
    expect(contar(db, "SELECT COUNT(*) AS n FROM base_fts")).toBe(total + 1);
  });
  it("uma resposta alterada nos arquivos atualiza o item semeado e a busca (FTS)", () => {
    const db = banco();
    db.exec(gerarSqlSemente());
    db.exec("UPDATE base SET resposta = 'texto antigo' WHERE pergunta LIKE 'Qual o horário de funcionamento%'");
    db.exec(gerarSqlSemente());
    const r = db.prepare("SELECT resposta FROM base WHERE pergunta LIKE 'Qual o horário de funcionamento%'").get() as { resposta: string };
    expect(r.resposta).toContain("segunda a sexta");
    expect(contar(db, "SELECT COUNT(*) AS n FROM base_fts WHERE base_fts MATCH 'funcionamento'")).toBe(1);
  });
  it("itens A_PREENCHER não são semeados e aspas simples não quebram o SQL", () => {
    expect(gerarSqlSemente()).not.toContain("A_PREENCHER");
    const db = banco();
    expect(() => db.exec(gerarSqlSemente())).not.toThrow();
  });
});
