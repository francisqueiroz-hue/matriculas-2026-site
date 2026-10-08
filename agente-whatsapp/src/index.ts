import { d1Db, type Db } from "./db";
import { processarEcos, processarTurno, type Deps } from "./fluxo";
import { apagarAntigas } from "./conversa";
import { gerarSugestoes } from "./aprendizado";
import { escolherProvedor } from "./provedor";
import { tratarMcp } from "./mcp";
import { tratarPainel } from "./painel";
import type { Env } from "./tipos";
import { extrairEcos, extrairMensagens, verificarAssinatura, verificarDesafio } from "./webhook";

export interface OpcoesApp extends Deps {
  db?: Db;
}

/** Fábrica do Worker; os testes injetam banco, provedor e fetch falsos. */
export function criarApp(opcoes: OpcoesApp = {}) {
  const obterDb = (env: Env) => opcoes.db ?? d1Db(env.DB);
  return {
    async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
      const url = new URL(req.url);
      if (url.pathname === "/webhook") {
        if (req.method === "GET") {
          const desafio = verificarDesafio(url.searchParams, env.WHATSAPP_VERIFY_TOKEN);
          return desafio ? new Response(desafio) : new Response("verificação falhou", { status: 403 });
        }
        if (req.method !== "POST") return new Response("método não permitido", { status: 405 });
        const corpo = await req.text();
        if (!(await verificarAssinatura(corpo, req.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET))) {
          return new Response("assinatura inválida", { status: 401 });
        }
        let payload: unknown;
        try {
          payload = JSON.parse(corpo);
        } catch {
          return new Response("json inválido", { status: 400 });
        }
        const db = obterDb(env);
        const ecos = extrairEcos(payload, env.WHATSAPP_PHONE_NUMBER_ID);
        const msgs = extrairMensagens(payload, env.WHATSAPP_PHONE_NUMBER_ID);
        // 200 imediato (a Meta reenvia se demorar); o trabalho segue em segundo plano.
        ctx.waitUntil((async () => {
          if (ecos.length) await processarEcos(db, ecos);
          if (msgs.length) await processarTurno(env, db, msgs, opcoes);
        })().catch((e) => console.error("webhook falhou", (e as Error).message)));
        return new Response("ok");
      }
      if (url.pathname === "/mcp") return tratarMcp(req, env, obterDb(env));
      if (url.pathname === "/painel" || url.pathname.startsWith("/painel/")) return tratarPainel(req, env, obterDb(env));
      return new Response("não encontrado", { status: 404 });
    },
    async scheduled(_evento: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
      const db = obterDb(env);
      ctx.waitUntil((async () => {
        await apagarAntigas(db);
        await gerarSugestoes(db, opcoes.provedor ?? escolherProvedor(env), new Date(Date.now() - 7 * 24 * 3600_000));
      })().catch((e) => console.error("cron falhou", (e as Error).message)));
    },
  };
}

export default criarApp();
