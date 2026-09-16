import { describe, expect, it, vi } from "vitest";
import {
  calcResumoFrequencia,
  abaixoDoMinimoLegal,
  mesReferenciaParaIntervalo,
  mesAtualReferencia,
  dataParaMeiaNoiteUtc,
  PERCENTUAL_FREQUENCIA_MINIMO,
} from "@/lib/attendance";

describe("calcResumoFrequencia", () => {
  it("conta presenças, atrasos, faltas e faltas justificadas separadamente", () => {
    const resumo = calcResumoFrequencia(["PRESENT", "PRESENT", "LATE", "ABSENT", "JUSTIFIED"]);
    expect(resumo).toEqual({ total: 5, presentes: 2, atrasos: 1, faltas: 1, justificadas: 1, percentual: 60 });
  });

  it("conta presença e atraso como frequência para o percentual", () => {
    const resumo = calcResumoFrequencia(["PRESENT", "LATE", "LATE", "LATE"]);
    expect(resumo.percentual).toBe(100);
  });

  it("conta falta justificada como ausência para o percentual", () => {
    const resumo = calcResumoFrequencia(["JUSTIFIED", "JUSTIFIED", "JUSTIFIED", "PRESENT"]);
    expect(resumo.percentual).toBe(25);
  });

  it("retorna percentual null quando não há registros", () => {
    expect(calcResumoFrequencia([]).percentual).toBeNull();
  });

  it("arredonda o percentual em duas casas decimais", () => {
    const resumo = calcResumoFrequencia(["PRESENT", "PRESENT", "ABSENT"]);
    expect(resumo.percentual).toBe(66.67);
  });
});

describe("abaixoDoMinimoLegal", () => {
  it(`considera abaixo do mínimo quando o percentual é menor que ${PERCENTUAL_FREQUENCIA_MINIMO}%`, () => {
    expect(abaixoDoMinimoLegal(74.99)).toBe(true);
    expect(abaixoDoMinimoLegal(75)).toBe(false);
    expect(abaixoDoMinimoLegal(100)).toBe(false);
  });

  it("nunca considera abaixo do mínimo quando não há registros (percentual null)", () => {
    expect(abaixoDoMinimoLegal(null)).toBe(false);
  });
});

describe("mesReferenciaParaIntervalo", () => {
  it("retorna o intervalo [início, fim) do mês em UTC", () => {
    const { inicio, fim } = mesReferenciaParaIntervalo("2026-02");
    expect(inicio.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("rejeita formatos inválidos", () => {
    expect(() => mesReferenciaParaIntervalo("2026-2")).toThrow(/inválido/);
    expect(() => mesReferenciaParaIntervalo("2026-13")).toThrow(/inválido/);
    expect(() => mesReferenciaParaIntervalo("fevereiro-2026")).toThrow(/inválido/);
  });
});

describe("mesAtualReferencia", () => {
  it("calcula o mês corrente no fuso horário da escola (America/Sao_Paulo), não em UTC", () => {
    vi.useFakeTimers();
    try {
      // 01/09 00:30 UTC == 31/08 21:30 em Brasília (UTC-3): ainda é agosto para a escola.
      vi.setSystemTime(new Date("2026-09-01T00:30:00.000Z"));
      expect(mesAtualReferencia()).toBe("2026-08");
    } finally {
      vi.useRealTimers();
    }
  });

  it("retorna o formato AAAA-MM", () => {
    expect(mesAtualReferencia()).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("dataParaMeiaNoiteUtc", () => {
  it("normaliza AAAA-MM-DD para meia-noite UTC", () => {
    expect(dataParaMeiaNoiteUtc("2026-02-15").toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });

  it("rejeita formatos inválidos", () => {
    expect(() => dataParaMeiaNoiteUtc("15/02/2026")).toThrow(/inválida/);
    expect(() => dataParaMeiaNoiteUtc("2026-02-30")).not.toThrow(); // Date aceita e normaliza (comportamento do JS Date)
    expect(() => dataParaMeiaNoiteUtc("não é uma data")).toThrow(/inválida/);
  });
});
