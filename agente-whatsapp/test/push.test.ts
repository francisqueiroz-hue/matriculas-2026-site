import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { notificarDono, salvarAssinatura } from "../src/push";
import type { Env } from "../src/tipos";

const sub = (n: number) => ({ endpoint: `https://push.exemplo/${n}`, keys: { p256dh: "p", auth: "a" } });
const env = { VAPID_PUBLIC_KEY: "x", VAPID_PRIVATE_KEY: "y", VAPID_SUBJECT: "mailto:a@b.c", TEMPLATE_AVISO_EQUIPE: "aviso_equipe", WHATSAPP_INTERNO_PHONE_NUMBER_ID: "222", WHATSAPP_INTERNO_API_TOKEN: "t", TELEFONE_ESCOLA: "5521999990000" } as Env;

describe("notificarDono", () => {
  it("envia 1 push por assinatura e remove a expirada (410)", async () => {
    const db = sqliteDb();
    await salvarAssinatura(db, sub(1));
    await salvarAssinatura(db, sub(2));
    const enviados: string[] = [];
    await notificarDono(env, db, { titulo: "t", corpo: "c", url: "/u", prioridade: "normal" }, {
      enviarPush: async (s) => { enviados.push(s.endpoint); return s.endpoint.endsWith("/2") ? 410 : 201; },
      fetch: (async () => { throw new Error("não deve chamar WhatsApp"); }) as unknown as typeof fetch,
    });
    expect(enviados).toHaveLength(2);
    expect((await db.all("SELECT * FROM assinaturas_push")).length).toBe(1);
  });
  it("só prioridade urgente dispara o modelo de WhatsApp pelo número interno", async () => {
    const db = sqliteDb();
    const corpos: any[] = [];
    const f = (async (_u: string, init: RequestInit) => { corpos.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ messages: [{ id: "w" }] })); }) as unknown as typeof fetch;
    const deps = { enviarPush: async () => 201, fetch: f };
    await notificarDono(env, db, { titulo: "t", corpo: "c", url: "/u", prioridade: "normal" }, deps);
    expect(corpos).toHaveLength(0);
    await notificarDono(env, db, { titulo: "Urgente", corpo: "Risco", url: "/u", prioridade: "urgente" }, deps);
    expect(corpos).toHaveLength(1);
    expect(corpos[0]).toMatchObject({ to: "5521999990000", type: "template", template: { name: "aviso_equipe" } });
  });
  it("assinatura repetida não duplica", async () => {
    const db = sqliteDb();
    await salvarAssinatura(db, sub(1));
    await salvarAssinatura(db, sub(1));
    expect((await db.all("SELECT * FROM assinaturas_push")).length).toBe(1);
  });
});
