import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import type { Db } from "./db";
import type { Env } from "./tipos";
import { enviarModelo } from "./whatsapp";

export interface Notificacao {
  titulo: string;
  corpo: string;
  url: string;
  prioridade: string;
}
export type EnviarPush = (sub: PushSubscription, mensagem: string) => Promise<number>;

export async function salvarAssinatura(db: Db, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  await db.run(
    "INSERT INTO assinaturas_push (endpoint, chaves, criado_em) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET chaves = excluded.chaves",
    [sub.endpoint, JSON.stringify(sub.keys), Date.now()],
  );
}

function pushReal(env: Env): EnviarPush {
  return async (sub, mensagem) => {
    const vapid = { subject: env.VAPID_SUBJECT ?? "mailto:contato@example.com", publicKey: env.VAPID_PUBLIC_KEY ?? "", privateKey: env.VAPID_PRIVATE_KEY ?? "" };
    const payload = await buildPushPayload({ data: mensagem, options: { ttl: 3600 } }, sub, vapid);
    return (await fetch(sub.endpoint, payload)).status;
  };
}

/**
 * Avisa o dono por Web Push (gratuito). Só prioridade urgente também manda o modelo aprovado de
 * WhatsApp ao celular da escola pelo número interno, porque modelo fora da janela de 24h é cobrado.
 */
export async function notificarDono(env: Env, db: Db, n: Notificacao, deps: { enviarPush?: EnviarPush; fetch?: typeof fetch } = {}): Promise<void> {
  const enviar = deps.enviarPush ?? pushReal(env);
  const subs = await db.all<{ id: number; endpoint: string; chaves: string }>("SELECT id, endpoint, chaves FROM assinaturas_push");
  const mensagem = JSON.stringify({ titulo: n.titulo, corpo: n.corpo, url: n.url });
  for (const s of subs) {
    try {
      const status = await enviar({ endpoint: s.endpoint, expirationTime: null, keys: JSON.parse(s.chaves) }, mensagem);
      if (status === 404 || status === 410) await db.run("DELETE FROM assinaturas_push WHERE id = ?", [s.id]);
    } catch (e) {
      console.error("push falhou", (e as Error).message);
    }
  }
  if (n.prioridade === "urgente" && env.TEMPLATE_AVISO_EQUIPE && env.TELEFONE_ESCOLA) {
    await enviarModelo(env, env.TELEFONE_ESCOLA, env.TEMPLATE_AVISO_EQUIPE, [`${n.titulo}: ${n.corpo}`], deps.fetch).catch((e) => console.error("aviso WhatsApp falhou", (e as Error).message));
  }
}
