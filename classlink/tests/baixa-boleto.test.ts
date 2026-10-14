import { describe, expect, it } from "vitest";
import { dataDePagamento, statusEfetivo, transicaoBaixa } from "@/lib/baixa-boleto";

const hoje = new Date(2026, 9, 14, 16, 0, 0);

describe("statusEfetivo", () => {
  it("pendente vencido vira VENCIDO; no dia do vencimento ainda é PENDENTE", () => {
    expect(statusEfetivo("PENDENTE", new Date(2026, 9, 5, 12), hoje)).toBe("VENCIDO");
    expect(statusEfetivo("PENDENTE", new Date(2026, 9, 14, 12), hoje)).toBe("PENDENTE");
    expect(statusEfetivo("PENDENTE", new Date(2026, 9, 20, 12), hoje)).toBe("PENDENTE");
  });
  it("não altera os demais status", () => {
    expect(statusEfetivo("PAGO", new Date(2026, 9, 5, 12), hoje)).toBe("PAGO");
    expect(statusEfetivo("ERRO", new Date(2026, 9, 5, 12), hoje)).toBe("ERRO");
  });
});

describe("dataDePagamento", () => {
  it("aceita data passada ou de hoje, ao meio-dia", () => {
    const d = dataDePagamento("2026-10-10", hoje);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 10, 12]);
    expect(dataDePagamento("2026-10-14", hoje).getDate()).toBe(14);
  });
  it("recusa futura, inexistente e formato inválido", () => {
    expect(() => dataDePagamento("2026-10-15", hoje)).toThrow(/futura/);
    expect(() => dataDePagamento("2026-02-31", hoje)).toThrow(/inválida/);
    expect(() => dataDePagamento("10/10/2026", hoje)).toThrow(/inválida/);
  });
});

describe("transicaoBaixa", () => {
  const data = new Date(2026, 9, 10, 12);
  it("marca como pago com a data informada", () => {
    expect(transicaoBaixa("PAGO", { status: "PENDENTE", codigoSolicitacao: null }, data)).toEqual({ status: "PAGO", pagoEm: data });
    expect(transicaoBaixa("PAGO", { status: "VENCIDO", codigoSolicitacao: null }, data).status).toBe("PAGO");
  });
  it("recusa pagar duas vezes", () => {
    expect(() => transicaoBaixa("PAGO", { status: "PAGO", codigoSolicitacao: null }, data)).toThrow(/já está/);
  });
  it("desfaz só baixa manual", () => {
    expect(transicaoBaixa("DESFAZER", { status: "PAGO", codigoSolicitacao: null }, data)).toEqual({ status: "PENDENTE", pagoEm: null });
    expect(() => transicaoBaixa("DESFAZER", { status: "PAGO", codigoSolicitacao: "abc" }, data)).toThrow(/banco/);
    expect(() => transicaoBaixa("DESFAZER", { status: "PENDENTE", codigoSolicitacao: null }, data)).toThrow(/não está/);
  });
});
