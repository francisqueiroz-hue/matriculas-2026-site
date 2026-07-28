import { describe, expect, it } from "vitest";
import { mesReferenciaAtual, calcularVencimento, formatarDataISO } from "@/lib/billing";

describe("mesReferenciaAtual", () => {
  it("formata como AAAA-MM com zero à esquerda", () => {
    expect(mesReferenciaAtual(new Date(2026, 0, 15))).toBe("2026-01");
    expect(mesReferenciaAtual(new Date(2026, 10, 3))).toBe("2026-11");
  });
});

describe("calcularVencimento", () => {
  it("usa o dia informado dentro do mês de referência", () => {
    const vencimento = calcularVencimento(10, new Date(2026, 6, 1));
    expect(vencimento.getDate()).toBe(10);
    expect(vencimento.getMonth()).toBe(6);
  });

  it("nunca ultrapassa o último dia do mês (ex: fevereiro)", () => {
    const vencimento = calcularVencimento(31, new Date(2026, 1, 1)); // fevereiro/2026 (não bissexto) tem 28 dias
    expect(vencimento.getDate()).toBe(28);
    expect(vencimento.getMonth()).toBe(1);
  });
});

describe("formatarDataISO", () => {
  it("retorna apenas a parte da data (YYYY-MM-DD)", () => {
    const data = new Date(Date.UTC(2026, 5, 20, 15, 30));
    expect(formatarDataISO(data)).toBe("2026-06-20");
  });
});
