import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { buscar } from "../src/conhecimento";
import { abrirChamado, decidirSugestao, listarChamados, listarSugestoes, resolverChamado } from "../src/fila";

describe("fila", () => {
  it("chamado criado aparece como aberto e some ao resolver", async () => {
    const db = sqliteDb();
    const id = await abrirChamado(db, { telefone: "5521988887777", categoria: "cobranca", prioridade: "normal", resumo: "Mensalidade", rascunho: "Olá…" });
    expect((await listarChamados(db, "aberto")).map((c) => c.id)).toEqual([id]);
    await resolverChamado(db, id);
    expect(await listarChamados(db, "aberto")).toEqual([]);
  });
  it("aprovar sugestão publica na base (com a resposta editada) e rejeitar não publica", async () => {
    const db = sqliteDb();
    const a = (await db.run("INSERT INTO sugestoes (pergunta, resposta, frequencia) VALUES ('Tem uniforme?', 'Sim.', 4)")).lastId;
    const b = (await db.run("INSERT INTO sugestoes (pergunta, resposta, frequencia) VALUES ('Tem piscina?', 'Sim.', 3)")).lastId;
    expect(await listarSugestoes(db)).toHaveLength(2);
    expect(await buscar(db, "uniforme")).toEqual([]);
    await decidirSugestao(db, a, true, "Sim, o uniforme é obrigatório.");
    await decidirSugestao(db, b, false);
    expect((await buscar(db, "uniforme"))[0].resposta).toBe("Sim, o uniforme é obrigatório.");
    expect(await buscar(db, "piscina")).toEqual([]);
    expect(await listarSugestoes(db)).toEqual([]);
  });
});
