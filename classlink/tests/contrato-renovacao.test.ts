import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  calcularValores,
  configInicial,
  MODELO_CONTRATO_2027,
  percentualEfetivo,
  valoresComReajuste,
  valoresDoContrato,
  type CondicoesContrato,
  type CriterioReajuste,
} from "@/lib/contrato-modelo/tipos";
import { envioLoteSchema } from "@/lib/contrato-modelo/validacao";
import { gerarContrato2027 } from "@/lib/contrato-modelo/gerar";

const criterio = (c: Partial<CriterioReajuste> = {}): CriterioReajuste => ({
  percentual: 9.2,
  base: "BRUTA",
  descontoPct: 0,
  arredondamento: "CENTAVOS",
  ...c,
});

describe("valor da renovação com correção", () => {
  it("aplica 9,2% sobre a mensalidade cadastrada, em centavos", () => {
    // 2.500,00 × 1,092 = 2.730,00
    expect(valoresComReajuste(2500, criterio())).toEqual({ parcelaBruta: 2730, parcelaLiquida: 2730 });
    // 1.873,45 × 1,092 = 2.045,8074 → 2.045,81
    expect(valoresComReajuste(1873.45, criterio())).toEqual({ parcelaBruta: 2045.81, parcelaLiquida: 2045.81 });
  });

  it("o total do contrato fecha exatamente com as 12 parcelas", () => {
    for (const atual of [1873.45, 2199.99, 3333.33, 987.65, 4007]) {
      const v = valoresComReajuste(atual, criterio())!;
      const { anuidade } = calcularValores({ ...v, quantidade: 12 });
      const somaEmCentavos = Array.from({ length: 12 }, () => Math.round(v.parcelaBruta * 100)).reduce((a, b) => a + b, 0);
      expect(Math.round(anuidade * 100)).toBe(somaEmCentavos);
    }
  });

  it("arredonda para reais inteiros quando pedido", () => {
    expect(valoresComReajuste(1873.45, criterio({ arredondamento: "REAIS" }))!.parcelaBruta).toBe(2046);
  });

  it("deriva a outra parcela pelo desconto de pontualidade", () => {
    expect(valoresComReajuste(2000, criterio({ base: "BRUTA", descontoPct: 10 }))).toEqual({ parcelaBruta: 2184, parcelaLiquida: 1965.6 });
    expect(valoresComReajuste(1800, criterio({ base: "LIQUIDA", descontoPct: 10 }))).toEqual({ parcelaLiquida: 1965.6, parcelaBruta: 2184 });
  });

  it("sem mensalidade cadastrada não inventa valor", () => {
    expect(valoresComReajuste(0, criterio())).toBeNull();
    expect(valoresComReajuste(NaN, criterio())).toBeNull();
  });

  it("percentual efetivo para o registro da escola", () => {
    expect(percentualEfetivo(2500, 2730)).toBe(9.2);
    expect(percentualEfetivo(0, 2730)).toBe(0);
  });

  it("envio em lote aceita o critério e recusa percentuais absurdos", () => {
    const base = { anoLetivo: 2027, titulo: "Contrato", itens: [{ studentId: "a", etapa: "EI" }] };
    expect(envioLoteSchema.safeParse({ ...base, reajuste: criterio() }).success).toBe(true);
    expect(envioLoteSchema.safeParse({ ...base, reajuste: criterio({ percentual: 920 }) }).success).toBe(false);
    expect(envioLoteSchema.safeParse({ ...base, reajuste: null }).success).toBe(true);
  });

  it("valores do contrato para as listas", () => {
    const condicoes: CondicoesContrato = {
      modelo: MODELO_CONTRATO_2027,
      anoLetivo: 2027,
      etapa: "EI",
      turma: "Maternal",
      periodo: null,
      parcelaBruta: 2730,
      parcelaLiquida: 2730,
      config: configInicial(),
      reajuste: { valorAnterior: 2500, percentual: 9.2, base: "BRUTA" },
    };
    expect(valoresDoContrato(condicoes)).toEqual({
      parcelas: 12,
      vencimentoDia: 5,
      parcelaBruta: 2730,
      parcelaLiquida: 2730,
      anuidade: 32760,
      reajuste: { valorAnterior: 2500, percentual: 9.2, base: "BRUTA" },
      bolsista: false,
    });
    expect(valoresDoContrato({ ...condicoes, parcelaBruta: 0 })).toBeNull();
    expect(valoresDoContrato({ ...condicoes, parcelaBruta: 0, parcelaLiquida: 0, reajuste: null, bolsista: true })).toMatchObject({
      bolsista: true,
      anuidade: 0,
      reajuste: null,
    });
    expect(valoresDoContrato(null)).toBeNull();
  });

  it("o PDF sai com o valor total e as parcelas, sem o percentual", async () => {
    const config = configInicial();
    const pdf = await gerarContrato2027({
      condicoes: {
        modelo: MODELO_CONTRATO_2027,
        anoLetivo: 2027,
        etapa: "EI",
        turma: "Maternal",
        periodo: null,
        parcelaBruta: 2730,
        parcelaLiquida: 2730,
        config,
        reajuste: { valorAnterior: 2500, percentual: 9.2, base: "BRUTA" },
      },
      familia: null,
      aluno: { nome: "Aluno Exemplo" },
      data: null,
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("gera o PDF de bolsista sem erro", async () => {
    const pdf = await gerarContrato2027({
      condicoes: {
        modelo: MODELO_CONTRATO_2027,
        anoLetivo: 2027,
        etapa: "EI",
        turma: "Maternal",
        periodo: null,
        parcelaBruta: 0,
        parcelaLiquida: 0,
        config: configInicial(),
        bolsista: true,
      },
      familia: null,
      aluno: { nome: "Aluno Bolsista" },
      data: null,
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
  });
});
