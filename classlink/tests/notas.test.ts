import { describe, expect, it } from "vitest";
import { calcMediaTrimestre, calcMediaFinal, calcSituacao } from "@/lib/notas";

describe("calcMediaTrimestre", () => {
  it("pondera trabalho (3), teste (7) e prova (10)", () => {
    expect(calcMediaTrimestre(9, 7, 6)).toBe(6.8); // (27+49+60)/20
    expect(calcMediaTrimestre(10, 10, 10)).toBe(10);
  });

  it("retorna null enquanto alguma nota não foi lançada", () => {
    expect(calcMediaTrimestre(null, 7, 6)).toBeNull();
    expect(calcMediaTrimestre(9, null, 6)).toBeNull();
    expect(calcMediaTrimestre(9, 7, null)).toBeNull();
  });
});

describe("calcMediaFinal", () => {
  it("é a média simples das 3 médias trimestrais", () => {
    expect(calcMediaFinal([6.8, 10, 10])).toBe(8.93);
  });

  it("retorna null até os 3 trimestres estarem completos", () => {
    expect(calcMediaFinal([6.8, null, 10])).toBeNull();
  });
});

describe("calcSituacao", () => {
  it("aprova com média final >= 6", () => {
    expect(calcSituacao(6)).toBe("APROVADO");
    expect(calcSituacao(8.93)).toBe("APROVADO");
  });

  it("reprova com média final < 6", () => {
    expect(calcSituacao(5.99)).toBe("REPROVADO");
  });

  it("fica em andamento enquanto a média final não existe", () => {
    expect(calcSituacao(null)).toBe("EM_ANDAMENTO");
  });
});
