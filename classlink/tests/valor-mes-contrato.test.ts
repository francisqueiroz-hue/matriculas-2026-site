import { beforeEach, describe, expect, it, vi } from "vitest";
import { valorDoMesPeloContrato, type ContratoParaValor } from "@/lib/boletos-do-ano";

const base: ContratoParaValor = {
  anoLetivo: 2027,
  status: "COMPLETO",
  atualizadoEm: new Date("2026-11-20"),
  valores: { parcelas: 12, vencimentoDia: 5, parcelaBruta: 1638, parcelaLiquida: 1638, bolsista: false },
  primeiroUltimo: "05/01/2027 a 05/12/2027",
};

describe("valorDoMesPeloContrato", () => {
  it("contrato assinado: vale a parcela do contrato em todos os meses das parcelas", () => {
    expect(valorDoMesPeloContrato([base], "2027-01")).toEqual({ tipo: "VALOR", valor: 1638, origem: "CONTRATO_ASSINADO" });
    expect(valorDoMesPeloContrato([base], "2027-12")).toEqual({ tipo: "VALOR", valor: 1638, origem: "CONTRATO_ASSINADO" });
  });

  it("assinado prevalece sobre um enviado mais recente; sem assinado, vale o enviado mais recente com valor", () => {
    const enviado = { ...base, status: "AGUARDANDO_ASSINATURA", atualizadoEm: new Date("2026-11-25"), valores: { ...base.valores!, parcelaBruta: 1700, parcelaLiquida: 1700 } };
    expect(valorDoMesPeloContrato([enviado, base], "2027-03")).toMatchObject({ valor: 1638, origem: "CONTRATO_ASSINADO" });
    expect(valorDoMesPeloContrato([enviado], "2027-03")).toEqual({ tipo: "VALOR", valor: 1700, origem: "CONTRATO_ENVIADO" });
    const semValor = { ...enviado, atualizadoEm: new Date("2026-11-26"), valores: null };
    expect(valorDoMesPeloContrato([semValor, enviado], "2027-03")).toMatchObject({ valor: 1700 });
  });

  it("isento pelo contrato", () => {
    expect(valorDoMesPeloContrato([{ ...base, valores: { ...base.valores!, bolsista: true, parcelaBruta: 0, parcelaLiquida: 0 } }], "2027-01")).toEqual({ tipo: "ISENTO" });
  });

  it("sem contrato do ano, sem valor ou mês fora das parcelas: não lança (nunca usa o cadastro)", () => {
    expect(valorDoMesPeloContrato([], "2027-01")).toMatchObject({ tipo: "SEM_VALOR", motivo: "sem contrato de 2027" });
    expect(valorDoMesPeloContrato([{ ...base, anoLetivo: 2026 }], "2027-01").tipo).toBe("SEM_VALOR");
    expect(valorDoMesPeloContrato([{ ...base, valores: null }], "2027-01")).toMatchObject({ tipo: "SEM_VALOR", motivo: /sem valor/ });
    const fevADez = { ...base, valores: { ...base.valores!, parcelas: 11 }, primeiroUltimo: "05/02/2027 a 05/12/2027" };
    expect(valorDoMesPeloContrato([fevADez], "2027-01")).toMatchObject({ tipo: "SEM_VALOR", motivo: /fora das parcelas/ });
    expect(valorDoMesPeloContrato([fevADez], "2027-02").tipo).toBe("VALOR");
  });

  it("com desconto de pontualidade lança a parcela com desconto (nunca cobra a mais de quem paga em dia)", () => {
    expect(valorDoMesPeloContrato([{ ...base, valores: { ...base.valores!, parcelaBruta: 1800, parcelaLiquida: 1620 } }], "2027-05")).toMatchObject({ valor: 1620 });
  });
});

describe("gerarBoletosDoMes com o valor do contrato", () => {
  const criar = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `b-${data.studentId}`, ...data }));
  const alunos = [
    { id: "a1", name: "Ana", mensalidadeValor: 1500, guardians: [] },
    { id: "a2", name: "Bruno", mensalidadeValor: 1200, guardians: [] },
    { id: "a3", name: "Caio", mensalidadeValor: null, guardians: [] },
    { id: "a4", name: "Duda", mensalidadeValor: null, guardians: [] },
  ];
  const contratos = [
    { studentId: "a1", anoLetivo: 2027, status: "COMPLETO", updatedAt: new Date(), condicoes: { parcelaBruta: 1638, parcelaLiquida: 1638, config: { parcelas: { quantidade: 12, vencimentoDia: 5, primeiroUltimo: "05/01/2027 a 05/12/2027" } } } },
    { studentId: "a3", anoLetivo: 2027, status: "AGUARDANDO_ASSINATURA", updatedAt: new Date(), condicoes: { parcelaBruta: 1400, parcelaLiquida: 1400, config: { parcelas: { quantidade: 12, vencimentoDia: 5, primeiroUltimo: "05/01/2027 a 05/12/2027" } } } },
  ];
  const studentFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => (args ? alunos : alunos));
  const contratoFindMany = vi.fn(async () => contratos);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        student: { findMany: studentFindMany },
        contrato: { findMany: contratoFindMany },
        boleto: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []), create: criar },
        school: { findUnique: vi.fn(async () => ({ demonstracao: false })) },
      },
    }));
    vi.doMock("@/lib/banco-inter", () => ({ isBancoInterConfigured: () => false, emitirCobranca: vi.fn(), consultarCobranca: vi.fn(), alunoLiberadoNoInter: () => false, seuNumeroDoBoleto: () => "x" }));
    vi.doMock("@/lib/boleto-aviso", () => ({ avisarNovoBoleto: vi.fn() }));
    vi.doMock("@/lib/contratos-server", () => ({ destinosDosAlunos: vi.fn(async () => new Map()) }));
  });

  it("janeiro/2027: valor do contrato (não o do cadastro); sem contrato fica de fora e é listado", async () => {
    const { gerarBoletosDoMes } = await import("@/lib/boleto-emissao");
    const r = await gerarBoletosDoMes({ id: "s1", diaVencimentoPadrao: 5 }, "2027-01", new Date(2027, 0, 2));
    const valores = Object.fromEntries(criar.mock.calls.map((c) => [c[0].data.studentId, c[0].data.valor]));
    expect(valores).toEqual({ a1: 1638, a3: 1400 });
    expect(r.criados).toBe(2);
    // Bruno paga em 2026 mas não tem contrato de 2027; Duda não tem nem um nem outro (não é avisada).
    expect(r.semValorDoContrato).toEqual([{ aluno: "Bruno", motivo: "sem contrato de 2027" }]);
    expect(studentFindMany.mock.calls[0][0].where).not.toHaveProperty("mensalidadeValor");
  });

  it("dezembro/2026: segue o valor do cadastro, sem ler contrato", async () => {
    studentFindMany.mockResolvedValueOnce(alunos.filter((a) => a.mensalidadeValor !== null));
    const { gerarBoletosDoMes } = await import("@/lib/boleto-emissao");
    const r = await gerarBoletosDoMes({ id: "s1", diaVencimentoPadrao: 5 }, "2026-12", new Date(2026, 11, 2));
    expect(contratoFindMany).not.toHaveBeenCalled();
    expect(studentFindMany.mock.calls[0][0].where).toMatchObject({ mensalidadeValor: { not: null } });
    expect(criar.mock.calls.map((c) => [c[0].data.studentId, c[0].data.valor])).toEqual([
      ["a1", 1500],
      ["a2", 1200],
    ]);
    expect(r.semValorDoContrato).toEqual([]);
  });
});
