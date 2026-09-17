import { describe, expect, it, vi } from "vitest";
import { mesReferenciaAtual, calcularVencimento, formatarDataISO, agoraNoFusoDaEscola } from "@/lib/billing";

describe("mesReferenciaAtual", () => {
  it("formata como AAAA-MM com zero à esquerda", () => {
    expect(mesReferenciaAtual(new Date(2026, 0, 15))).toBe("2026-01");
    expect(mesReferenciaAtual(new Date(2026, 10, 3))).toBe("2026-11");
  });
});

describe("agoraNoFusoDaEscola", () => {
  it("usa o dia/mês de Brasília (America/Sao_Paulo), não o de UTC", () => {
    vi.useFakeTimers();
    try {
      // 01/10 02:30 UTC == 30/09 23:30 em Brasília (UTC-3): para a escola, ainda é 30/09.
      vi.setSystemTime(new Date("2026-10-01T02:30:00.000Z"));
      const hoje = agoraNoFusoDaEscola();
      expect(hoje.getDate()).toBe(30);
      expect(hoje.getMonth()).toBe(8); // setembro (0-indexado)
      expect(hoje.getFullYear()).toBe(2026);
      expect(mesReferenciaAtual(hoje)).toBe("2026-09");
    } finally {
      vi.useRealTimers();
    }
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
