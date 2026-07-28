import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Cliente da WhatsApp Cloud API (Meta) — developers.facebook.com/docs/whatsapp/cloud-api.
 *
 * Fora da janela de 24h desde a última mensagem recebida do contato, a Cloud API só
 * permite enviar "message templates" pré-aprovados pela Meta, não texto livre. O envio
 * de texto livre implementado aqui funciona quando a conversa está ativa (contato
 * respondeu nas últimas 24h); fora disso a API retorna erro, que é repassado ao chamador.
 *
 * ⚠️ Os nomes de campo seguem a documentação pública da Meta no momento da implementação.
 * Confira a documentação oficial antes de usar em produção — assim como outras integrações
 * bancárias/de terceiros neste projeto, essa superfície fica isolada neste arquivo.
 */

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

export function isWhatsAppConfigured() {
  return Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Normaliza um telefone brasileiro em qualquer formato para E.164 sem "+" (formato exigido pela Cloud API). */
export function normalizePhoneBR(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

export async function sendWhatsAppTextMessage(toPhone: string, body: string): Promise<{ externalId: string }> {
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const token = env("WHATSAPP_API_TOKEN");

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "text",
      text: { body },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? "Falha ao enviar mensagem no WhatsApp";
    throw new Error(message);
  }

  const externalId: string | undefined = data?.messages?.[0]?.id;
  if (!externalId) throw new Error("WhatsApp não retornou o id da mensagem enviada");
  return { externalId };
}

/**
 * Encontra o responsável (GUARDIAN) dono de um telefone recebido no webhook. Compara o
 * número normalizado pois o telefone é digitado livremente no cadastro (com ou sem DDI/símbolos).
 */
export async function findGuardianByPhone(fromPhone: string) {
  const candidatos = await prisma.user.findMany({
    where: { role: "GUARDIAN", phone: { not: null }, deletedAt: null },
    select: { id: true, name: true, phone: true, schoolId: true },
  });
  return candidatos.find((c) => c.phone && normalizePhoneBR(c.phone) === fromPhone) ?? null;
}

/** Valida a assinatura HMAC-SHA256 (X-Hub-Signature-256) do webhook, conforme exigido pela Meta. */
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}
