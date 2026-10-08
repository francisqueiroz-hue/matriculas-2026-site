import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { buscar } from "../src/conhecimento";
import { liaLigada, liaPausada, registrarMensagem } from "../src/conversa";
import { tratarPainel } from "../src/painel";
import { gerarModuloPainel } from "../scripts/gerar-painel";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "../src/tipos";

const env = { LIMITE_MENSAGENS_MES: "900", VAPID_PUBLIC_KEY: "pub" } as Env;
const logado = async () => ({ email: "dono@escola.com" });
const anonimo = async () => null;

const chamar = (db: ReturnType<typeof sqliteDb>, caminho: string, init: { method?: string; corpo?: unknown; validar?: typeof logado | typeof anonimo } = {}) =>
  tratarPainel(
    new Request(`https://x${caminho}`, { method: init.method ?? "GET", headers: { "content-type": "application/json" }, body: init.corpo ? JSON.stringify(init.corpo) : undefined }),
    env, db, { validar: init.validar ?? logado },
  );

describe("painel — API protegida", () => {
  it("sem acesso válido toda rota da API responde 401", async () => {
    const db = sqliteDb();
    for (const [m, c] of [["GET", "/painel/api/resumo"], ["GET", "/painel/api/conversas"], ["POST", "/painel/api/lia"], ["GET", "/painel/api/chamados"], ["POST", "/painel/api/base"]]) {
      expect((await chamar(db, c, { method: m, corpo: m === "POST" ? {} : undefined, validar: anonimo })).status, c).toBe(401);
    }
  });
  it("POST sem content-type JSON é recusado (proteção contra formulário de outro site)", async () => {
    const db = sqliteDb();
    const r = await tratarPainel(new Request("https://x/painel/api/lia", { method: "POST", headers: { "content-type": "text/plain" }, body: '{"ligada":false}' }), env, db, { validar: logado });
    expect(r.status).toBe(415);
    expect(await liaLigada(db)).toBe(true);
  });
  it("resumo traz uso, limite, chamados abertos e estado da Lia", async () => {
    const db = sqliteDb();
    await db.run("INSERT INTO chamados (telefone, categoria, prioridade, resumo, criado_em) VALUES ('5521988887777','saude','alta','x',1)");
    const r: any = await (await chamar(db, "/painel/api/resumo")).json();
    expect(r).toMatchObject({ limiteMensagens: 900, chamadosAbertos: 1, liaLigada: true, vapidPublicKey: "pub" });
  });
  it("chave geral desliga a Lia; assumir e devolver mudam a pausa", async () => {
    const db = sqliteDb();
    await chamar(db, "/painel/api/lia", { method: "POST", corpo: { ligada: false } });
    expect(await liaLigada(db)).toBe(false);
    await chamar(db, "/painel/api/conversas/5521988887777/assumir", { method: "POST", corpo: {} });
    expect(await liaPausada(db, "5521988887777")).toBe(true);
    await chamar(db, "/painel/api/conversas/5521988887777/devolver", { method: "POST", corpo: {} });
    expect(await liaPausada(db, "5521988887777")).toBe(false);
  });
  it("histórico só devolve mensagens do telefone pedido", async () => {
    const db = sqliteDb();
    await registrarMensagem(db, { telefone: "5521988887777", direcao: "entrada", texto: "da família A" });
    await registrarMensagem(db, { telefone: "5521955554444", direcao: "entrada", texto: "da família B" });
    const r: any = await (await chamar(db, "/painel/api/conversas/5521988887777")).json();
    expect(JSON.stringify(r)).toContain("família A");
    expect(JSON.stringify(r)).not.toContain("família B");
  });
  it("resolver chamado, decidir sugestão e editar a base", async () => {
    const db = sqliteDb();
    const c = (await db.run("INSERT INTO chamados (telefone, categoria, prioridade, resumo, criado_em) VALUES ('5521988887777','x','normal','y',1)")).lastId;
    await chamar(db, `/painel/api/chamados/${c}/resolver`, { method: "POST", corpo: {} });
    expect(((await (await chamar(db, "/painel/api/chamados?status=aberto")).json()) as unknown[]).length).toBe(0);
    const s = (await db.run("INSERT INTO sugestoes (pergunta, resposta, frequencia) VALUES ('Tem uniforme?', 'rascunho', 3)")).lastId;
    await chamar(db, `/painel/api/sugestoes/${s}/decidir`, { method: "POST", corpo: { aprovar: true, resposta: "Sim, é obrigatório." } });
    expect((await buscar(db, "uniforme"))[0].resposta).toBe("Sim, é obrigatório.");
    await chamar(db, "/painel/api/base", { method: "POST", corpo: { pergunta: "Tem quadra?", resposta: "Sim." } });
    expect(await buscar(db, "quadra")).toHaveLength(1);
  });
  it("assinatura de push é guardada", async () => {
    const db = sqliteDb();
    await chamar(db, "/painel/api/push", { method: "POST", corpo: { endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" } } });
    expect(await db.all("SELECT * FROM assinaturas_push")).toHaveLength(1);
  });
  it("corpo inválido devolve 400 e rota desconhecida 404", async () => {
    const db = sqliteDb();
    expect((await chamar(db, "/painel/api/base", { method: "POST", corpo: { pergunta: "" } })).status).toBe(400);
    expect((await chamar(db, "/painel/api/nada")).status).toBe(404);
  });
});

describe("painel — páginas", () => {
  it("serve a página, o manifest e o service worker sem exigir login (não têm dados)", async () => {
    const db = sqliteDb();
    for (const [c, tipo] of [["/painel", "text/html"], ["/painel/", "text/html"], ["/painel/manifest.json", "application/manifest+json"], ["/painel/sw.js", "text/javascript"]]) {
      const r = await chamar(db, c, { validar: anonimo });
      expect(r.status, c).toBe(200);
      expect(r.headers.get("content-type")).toContain(tipo);
    }
  });
  it("src/painel-html.ts está em dia com painel/ (rode npm run gerar:painel)", () => {
    expect(readFileSync(join(__dirname, "..", "src", "painel-html.ts"), "utf8")).toBe(gerarModuloPainel());
  });
});
