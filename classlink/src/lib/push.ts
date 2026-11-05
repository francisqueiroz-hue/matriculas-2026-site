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

/**
 * Mesma "etiqueta" do aviso que o painel mostra (AvisosMensagens): o aviso de mensagem nova
 * substitui o anterior em vez de aparecer duas vezes (push + painel) ou empilhar.
 */
export const TAG_AVISO_MENSAGENS = "classlink-mensagens";

function ehLinkDeMensagens(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url, "https://x.invalid").pathname.startsWith("/dashboard/mensagens");
  } catch {
    return false;
  }
}

/** Monta a mensagem para o FCM (separada para teste). */
export function montarMensagemPush(tokens: string[], aviso: AvisoPush, origem: string | null): MulticastMessage {
  const link = aviso.url ? (/^https:\/\//i.test(aviso.url) ? aviso.url : origem ? new URL(aviso.url, origem).href : null) : null;
  const notificacaoWeb = {
    ...(origem && { icon: `${origem}/icons/icon-192.png`, badge: `${origem}/icons/icon-192.png` }),
    // renotify: cada mensagem nova toca/vibra, mesmo substituindo o aviso anterior.
    ...(ehLinkDeMensagens(aviso.url) && { tag: TAG_AVISO_MENSAGENS, renotify: true }),
  };
  return {
    tokens,
    notification: { title: aviso.title, body: aviso.body },
    webpush: {
      // Urgency high: o iPhone/Android entrega na hora, mesmo com o aparelho em repouso.
      headers: { Urgency: "high", TTL: String(3 * 24 * 60 * 60) },
      notification: Object.keys(notificacaoWeb).length > 0 ? notificacaoWeb : undefined,
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
    select: { id: true, token: true, aparelho: true },
  });
  if (tokens.length === 0) {
    console.info("[push] nenhum aparelho registrado", { titulo: aviso.title, userIds });
    return vazio;
  }

  const response = await getMessaging(app).sendEachForMulticast(
    montarMensagemPush(
      tokens.map((t) => t.token),
      aviso,
      origemPublica(),
    ),
  );

  const erros: string[] = [];
  const invalidos: string[] = [];
  const aceitos: string[] = [];
  const falhas: { id: string; erro: string }[] = [];
  response.responses.forEach((res, i) => {
    if (res.success) {
      aceitos.push(tokens[i].id);
      return;
    }
    const codigo = res.error?.code ?? "desconhecido";
    const erro = res.error?.message ? `${codigo}: ${res.error.message}` : codigo;
    erros.push(erro);
    if (TOKEN_INVALIDO.has(codigo)) invalidos.push(tokens[i].id);
    else falhas.push({ id: tokens[i].id, erro: erro.slice(0, 300) });
  });

  // Um registro por envio, com o resultado de cada aparelho: é o que permite saber, quando
  // alguém diz "não chegou no celular", se o aviso saiu do servidor para aquele aparelho.
  console.info("[push] envio", {
    titulo: aviso.title,
    userIds,
    aparelhos: tokens.map((t, i) => `${t.aparelho ?? "?"}: ${response.responses[i]?.success ? "aceito" : (response.responses[i]?.error?.code ?? "erro")}`),
  });
  if (erros.length > invalidos.length) console.error("Falha no envio de push", erros);

  // Diagnóstico por aparelho (Minha conta). Falha aqui não pode atrapalhar o envio.
  const agora = new Date();
  await Promise.all([
    aceitos.length > 0
      ? prisma.pushToken.updateMany({ where: { id: { in: aceitos } }, data: { ultimoEnvioEm: agora, ultimoErro: null } })
      : null,
    ...falhas.map((f) => prisma.pushToken.update({ where: { id: f.id }, data: { ultimoErro: f.erro } })),
  ]).catch((err) => console.error("[push] falha ao registrar o diagnóstico do envio", err));

  if (invalidos.length > 0) {
    // Aparelho que deixou de aceitar push (ex.: iPhone que cancelou a inscrição). Fica no log
    // para o diagnóstico: o aparelho volta a receber quando a pessoa abre o app nele de novo.
    console.warn(`Push: ${invalidos.length} aparelho(s) não aceitam mais avisos; registro removido`, {
      userIds,
      aparelhos: tokens.filter((t) => invalidos.includes(t.id)).map((t) => t.aparelho ?? "?"),
    });
    await prisma.pushToken.deleteMany({ where: { id: { in: invalidos } } });
  }

  return { aparelhos: tokens.length, enviados: response.successCount, erros };
}
