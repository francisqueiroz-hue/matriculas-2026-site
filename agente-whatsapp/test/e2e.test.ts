import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { adicionar } from "../src/conhecimento";
import { criarApp } from "../src/index";
import { provedorFake, type Requisicao } from "../src/provedor";
import { registrarEco } from "../src/conversa";
import type { Env } from "../src/tipos";

const PUBLICO = "111";
const env = {
  WHATSAPP_APP_SECRET: "segredo", WHATSAPP_VERIFY_TOKEN: "v", WHATSAPP_API_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: PUBLICO,
  LIMITE_MENSAGENS_MES: "900", TELEFONE_CLASSLINK: "(21) 99286-5778", MCP_TOKEN: "m",
} as Env;

function montar(opcoes: { limite?: string; espera?: number } = {}) {
  const db = sqliteDb();
  const envios: any[] = [];
  const fetchFalso = (async (_u: string, init: RequestInit) => {
    const corpo = JSON.parse(String(init.body));
    envios.push(corpo);
    return new Response(JSON.stringify({ messages: [{ id: `wamid.out${envios.length}` }] }));
  }) as unknown as typeof fetch;
  const provedor = provedorFake((req: Requisicao) =>
    req.json
      ? { texto: '{"categoria":null,"risco":"baixo","confianca":0.95}', chamadas: [], tokens: 0 }
      : { texto: "As matrículas estão abertas para 2027.", chamadas: [], tokens: 12 });
  const app = criarApp({ db, provedor, fetch: fetchFalso, espera: opcoes.espera ?? 0 });
  const e = { ...env, ...(opcoes.limite ? { LIMITE_MENSAGENS_MES: opcoes.limite } : {}) } as Env;
  const pendentes: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pendentes.push(p) };
  const enviarWebhook = async (payload: unknown, assinaturaValida = true) => {
    const corpo = JSON.stringify(payload);
    const assinatura = "sha256=" + createHmac("sha256", assinaturaValida ? "segredo" : "outro").update(corpo).digest("hex");
    const r = await app.fetch(new Request("https://x/webhook", { method: "POST", headers: { "x-hub-signature-256": assinatura }, body: corpo }), e, ctx);
    await Promise.all(pendentes.splice(0));
    return r;
  };
  return { db, envios, provedor, enviarWebhook, app, env: e };
}

const msg = (id: string, texto: string, de = "5521988887777", phoneId = PUBLICO) => ({
  entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneId }, messages: [{ id, from: de, timestamp: "1", type: "text", text: { body: texto } }] } }] }],
});
const midia = (id: string, tipo = "audio") => ({
  entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: PUBLICO }, messages: [{ id, from: "5521988887777", timestamp: "1", type: tipo }] } }] }],
});

