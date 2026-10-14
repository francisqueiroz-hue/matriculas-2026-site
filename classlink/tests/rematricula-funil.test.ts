import { describe, expect, it } from "vitest";
import { contaComoRematriculado, etapaDoAluno, linkWhatsApp, mensagemCobranca, resumirFunil } from "@/lib/rematricula-funil";

describe("funil da rematrícula", () => {
  it("confirmar já conta como matrícula, mesmo sem contrato", () => {
    expect(etapaDoAluno({ confirmou: false, contratoStatus: null })).toBe("NAO_CONFIRMOU");
    expect(etapaDoAluno({ confirmou: true, contratoStatus: null })).toBe("CONFIRMOU");
    expect(contaComoRematriculado("CONFIRMOU")).toBe(true);
    expect(contaComoRematriculado("NAO_CONFIRMOU")).toBe(false);
  });

  it("o contrato define a etapa (e também conta como rematriculado sem confirmação registrada)", () => {
    expect(etapaDoAluno({ confirmou: false, contratoStatus: "AGUARDANDO_ASSINATURA" })).toBe("CONTRATO_ENVIADO");
    expect(etapaDoAluno({ confirmou: true, contratoStatus: "DEVOLVIDO" })).toBe("CONTRATO_ENVIADO");
    expect(etapaDoAluno({ confirmou: true, contratoStatus: "EM_CONFERENCIA" })).toBe("CONTRATO_EM_CONFERENCIA");
    expect(etapaDoAluno({ confirmou: true, contratoStatus: "AGUARDANDO_ORIGINAL" })).toBe("CONTRATO_EM_CONFERENCIA");
    expect(etapaDoAluno({ confirmou: true, contratoStatus: "COMPLETO" })).toBe("CONTRATO_ASSINADO");
    expect(contaComoRematriculado(etapaDoAluno({ confirmou: false, contratoStatus: "COMPLETO" }))).toBe(true);
  });

  it("resume o funil", () => {
    const r = resumirFunil(["NAO_CONFIRMOU", "CONFIRMOU", "CONFIRMOU", "CONTRATO_ASSINADO"]);
    expect(r).toMatchObject({ total: 4, rematriculados: 3, faltam: 1 });
    expect(r.porEtapa.CONFIRMOU).toBe(2);
  });

  it("cobrança só existe onde há o que cobrar", () => {
    expect(mensagemCobranca("Ana Souza", "Pedro", 2027, "NAO_CONFIRMOU")).toContain("Olá, Ana!");
    expect(mensagemCobranca("Ana", "Pedro", 2027, "CONTRATO_ENVIADO")).toContain("assinatura");
    expect(mensagemCobranca("Ana", "Pedro", 2027, "CONTRATO_EM_CONFERENCIA")).toBeNull();
    expect(mensagemCobranca("Ana", "Pedro", 2027, "CONTRATO_ASSINADO")).toBeNull();
  });

  it("link do WhatsApp aceita telefone com ou sem DDI e recusa número incompleto", () => {
    expect(linkWhatsApp("(21) 96469-9441", "oi")).toBe("https://wa.me/5521964699441?text=oi");
    expect(linkWhatsApp("5521964699441", "oi")).toBe("https://wa.me/5521964699441?text=oi");
    expect(linkWhatsApp("964699441", "oi")).toBeNull();
    expect(linkWhatsApp(null, "oi")).toBeNull();
  });
});
