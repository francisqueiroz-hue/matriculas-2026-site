import { describe, expect, it } from "vitest";
import { mensagemViolacaoUnica } from "@/lib/erro-unico";

describe("mensagemViolacaoUnica", () => {
  it("reconhece violação de telefone, por meta ou pela mensagem", () => {
    expect(mensagemViolacaoUnica({ code: "P2002", meta: { target: ["phone"] }, message: "x" })).toMatch(/celular/i);
    expect(mensagemViolacaoUnica({ code: "P2002", meta: {}, message: 'Unique constraint failed on "User_phone_key"' })).toMatch(/celular/i);
  });

  it("reconhece violação de e-mail", () => {
    expect(mensagemViolacaoUnica({ code: "P2002", meta: { target: ["email"] }, message: "x" })).toMatch(/e-mail/i);
  });

  it("usa mensagem genérica para outra restrição única", () => {
    expect(mensagemViolacaoUnica({ code: "P2002", meta: { target: ["slug"] }, message: "x" })).toMatch(/já existe/i);
  });

  it("não interfere em outros erros", () => {
    expect(mensagemViolacaoUnica(new Error("falha qualquer"))).toBeNull();
    expect(mensagemViolacaoUnica({ code: "P2025" })).toBeNull();
    expect(mensagemViolacaoUnica(null)).toBeNull();
    expect(mensagemViolacaoUnica("texto")).toBeNull();
  });

  it("não quebra com meta circular", () => {
    const meta: Record<string, unknown> = {};
    meta.self = meta;
    expect(mensagemViolacaoUnica({ code: "P2002", meta, message: "User_phone_key" })).toMatch(/celular/i);
  });
});
