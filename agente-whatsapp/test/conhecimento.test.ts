import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { adicionar, aprovar, buscar, lerArquivoBase } from "../src/conhecimento";

describe("base de conhecimento", () => {
  it("acha item aprovado ignorando acento, caixa e plural", async () => {
    const db = sqliteDb();
    await adicionar(db, "Quando começam as matrículas?", "Em outubro.", true);
    const r = await buscar(db, "QUANDO começa a matricula?");
    expect(r).toHaveLength(1);
    expect(r[0].resposta).toBe("Em outubro.");
  });
  it("item não aprovado nunca volta, até ser aprovado", async () => {
    const db = sqliteDb();
    const id = await adicionar(db, "Tem uniforme?", "Sim.", false);
    expect(await buscar(db, "uniforme")).toEqual([]);
    await aprovar(db, id);
    expect(await buscar(db, "uniforme")).toHaveLength(1);
  });
  it("consulta com aspas e operadores FTS não lança", async () => {
    const db = sqliteDb();
    await adicionar(db, "Tem quadra?", "Sim.", true);
    for (const q of ['"quadra', "quadra NEAR/2 x", "quad*", "AND OR NOT", "'; DROP TABLE base;--"]) {
      await expect(buscar(db, q)).resolves.toBeDefined();
    }
  });
  it("consulta vazia ou só de palavras comuns devolve []", async () => {
    const db = sqliteDb();
    await adicionar(db, "Tem quadra?", "Sim.", true);
    expect(await buscar(db, "")).toEqual([]);
    expect(await buscar(db, "o que é que a de")).toEqual([]);
  });
  it("respeita o limite de resultados", async () => {
    const db = sqliteDb();
    for (let i = 0; i < 6; i++) await adicionar(db, `Pergunta sobre visita ${i}`, "R", true);
    expect(await buscar(db, "visita", 4)).toHaveLength(4);
  });
  it("lerArquivoBase separa perguntas e respostas", () => {
    expect(lerArquivoBase("## P1?\nR1 linha1\nlinha2\n\n## P2?\nR2\n")).toEqual([
      { pergunta: "P1?", resposta: "R1 linha1\nlinha2" },
      { pergunta: "P2?", resposta: "R2" },
    ]);
  });
  it("a semente não contém dados pessoais (telefone, CPF, e-mail)", () => {
    const dir = join(__dirname, "..", "conhecimento");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
      const t = readFileSync(join(dir, f), "utf8");
      expect(t, f).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
      expect(t, f).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(t, f).not.toMatch(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/);
    }
  });
});
