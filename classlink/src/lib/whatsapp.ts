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

/** Base da Graph API. WHATSAPP_API_URL só existe para testes locais apontarem para um simulador. */
function apiBaseUrl() {
  return (process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v21.0").replace(/\/$/, "");
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

/**
 * Formas equivalentes de um celular brasileiro: com e sem o nono dígito. A Meta costuma
 * informar no webhook o número sem o 9 (ex.: 552187654321), enquanto o cadastro guarda
 * 5521987654321 — sem isso a família não seria reconhecida ao escrever para a escola.
 */
export function phoneVariantsBR(phone: string): string[] {
  const n = normalizePhoneBR(phone);
  if (!n) return [];
  // O nono dígito só foi acrescentado a celulares, que começavam com 6–9.
  if (n.length === 13 && n[4] === "9" && /[6-9]/.test(n[5])) return [n, n.slice(0, 4) + n.slice(5)];
  if (n.length === 12 && /[6-9]/.test(n[4])) return [n, n.slice(0, 4) + "9" + n.slice(4)];
  return [n];
}

export function samePhoneBR(a: string, b: string): boolean {
  const variantes = phoneVariantsBR(a);
  return phoneVariantsBR(b).some((v) => variantes.includes(v));
}

export async function sendWhatsAppTextMessage(toPhone: string, body: string): Promise<{ externalId: string }> {
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const token = env("WHATSAPP_API_TOKEN");

  const response = await fetch(`${apiBaseUrl()}/${phoneNumberId}/messages`, {
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
 * Modelo (template) aprovado pela Meta para enviar acesso/senha provisória. É o único
 * jeito de a mensagem chegar a quem não falou com a escola nas últimas 24h — texto livre
 * nesse caso é aceito pela API (200 + id), mas descartado depois (erro 131047 no webhook
 * de status). Configure WHATSAPP_TEMPLATE_ACESSO com o nome do modelo aprovado.
 */
export function getAccessTemplate(): { name: string; language: string } | null {
  return templateFromEnv("WHATSAPP_TEMPLATE_ACESSO");
}

/**
 * Modelo aprovado para avisar a equipe de mensagem nova no ClassLink (WHATSAPP_TEMPLATE_AVISO).
 * Mesmo motivo do de acesso: fora da janela de 24h só modelo aprovado é entregue.
 */
export function getNoticeTemplate(): { name: string; language: string } | null {
  return templateFromEnv("WHATSAPP_TEMPLATE_AVISO");
}

function templateFromEnv(variavel: string): { name: string; language: string } | null {
  const name = process.env[variavel]?.trim();
  if (!name) return null;
  return { name, language: process.env.WHATSAPP_TEMPLATE_IDIOMA?.trim() || "pt_BR" };
}

/**
 * Variáveis de modelo não podem ter quebra de linha, tabulação nem mais de 4 espaços
 * seguidos (a Meta recusa o envio) — normaliza tudo para espaços simples.
 */
export function sanitizeTemplateParam(value: string): string {
  return value.replace(/\s+/g, " ").trim() || "-";
}

export async function sendWhatsAppTemplateMessage(
  toPhone: string,
  template: { name: string; language: string },
  bodyParams: string[],
): Promise<{ externalId: string }> {
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const token = env("WHATSAPP_API_TOKEN");

  const response = await fetch(`${apiBaseUrl()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildTemplatePayload(toPhone, template, bodyParams)),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? "Falha ao enviar modelo no WhatsApp";
    throw new Error(message);
  }

  const externalId: string | undefined = data?.messages?.[0]?.id;
  if (!externalId) throw new Error("WhatsApp não retornou o id da mensagem enviada");
  return { externalId };
}

export function buildTemplatePayload(toPhone: string, template: { name: string; language: string }, bodyParams: string[]) {
  return {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text: sanitizeTemplateParam(text) })) }],
    },
  };
}

/**
 * Envia acesso/senha provisória pelo modelo aprovado. Retorna false (sem enviar) quando o
 * WhatsApp ou o modelo não estão configurados — nunca cai para texto livre, que não chega
 * a contatos novos e faria o sistema dizer que enviou algo que a família não recebeu.
 */
export async function sendAccessViaWhatsApp(toPhone: string, bodyParams: string[]): Promise<boolean> {
  const template = getAccessTemplate();
  const numero = normalizePhoneBR(toPhone);
  if (!isWhatsAppConfigured() || !template || !numero) return false;
  await sendWhatsAppTemplateMessage(numero, template, bodyParams);
  return true;
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
  return candidatos.find((c) => c.phone && samePhoneBR(c.phone, fromPhone)) ?? null;
}

/**
 * Encontra alguém da equipe (ADMIN/STAFF) pelo telefone recebido no webhook — usado para
 * responder ao pedido de acesso ("ACESSO") também de professores, coordenação e auxiliares.
 */
export async function findStaffByPhone(fromPhone: string) {
  const candidatos = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "STAFF"] }, phone: { not: null }, deletedAt: null },
    select: { id: true, name: true, phone: true, schoolId: true },
  });
  return candidatos.find((c) => c.phone && samePhoneBR(c.phone, fromPhone)) ?? null;
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
