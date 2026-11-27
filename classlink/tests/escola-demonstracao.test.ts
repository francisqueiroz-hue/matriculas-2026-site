import { beforeEach, describe, expect, it, vi } from "vitest";

// Escola de demonstração: nenhuma rotina automática nem chamada ao Banco Inter pode sair dela.
const prismaMock = vi.hoisted(() => ({
  school: { findUnique: vi.fn() },
  student: { findMany: vi.fn(async () => []) },
  boleto: { findMany: vi.fn(async () => []) },
}));
const emitirCobranca = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/banco-inter", () => ({
  isBancoInterConfigured: () => true,
  emitirCobranca,
  consultarCobranca: vi.fn(),
  seuNumeroDoBoleto: () => "x",
  alunoLiberadoNoInter: () => true,
}));
vi.mock("@/lib/boleto-aviso", () => ({ avisarNovoBoleto: vi.fn() }));
vi.mock("@/lib/push", () => ({ origemPublica: () => null, notifyUsers: vi.fn() }));
vi.mock("@/lib/contratos-server", () => ({ destinosDosAlunos: vi.fn(async () => new Map()) }));

beforeEach(() => vi.clearAllMocks());

describe("escola de demonstração", () => {
  it("não gera boletos do mês nem chama o Inter", async () => {
    prismaMock.school.findUnique.mockResolvedValue({ demonstracao: true });
    const { gerarBoletosDoMes } = await import("@/lib/boleto-emissao");
    const r = await gerarBoletosDoMes({ id: "demo", diaVencimentoPadrao: 5 }, "2026-12", new Date(2026, 11, 1));
    expect(r).toEqual({ criados: 0, emitidos: 0, erros: 0, ignorados: 0, semValorDoContrato: [] });
    expect(prismaMock.student.findMany).not.toHaveBeenCalled();
    expect(emitirCobranca).not.toHaveBeenCalled();
  });

  it("não emite pendentes no Inter", async () => {
    prismaMock.school.findUnique.mockResolvedValue({ demonstracao: true });
    const { emitirPendentesNoInter } = await import("@/lib/boleto-emissao");
    expect(await emitirPendentesNoInter("demo", new Date())).toEqual({ emitidos: 0, erros: 0, vencidos: 0 });
    expect(prismaMock.boleto.findMany).not.toHaveBeenCalled();
  });

  it("escola real segue gerando normalmente", async () => {
    prismaMock.school.findUnique.mockResolvedValue({ demonstracao: false });
    const { gerarBoletosDoMes } = await import("@/lib/boleto-emissao");
    await gerarBoletosDoMes({ id: "real", diaVencimentoPadrao: 5 }, "2026-12", new Date(2026, 11, 1));
    expect(prismaMock.student.findMany).toHaveBeenCalled();
  });

  it("lembretes e aviso de turmas ficam desligados mesmo se marcados como ativos", async () => {
    prismaMock.school.findUnique.mockResolvedValue({
      demonstracao: true,
      lembretesAtivos: true,
      lembretesTipos: ["BOLETO"],
      lembretesDiasInicio: 3,
      lembretesIntervaloDias: 3,
      lembretesMaxEnvios: 4,
      avisoTurmasAtivo: true,
      avisoTurmasTitulo: null,
      avisoTurmasTexto: null,
    });
    const { carregarConfigLembretes } = await import("@/lib/lembretes-server");
    const { carregarAvisoTurmas } = await import("@/lib/aviso-turmas-server");
    expect((await carregarConfigLembretes("demo")).ativos).toBe(false);
    expect((await carregarAvisoTurmas("demo")).ativo).toBe(false);
  });
});
