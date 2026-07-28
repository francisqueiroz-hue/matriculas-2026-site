import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cliente do Mailgun (envio + validação de webhook de recebimento) —
 * documentation.mailgun.com. Um único provedor cuida de enviar e-mails aos
 * responsáveis e de rotear as respostas de volta para o webhook de entrada.
 * Tem plano gratuito com API/webhook liberados (diferente do Chatwoot Cloud).
 */

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

export function isEmailConfigured() {
  return Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN && process.env.EMAIL_FROM);
}

function apiBase() {
  // Contas Mailgun criadas na região UE usam api.eu.mailgun.net.
  return process.env.MAILGUN_REGION === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
}

/** Endereço de resposta que codifica o id da conversa — usado para rotear a resposta do responsável de volta a ela. */
export function replyToForConversation(conversationId: string) {
  const domain = env("MAILGUN_DOMAIN");
  return `conversa-${conversationId}@${domain}`;
}

export async function sendEmailMessage(input: {
  to: string;
  subject: string;
  text: string;
  conversationId: string;
}): Promise<{ externalId: string }> {
  const apiKey = env("MAILGUN_API_KEY");
  const domain = env("MAILGUN_DOMAIN");
  const from = env("EMAIL_FROM");

  const form = new URLSearchParams();
  form.set("from", from);
  form.set("to", input.to);
  form.set("subject", input.subject);
  form.set("text", input.text);
  form.set("h:Reply-To", replyToForConversation(input.conversationId));

  const response = await fetch(`${apiBase()}/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message ?? "Falha ao enviar e-mail");
  }

  const externalId: string | undefined = data?.id;
  if (!externalId) throw new Error("Mailgun não retornou o id da mensagem enviada");
  return { externalId };
}

/** Valida a assinatura do webhook (timestamp + token assinados com a chave de assinatura do Mailgun). */
export function verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey) return false;

  const expected = createHmac("sha256", signingKey).update(timestamp + token).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signature);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

/** Extrai o id da conversa do endereço "conversa-{id}@dominio" recebido no campo "recipient" do webhook. */
export function parseConversationIdFromRecipient(recipient: string): string | null {
  const match = recipient.match(/^conversa-([^@]+)@/i);
  return match ? match[1] : null;
}
