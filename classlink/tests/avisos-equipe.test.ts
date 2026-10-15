import { describe, expect, it } from "vitest";
import { deveAvisarPorWhatsApp, parametrosModeloAviso, trechoAviso } from "@/lib/avisos-equipe";
import { buildTemplatePayload, sanitizeTemplateParam } from "@/lib/whatsapp";

describe("aviso de mensagem para a equipe", () => {
  it("parâmetros na ordem remetente, trecho, link", () => {
    expect(parametrosModeloAviso("Maria", "Oi!", "https://x/dashboard/mensagens/1")).toEqual([
      "Maria",
      "Oi!",
      "https://x/dashboard/mensagens/1",
    ]);
  });

  it("trecho junta linhas e corta textos longos", () => {
    expect(trechoAviso("Bom dia!\n\nO Davi   vai sair cedo")).toBe("Bom dia! O Davi vai sair cedo");
    const longo = trechoAviso("a".repeat(500));
    expect(longo.length).toBe(300);
    expect(longo.endsWith("…")).toBe(true);
  });
});

describe("parâmetros de modelo aceitos pela Meta", () => {
  it("remove quebras de linha, tabulações e espaços repetidos", () => {
    expect(sanitizeTemplateParam("linha 1\nlinha 2\t\tfim     ok")).toBe("linha 1 linha 2 fim ok");
    expect(sanitizeTemplateParam("   ")).toBe("-");
  });

  it("o payload do modelo já sai higienizado", () => {
    const payload = buildTemplatePayload("5521987654321", { name: "aviso", language: "pt_BR" }, ["A\nB"]);
    expect(payload.template.components[0]).toEqual({ type: "body", parameters: [{ type: "text", text: "A B" }] });
  });
});

describe("quem recebe o aviso pelo WhatsApp", () => {
  it("quem ativou recebe, mesmo com push", () => {
    expect(deveAvisarPorWhatsApp({ avisosWhatsApp: true, aparelhosComPush: 2 })).toBe(true);
  });
  it("sem push, recebe automaticamente", () => {
    expect(deveAvisarPorWhatsApp({ avisosWhatsApp: false, aparelhosComPush: 0 })).toBe(true);
  });
  it("com push e sem ativar, não recebe", () => {
    expect(deveAvisarPorWhatsApp({ avisosWhatsApp: false, aparelhosComPush: 1 })).toBe(false);
  });
});