describe("e2e do webhook", () => {
  it("assinatura inválida = 401 e nada acontece", async () => {
    const t = montar();
    expect((await t.enviarWebhook(msg("w1", "oi"), false)).status).toBe(401);
    expect(t.envios).toHaveLength(0);
  });

  it("pergunta trivial gera exatamente 1 envio, com apresentação na primeira vez", async () => {
    const t = montar();
    await adicionar(t.db, "Quando começam as matrículas?", "As matrículas 2027 estão abertas.", true);
    await t.enviarWebhook(msg("w1", "quando abrem as matrículas 2027?"));
    expect(t.envios).toHaveLength(1);
    expect(t.envios[0].text.body).toMatch(/Lia/);
    expect(t.envios[0].to).toBe("5521988887777");
  });

  it("mensalidade atrasada: só o acolhimento + 1 chamado, nenhuma resposta de conteúdo", async () => {
    const t = montar();
    await t.enviarWebhook(msg("w1", "estou com a mensalidade atrasada"));
    expect(t.envios).toHaveLength(1);
    expect(t.envios[0].text.body).toMatch(/equipe/);
    expect(t.envios[0].text.body).not.toMatch(/R\$/);
    expect(t.provedor.chamadas).toHaveLength(0);
    const chamados = await t.db.all<{ categoria: string; rascunho: string }>("SELECT categoria, rascunho FROM chamados");
    expect(chamados).toHaveLength(1);
    expect(chamados[0].categoria).toBe("cobranca");
    expect(chamados[0].rascunho).toBeTruthy();
  });

  it("áudio gera pedido de texto; insistência vira chamado", async () => {
    const t = montar();
    await t.enviarWebhook(midia("a1"));
    expect(t.envios[0].text.body).toMatch(/texto/);
    await t.enviarWebhook(midia("a2", "image"));
    expect(t.envios).toHaveLength(2);
    expect(await t.db.all("SELECT * FROM chamados WHERE categoria = 'midia'")).toHaveLength(1);
  });

  it("'ACESSO' orienta o canal do ClassLink e nunca envia senha", async () => {
    const t = montar();
    await t.enviarWebhook(msg("w1", "ACESSO"));
    expect(t.envios).toHaveLength(1);
    expect(t.envios[0].text.body).toMatch(/99286-5778/);
    expect(t.envios[0].text.body).toMatch(/não envio senhas/);
  });

  it("depois que a equipe responde pelo app (eco), a Lia não responde", async () => {
    const t = montar();
    await registrarEco(t.db, { para: "5521988887777", wamid: "e1", texto: "Já te respondo!", ts: Date.now() / 1000 });
    await t.enviarWebhook(msg("w1", "quando abrem as matrículas?"));
    expect(t.envios).toHaveLength(0);
    expect(t.provedor.chamadas).toHaveLength(0);
  });

  it("webhook com eco do app pausa a Lia", async () => {
    const t = montar();
    await t.enviarWebhook({ entry: [{ changes: [{ field: "smb_message_echoes", value: { metadata: { phone_number_id: PUBLICO }, message_echoes: [{ id: "e9", to: "5521988887777", timestamp: "5", type: "text", text: { body: "Olá" } }] } }] }] });
    await t.enviarWebhook(msg("w1", "oi"));
    expect(t.envios).toHaveLength(0);
  });

  it("chave geral desligada: a Lia não responde a ninguém", async () => {
    const t = montar();
    await t.db.run("INSERT INTO config (chave, valor) VALUES ('lia_ligada', '0')");
    await t.enviarWebhook(msg("w1", "oi"));
    expect(t.envios).toHaveLength(0);
  });

  it("limite mensal esgotado: não envia e abre chamado", async () => {
    const t = montar({ limite: "0" });
    await t.enviarWebhook(msg("w1", "quando abrem as matrículas?"));
    expect(t.envios).toHaveLength(0);
    expect(await t.db.all("SELECT * FROM chamados WHERE categoria = 'limite_mensagens'")).toHaveLength(1);
  });

  it("mensagem de outro phone_number_id (número interno) é ignorada", async () => {
    const t = montar();
    await t.enviarWebhook(msg("w1", "ACESSO", "5521988887777", "999"));
    expect(t.envios).toHaveLength(0);
    expect(await t.db.all("SELECT * FROM mensagens")).toHaveLength(0);
  });

  it("reentrega do mesmo wamid não responde duas vezes", async () => {
    const t = montar();
    await adicionar(t.db, "Quando começam as matrículas?", "As matrículas 2027 estão abertas.", true);
    await t.enviarWebhook(msg("w1", "quando abrem as matrículas 2027?"));
    await t.enviarWebhook(msg("w1", "quando abrem as matrículas 2027?"));
    expect(t.envios).toHaveLength(1);
  });

  it("rajada: 3 webhooks quase simultâneos da mesma pessoa geram uma única resposta", async () => {
    const t = montar({ espera: 60 });
    await adicionar(t.db, "Quando começam as matrículas?", "As matrículas 2027 estão abertas.", true);
    await Promise.all([
      t.enviarWebhook(msg("r1", "oi")),
      t.enviarWebhook(msg("r2", "queria saber das matrículas")),
      t.enviarWebhook(msg("r3", "quando abrem as matrículas 2027?")),
    ]);
    expect(t.envios).toHaveLength(1);
  });

  it("GET do webhook responde o desafio da Meta", async () => {
    const t = montar();
    const r = await t.app.fetch(new Request("https://x/webhook?hub.mode=subscribe&hub.verify_token=v&hub.challenge=abc"), t.env, { waitUntil() {} });
    expect(await r.text()).toBe("abc");
  });
});
