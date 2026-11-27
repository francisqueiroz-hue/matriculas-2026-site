import { describe, expect, it } from "vitest";
import { alunoLiberadoNoInter, alunosPilotoInter, buildCobrancaPayload, lerConsultaCobranca, seuNumeroDoBoleto, type EmitirCobrancaInput } from "@/lib/banco-inter";

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

describe("contrato da API Cobrança v3", () => {
  it("envia multa de 2% e juros de 1% ao mês, boleto e Pix", () => {
    const payload = buildCobrancaPayload(baseInput({ seuNumero: "2612ABCDEFGHIJK" }));
    expect(payload.multa).toEqual({ codigo: "PERCENTUAL", taxa: 2 });
    expect(payload.mora).toEqual({ codigo: "TAXAMENSAL", taxa: 1 });
    expect(payload.formasRecebimento).toEqual(["BOLETO", "PIX"]);
  });

  it("recusa seuNumero com mais de 15 caracteres", () => {
    expect(() => buildCobrancaPayload(baseInput({ seuNumero: "x".repeat(16) }))).toThrow(/seuNumero/);
  });

  it("corta a mensagem em 78 caracteres", () => {
    const payload = buildCobrancaPayload(baseInput({ seuNumero: "A1", mensagem: "m".repeat(120) }));
    expect(payload.mensagem?.linha1).toHaveLength(78);
  });
});

describe("seuNumeroDoBoleto", () => {
  it("tem 15 caracteres: AAMM + fim do id", () => {
    const s = seuNumeroDoBoleto("cmabc123def456ghi789jkl0", "2026-12");
    expect(s).toHaveLength(15);
    expect(s.startsWith("2612")).toBe(true);
    expect(s).toBe("2612" + "cmabc123def456ghi789jkl0".slice(-11).toUpperCase());
  });
});

describe("lerConsultaCobranca", () => {
  it("achata os blocos cobranca/boleto/pix da v3", () => {
    const r = lerConsultaCobranca(
      {
        cobranca: { codigoSolicitacao: "abc", situacao: "A_RECEBER" },
        boleto: { nossoNumero: "123", linhaDigitavel: "0001", codigoBarras: "999" },
        pix: { txid: "t", pixCopiaECola: "000201" },
      },
      "abc",
    );
    expect(r).toEqual({ codigoSolicitacao: "abc", situacao: "A_RECEBER", nossoNumero: "123", linhaDigitavel: "0001", pixCopiaECola: "000201" });
  });

  it("tolera emissão ainda em processamento (sem boleto/pix)", () => {
    const r = lerConsultaCobranca({ cobranca: { situacao: "EM_PROCESSAMENTO" } }, "abc");
    expect(r.linhaDigitavel).toBeUndefined();
    expect(r.codigoSolicitacao).toBe("abc");
  });
});

describe("piloto do Inter", () => {
  it("sandbox sem lista não libera ninguém (banco de dados é o mesmo da produção)", () => {
    expect(alunoLiberadoNoInter("a1", { BANCO_INTER_AMBIENTE: "sandbox" })).toBe(false);
    expect(alunoLiberadoNoInter("a1", {})).toBe(false);
  });
  it("com lista, só os alunos da lista", () => {
    const env = { BANCO_INTER_AMBIENTE: "producao", BANCO_INTER_ALUNOS_PILOTO: " a1 , a2 " };
    expect(alunoLiberadoNoInter("a1", env)).toBe(true);
    expect(alunoLiberadoNoInter("a3", env)).toBe(false);
    expect(alunosPilotoInter(env)?.size).toBe(2);
  });
  it("produção sem lista libera todos", () => {
    expect(alunoLiberadoNoInter("a9", { BANCO_INTER_AMBIENTE: "producao" })).toBe(true);
  });
});
