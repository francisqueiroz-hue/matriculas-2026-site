import { describe, expect, it } from "vitest";
import { planoDoAno, primeiroMesDasParcelas, type BoletoExistente, type ContratoDoAno } from "@/lib/boletos-do-ano";

const contrato: ContratoDoAno = {
  anoLetivo: 2027,
  valores: { parcelas: 12, vencimentoDia: 5, parcelaBruta: 1500, parcelaLiquida: 1500, bolsista: false },
  primeiroUltimo: "05/01/2027 a 05/12/2027",
};
const hoje = new Date(2026, 10, 27, 18, 0); // 27/11/2026
const eu = "g1";

function existente(mes: string, extra: Partial<BoletoExistente> = {}): BoletoExistente {
  return { mesReferencia: mes, valor: 1500, status: "PENDENTE", codigoSolicitacao: null, porResponsavelFinanceiro: true, destinatarioId: eu, ...extra };
}

describe("primeiroMesDasParcelas", () => {
  it("lê o primeiro vencimento do contrato", () => {
    expect(primeiroMesDasParcelas("05/01/2027 a 05/12/2027", 2027)).toBe(0);
    expect(primeiroMesDasParcelas("05/02/2027 a 05/12/2027", 2027)).toBe(1);
  });
  it("ano diferente ou texto ilegível: null", () => {
    expect(primeiroMesDasParcelas("05/01/2026 a 05/12/2026", 2027)).toBeNull();
    expect(primeiroMesDasParcelas("fevereiro a dezembro", 2027)).toBeNull();
    expect(primeiroMesDasParcelas(null, 2027)).toBeNull();
  });
});

describe("planoDoAno", () => {
  it("12 parcelas de janeiro a dezembro, dia 05, com o valor do contrato", () => {
    const p = planoDoAno(contrato, [], hoje, eu);
    expect(p.bloqueio).toBeNull();
    expect(p.meses).toHaveLength(12);
    expect(p.meses[0]).toEqual({ mesReferencia: "2027-01", vencimento: "2027-01-05", valor: 1500, situacao: "A_EMITIR" });
    expect(p.meses[11].vencimento).toBe("2027-12-05");
    expect(p.meses.every((m) => m.situacao === "A_EMITIR" && m.valor === 1500)).toBe(true);
  });

  it("nunca inclui mês fora do contrato (dezembro de 2026 fica de fora)", () => {
    const p = planoDoAno(contrato, [existente("2026-12")], hoje, eu);
    expect(p.meses.map((m) => m.mesReferencia)).not.toContain("2026-12");
  });

  it("mês já emitido ou pago não é emitido de novo", () => {
    const p = planoDoAno(contrato, [existente("2027-01", { codigoSolicitacao: "c1" }), existente("2027-02", { status: "PAGO" })], hoje, eu);
    expect(p.meses[0].situacao).toBe("EMITIDO");
    expect(p.meses[1].situacao).toBe("PAGO");
    expect(p.meses[2].situacao).toBe("A_EMITIR");
  });

  it("lançamento da escola com o mesmo valor e sem emissão: pode emitir", () => {
    expect(planoDoAno(contrato, [existente("2027-03", { status: "ERRO" })], hoje, eu).meses[2].situacao).toBe("A_EMITIR");
    expect(planoDoAno(contrato, [existente("2027-03", { destinatarioId: null, porResponsavelFinanceiro: false })], hoje, eu).meses[2].situacao).toBe("A_EMITIR");
  });

  it("lançamento da escola com outro valor, cancelado ou de outro responsável: não mexe", () => {
    const p = planoDoAno(
      contrato,
      [existente("2027-01", { valor: 1373.63 }), existente("2027-02", { status: "CANCELADO" }), existente("2027-03", { destinatarioId: "outro" })],
      hoje,
      eu,
    );
    expect(p.meses.slice(0, 3).map((m) => m.situacao)).toEqual(["COM_A_ESCOLA", "COM_A_ESCOLA", "COM_A_ESCOLA"]);
    expect(p.meses[0].motivo).toMatch(/1\.373,63/);
  });

  it("vencimento já passado fica de fora (o Inter não emite vencido)", () => {
    const p = planoDoAno(contrato, [], new Date(2027, 2, 6), eu);
    expect(p.meses.slice(0, 3).map((m) => m.situacao)).toEqual(["VENCIDO", "VENCIDO", "VENCIDO"]);
    expect(p.meses[3].situacao).toBe("A_EMITIR");
    // No próprio dia 05 ainda emite.
    expect(planoDoAno(contrato, [], new Date(2027, 0, 5, 23, 0), eu).meses[0].situacao).toBe("A_EMITIR");
  });

  it("bloqueia sem valor, isento, desconto de pontualidade, abaixo do mínimo, vencimento ≠ 05 ou parcelas fora do padrão", () => {
    const v = contrato.valores!;
    expect(planoDoAno({ ...contrato, valores: null }, [], hoje, eu).bloqueio).toMatch(/valor da parcela/);
    expect(planoDoAno({ ...contrato, valores: { ...v, bolsista: true } }, [], hoje, eu).bloqueio).toMatch(/isento/);
    expect(planoDoAno({ ...contrato, valores: { ...v, parcelaLiquida: 1350 } }, [], hoje, eu).bloqueio).toMatch(/pontualidade/);
    expect(planoDoAno({ ...contrato, valores: { ...v, parcelaBruta: 2, parcelaLiquida: 2 } }, [], hoje, eu).bloqueio).toMatch(/mínimo/);
    expect(planoDoAno({ ...contrato, valores: { ...v, vencimentoDia: 10 } }, [], hoje, eu).bloqueio).toMatch(/dia 05/);
    expect(planoDoAno({ ...contrato, primeiroUltimo: "05/02/2027 a 05/01/2028" }, [], hoje, eu).bloqueio).toMatch(/fora do padrão/);
    expect(planoDoAno({ ...contrato, primeiroUltimo: null }, [], hoje, eu).bloqueio).toMatch(/fora do padrão/);
    for (const c of [{ ...contrato, valores: null }, { ...contrato, valores: { ...v, parcelaLiquida: 1350 } }]) {
      expect(planoDoAno(c, [], hoje, eu).meses).toEqual([]);
    }
  });

  it("contrato de fevereiro a dezembro: 11 parcelas", () => {
    const p = planoDoAno({ ...contrato, valores: { ...contrato.valores!, parcelas: 11 }, primeiroUltimo: "05/02/2027 a 05/12/2027" }, [], hoje, eu);
    expect(p.meses.map((m) => m.mesReferencia)).toEqual(Array.from({ length: 11 }, (_, i) => `2027-${String(i + 2).padStart(2, "0")}`));
  });
});
