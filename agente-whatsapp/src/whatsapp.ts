import type { Env } from "./tipos";

/** Base da Graph API; WHATSAPP_API_URL permite apontar para um simulador (mesmo padrão do ClassLink). */
export function baseApi(env: Pick<Env, "WHATSAPP_API_URL">): string {
  return (env.WHATSAPP_API_URL || "https://graph.facebook.com/v21.0").replace(/\/$/, "");
}

async function postar(url: string, token: string, corpo: unknown, f: typeof fetch): Promise<string> {
  const r = await f(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados?.error?.message ?? "Falha ao enviar mensagem no WhatsApp");
  const id: string | undefined = dados?.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp não retornou o id da mensagem enviada");
  return id;
}

/** Texto livre pelo número público — só funciona dentro da janela de 24h. */
export async function enviarTexto(env: Env, para: string, texto: string, f: typeof fetch = fetch): Promise<{ wamid: string }> {
  const wamid = await postar(
    `${baseApi(env)}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    env.WHATSAPP_API_TOKEN,
    { messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } },
    f,
  );
  return { wamid };
}

/** Modelo aprovado enviado pelo número interno (aviso urgente ao celular da escola). */
export async function enviarModelo(env: Env, para: string, modelo: string, parametros: string[], f: typeof fetch = fetch): Promise<{ wamid: string }> {
  if (!env.WHATSAPP_INTERNO_PHONE_NUMBER_ID || !env.WHATSAPP_INTERNO_API_TOKEN) throw new Error("número interno não configurado");
  const corpo = {
    messaging_product: "whatsapp",
    to: para,
    type: "template",
    template: {
      name: modelo,
      language: { code: "pt_BR" },
      components: [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: t.replace(/\s+/g, " ").trim() || "-" })) }],
    },
  };
  return { wamid: await postar(`${baseApi(env)}/${env.WHATSAPP_INTERNO_PHONE_NUMBER_ID}/messages`, env.WHATSAPP_INTERNO_API_TOKEN, corpo, f) };
}
