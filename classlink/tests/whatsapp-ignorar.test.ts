import { describe, expect, it } from "vitest";
import { mensagemIgnoravel } from "@/lib/whatsapp-ignorar";

describe("mensagemIgnoravel", () => {
  it("ignora reação (emoji sobre uma mensagem)", () => {
    expect(mensagemIgnoravel("reaction")).toBe(true);
  });

  it("não ignora texto, botão, interativo, áudio, imagem nem documento", () => {
    for (const tipo of ["text", "button", "interactive", "audio", "image", "document"]) {
      expect(mensagemIgnoravel(tipo)).toBe(false);
    }
  });
});
