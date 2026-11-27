import { describe, expect, it } from "vitest";
import { mudancaDaConsulta, precisaCompletar, type BoletoACompletar } from "@/lib/inter-completar";

const base: BoletoACompletar = {
  id: "b1",
  status: "PENDENTE",
  codigoSolicitacao: "cod-1",
  nossoNumero: null,
  linhaDigitavel: null,
  pixCopiaCola: null,
  updatedAt: new Date("2026-11-27T12:00:00Z"),
};

describe("precisaCompletar", () => {
  it("emitido, em aberto e sem Pix/linha: sim", () => {
    expect(precisaCompletar(base)).toBe(true);
  });
  it("sem código do Inter, já completo, pago ou cancelado: não", () => {
    expect(precisaCompletar({ ...base, codigoSolicitacao: null })).toBe(false);
    expect(precisaCompletar({ ...base, linhaDigitavel: "123", pixCopiaCola: "pix" })).toBe(false);
    expect(precisaCompletar({ ...base, status: "PAGO" })).toBe(false);
    expect(precisaCompletar({ ...base, status: "CANCELADO" })).toBe(false);
  });
});

describe("mudancaDaConsulta", () => {
  it("grava nosso número, linha digitável e Pix quando chegam", () => {
    expect(
      mudancaDaConsulta(base, { codigoSolicitacao: "cod-1", situacao: "A_RECEBER", nossoNumero: "nn", linhaDigitavel: "ld", pixCopiaECola: "px" }),
    ).toEqual({ nossoNumero: "nn", linhaDigitavel: "ld", pixCopiaCola: "px" });
  });
  it("ainda em processamento, sem dados: nada a mudar", () => {
    expect(mudancaDaConsulta(base, { codigoSolicitacao: "cod-1", situacao: "EM_PROCESSAMENTO" })).toBeNull();
  });
  it("falha de emissão vira ERRO com explicação", () => {
    const m = mudancaDaConsulta(base, { codigoSolicitacao: "cod-1", situacao: "FALHA_EMISSAO" });
    expect(m?.status).toBe("ERRO");
    expect(m?.erroDetalhe).toMatch(/CPF/);
  });
  it("RECEBIDO na consulta não marca pago (isso vem do webhook, com data e valor)", () => {
    const m = mudancaDaConsulta({ ...base, linhaDigitavel: "ld", pixCopiaCola: "px" }, { codigoSolicitacao: "cod-1", situacao: "RECEBIDO", linhaDigitavel: "ld", pixCopiaECola: "px" });
    expect(m).toBeNull();
  });
});
