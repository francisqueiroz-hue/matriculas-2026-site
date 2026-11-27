import { describe, expect, it } from "vitest";
import { mesDoLancamentoAutomatico } from "@/lib/billing";

describe("mesDoLancamentoAutomatico", () => {
  it("28/11/2026: não lança nada (dezembro vai pelo botão)", () => {
    expect(mesDoLancamentoAutomatico(new Date(2026, 10, 28, 9))).toBeNull();
  });
  it("28/12/2026: lança janeiro/2027; 28/01/2027: fevereiro; 28/11/2027: dezembro", () => {
    expect(mesDoLancamentoAutomatico(new Date(2026, 11, 28, 9))).toBe("2027-01");
    expect(mesDoLancamentoAutomatico(new Date(2027, 0, 28, 9))).toBe("2027-02");
    expect(mesDoLancamentoAutomatico(new Date(2027, 10, 28, 9))).toBe("2027-12");
    expect(mesDoLancamentoAutomatico(new Date(2027, 11, 28, 9))).toBe("2028-01");
  });
  it("até o dia 05, o próprio mês (escola sem dia configurado roda no dia 1)", () => {
    expect(mesDoLancamentoAutomatico(new Date(2027, 2, 1, 9))).toBe("2027-03");
    expect(mesDoLancamentoAutomatico(new Date(2027, 2, 5, 23))).toBe("2027-03");
    expect(mesDoLancamentoAutomatico(new Date(2027, 2, 6, 0))).toBe("2027-04");
  });
});
