import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { apagarAntigas, assumir, definirLiaLigada, devolver, historico, liaLigada, liaPausada, listarConversas, registrarEco, registrarMensagem } from "../src/conversa";

const T = "5521988887777";
const H = 3600_000;

describe("conversas", () => {
  it("eco do app grava 'humano' e pausa a Lia por 12h", async () => {
    const db = sqliteDb();
    const t0 = new Date("2026-10-20T12:00:00Z");
    await registrarEco(db, { para: "552188887777", wamid: "e1", texto: "Já te respondo", ts: t0.getTime() / 1000 }, 12, t0);
    expect((await historico(db, T))[0]).toMatchObject({ direcao: "humano", texto: "Já te respondo" });
    expect(await liaPausada(db, T, new Date(t0.getTime() + 11 * H))).toBe(true);
    expect(await liaPausada(db, T, new Date(t0.getTime() + 13 * H))).toBe(false);
  });
  it("eco de mensagem que a própria Lia enviou não pausa", async () => {
    const db = sqliteDb();
    await registrarMensagem(db, { telefone: T, direcao: "lia", texto: "Oi", wamid: "w-lia" });
    await registrarEco(db, { para: T, wamid: "w-lia", texto: "Oi", ts: 1 });
    expect(await liaPausada(db, T)).toBe(false);
  });
  it("devolver encerra a pausa; assumir inicia", async () => {
    const db = sqliteDb();
    await assumir(db, T);
    expect(await liaPausada(db, T)).toBe(true);
    await devolver(db, T);
    expect(await liaPausada(db, T)).toBe(false);
  });
  it("chave geral liga e desliga a Lia", async () => {
    const db = sqliteDb();
    expect(await liaLigada(db)).toBe(true);
    await definirLiaLigada(db, false);
    expect(await liaLigada(db)).toBe(false);
    await definirLiaLigada(db, true);
    expect(await liaLigada(db)).toBe(true);
  });
  it("lista conversas com a última mensagem e chamados abertos", async () => {
    const db = sqliteDb();
    await registrarMensagem(db, { telefone: T, direcao: "entrada", texto: "Oi", ts: 1000 });
    await registrarMensagem(db, { telefone: T, direcao: "lia", texto: "Olá!", ts: 2000 });
    await db.run("INSERT INTO chamados (telefone, categoria, prioridade, resumo, criado_em) VALUES (?, 'saude', 'alta', 'x', 1)", [T]);
    const [c] = await listarConversas(db);
    expect(c).toMatchObject({ telefone: T, ultima: "Olá!", chamadosAbertos: 1, humano: false });
  });
  it("apaga só mensagens com mais de 90 dias", async () => {
    const db = sqliteDb();
    const agora = new Date("2026-10-20T00:00:00Z");
    await registrarMensagem(db, { telefone: T, direcao: "entrada", texto: "velha", ts: agora.getTime() - 91 * 24 * H });
    await registrarMensagem(db, { telefone: T, direcao: "entrada", texto: "nova", ts: agora.getTime() - 10 * 24 * H });
    expect(await apagarAntigas(db, 90, agora)).toBe(1);
    expect((await historico(db, T)).map((m) => m.texto)).toEqual(["nova"]);
  });
});
