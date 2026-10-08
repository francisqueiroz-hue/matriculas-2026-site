import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";

describe("sqliteDb", () => {
  it("aplica a migração e permite inserir e ler", async () => {
    const db = sqliteDb();
    await db.run("INSERT INTO base (pergunta, resposta, aprovado) VALUES (?, ?, 1)", ["Quando abre a matrícula?", "Em outubro."]);
    const linha = await db.first<{ resposta: string }>("SELECT resposta FROM base WHERE aprovado = 1");
    expect(linha?.resposta).toBe("Em outubro.");
  });

  it("base_fts casa palavras sem diferenciar acento", async () => {
    const db = sqliteDb();
    await db.run("INSERT INTO base_fts (rowid, pergunta, resposta) VALUES (1, ?, ?)", ["Matrícula 2027", "Abertas"]);
    const achados = await db.all("SELECT rowid FROM base_fts WHERE base_fts MATCH ?", ["matricula"]);
    expect(achados).toHaveLength(1);
  });
});
