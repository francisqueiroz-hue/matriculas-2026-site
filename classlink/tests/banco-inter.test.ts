import { describe, expect, it } from "vitest";
import { buildCobrancaPayload, type EmitirCobrancaInput } from "@/lib/banco-inter";

const enderecoValido = {
  cep: "01310-100",
  logradouro: "Av. Paulista",
  numero: "1000",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "SP",
};

function baseInput(overrides: Partial<EmitirCobrancaInput> = {}): EmitirCobrancaInput {
  return {
    seuNumero: "aluno-1-2026-08",
    valorNominal: 450.5,
    dataVencimento: "2026-08-10",
    pagador: { cpfCnpj: "123.456.789-09", nome: "Carlos Responsável", endereco: enderecoValido },
    ...overrides,
  };
}

describe("buildCobrancaPayload", () => {
  it("monta o payload removendo formatação de CPF e CEP", () => {
    const payload = buildCobrancaPayload(baseInput());
    expect(payload.pagador.cpfCnpj).toBe("12345678909");
    expect(payload.pagador.cep).toBe("01310100");
    expect(payload.valorNominal).toBe(450.5);
    expect(payload.dataVencimento).toBe("2026-08-10");
  });

  it("usa 60 dias de agenda por padrão", () => {
    const payload = buildCobrancaPayload(baseInput());
    expect(payload.numDiasAgenda).toBe(60);
  });

  it("rejeita CPF ausente ou inválido", () => {
    expect(() => buildCobrancaPayload(baseInput({ pagador: { cpfCnpj: "", nome: "X", endereco: enderecoValido } }))).toThrow(
      /CPF/,
    );
    expect(() =>
      buildCobrancaPayload(baseInput({ pagador: { cpfCnpj: "123", nome: "X", endereco: enderecoValido } })),
    ).toThrow(/CPF/);
  });

  it("rejeita endereço incompleto", () => {
    expect(() =>
      buildCobrancaPayload(
        baseInput({ pagador: { cpfCnpj: "12345678909", nome: "X", endereco: { ...enderecoValido, cep: "" } } }),
      ),
    ).toThrow(/[Ee]ndereço/);
  });

  it("rejeita valor zero ou negativo", () => {
    expect(() => buildCobrancaPayload(baseInput({ valorNominal: 0 }))).toThrow(/[Vv]alor/);
    expect(() => buildCobrancaPayload(baseInput({ valorNominal: -10 }))).toThrow(/[Vv]alor/);
  });
});
