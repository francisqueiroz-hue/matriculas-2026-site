import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";

export interface AvisoPush {
  title: string;
  body: string;
  url?: string;
}

export interface ResultadoPush {
  /** Aparelhos com token cadastrado. */
  aparelhos: number;
  enviados: number;
  /** Códigos de erro do FCM (ex.: messaging/invalid-argument), para diagnóstico. */
  erros: string[];
}

/** Erros que significam "este aparelho não recebe mais" — só esses apagam o token. */
const TOKEN_INVALIDO = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

/**
 * Endereço público do app (https://...). O FCM exige link absoluto em HTTPS para o clique
 * na notificação — com caminho relativo ("/dashboard/...") ele recusa o envio inteiro.
 * APP_URL tem prioridade; na Vercel, o domínio de produção vem de VERCEL_PROJECT_PRODUCTION_URL.
 */
export function origemPublica(env: Record<string, string | undefined> = process.env): string | null {
  const bruto = env.APP_URL?.trim() || env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!bruto) return null;
  const comProtocolo = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
  try {
    const url = new URL(comProtocolo);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** Monta a mensagem para o FCM (separada para teste). */
export function montarMensagemPush(tokens: string[], aviso: AvisoPush, origem: string | null): MulticastMessage {
  const link = aviso.url ? (/^https:\/\//i.test(aviso.url) ? aviso.url : origem ? new URL(aviso.url, origem).href : null) : null;
  return {
    tokens,
    notification: { title: aviso.title, body: aviso.body },
    webpush: {
      // Urgency high: o iPhone/Android entrega na hora, mesmo com o aparelho em repouso.
      headers: { Urgency: "high", TTL: String(3 * 24 * 60 * 60) },
      notification: origem ? { icon: `${origem}/icons/icon-192.png`, badge: `${origem}/icons/icon-192.png` } : undefined,
      ...(link && { fcmOptions: { link } }),
    },
    ...(aviso.url && { data: { url: aviso.url } }),
  };
}

/** Envia notificação push para os aparelhos de um conjunto de usuários. No-op silencioso se o Firebase não estiver configurado. */
export async function notifyUsers(userIds: string[], aviso: AvisoPush): Promise<ResultadoPush> {
  const vazio: ResultadoPush = { aparelhos: 0, enviados: 0, erros: [] };
  const app = getFirebaseAdminApp();
  if (!app || userIds.length === 0) return vazio;

  const tokens = await prisma.pushToken.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, token: true },
  });
  if (tokens.length === 0) return vazio;

  const response = await getMessaging(app).sendEachForMulticast(
    montarMensagemPush(
      tokens.map((t) => t.token),
      aviso,
      origemPublica(),
    ),
  );

  const erros: string[] = [];
  const invalidos: string[] = [];
  response.responses.forEach((res, i) => {
    if (res.success) return;
    const codigo = res.error?.code ?? "desconhecido";
    erros.push(codigo);
    if (TOKEN_INVALIDO.has(codigo)) invalidos.push(tokens[i].id);
  });
  if (erros.length > invalidos.length) console.error("Falha no envio de push", erros);
  if (invalidos.length > 0) await prisma.pushToken.deleteMany({ where: { id: { in: invalidos } } });

  return { aparelhos: tokens.length, enviados: response.successCount, erros };
}
