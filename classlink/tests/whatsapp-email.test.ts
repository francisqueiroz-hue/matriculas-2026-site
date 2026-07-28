import { createHmac } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { normalizePhoneBR, verifyWhatsAppSignature } from "@/lib/whatsapp";
import { verifyMailgunSignature, parseConversationIdFromRecipient } from "@/lib/email";

describe("normalizePhoneBR", () => {
  it("adiciona o código do Brasil quando ausente", () => {
    expect(normalizePhoneBR("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizePhoneBR("11912345678")).toBe("5511912345678");
  });

  it("mantém números que já vêm com o código do país", () => {
    expect(normalizePhoneBR("5511912345678")).toBe("5511912345678");
  });

  it("retorna null para entradas vazias ou com quantidade de dígitos inválida", () => {
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR("123")).toBeNull();
  });
});

describe("verifyWhatsAppSignature", () => {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = "segredo-teste";
  });
  afterEach(() => {
    process.env.WHATSAPP_APP_SECRET = originalSecret;
  });

  it("aceita uma assinatura válida", () => {
    const body = '{"hello":"world"}';
    const signature = "sha256=" + createHmac("sha256", "segredo-teste").update(body).digest("hex");
    expect(verifyWhatsAppSignature(body, signature)).toBe(true);
  });

  it("rejeita assinatura incorreta", () => {
    expect(verifyWhatsAppSignature("{}", "sha256=abc123")).toBe(false);
  });

  it("rejeita quando não há cabeçalho de assinatura", () => {
    expect(verifyWhatsAppSignature("{}", null)).toBe(false);
  });
});

describe("verifyMailgunSignature", () => {
  const originalKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  beforeEach(() => {
    process.env.MAILGUN_WEBHOOK_SIGNING_KEY = "chave-teste";
  });
  afterEach(() => {
    process.env.MAILGUN_WEBHOOK_SIGNING_KEY = originalKey;
  });

  it("aceita uma assinatura válida", () => {
    const timestamp = "1234567890";
    const token = "token-abc";
    const signature = createHmac("sha256", "chave-teste").update(timestamp + token).digest("hex");
    expect(verifyMailgunSignature(timestamp, token, signature)).toBe(true);
  });

  it("rejeita assinatura incorreta", () => {
    expect(verifyMailgunSignature("123", "abc", "assinatura-errada")).toBe(false);
  });
});

describe("parseConversationIdFromRecipient", () => {
  it("extrai o id da conversa do endereço de resposta", () => {
    expect(parseConversationIdFromRecipient("conversa-cm123abc@mail.escola.com")).toBe("cm123abc");
  });

  it("retorna null para endereços que não seguem o padrão", () => {
    expect(parseConversationIdFromRecipient("contato@escola.com")).toBeNull();
  });
});
