import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  contrato: { updateMany: vi.fn() },
  contratoArquivo: { create: vi.fn() },
  contratoEvento: { create: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  contrato: { findMany: vi.fn() },
  contratoConfig: { findUnique: vi.fn() },
}));
const notifyUsers = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/push", () => ({ notifyUsers }));
vi.mock("@/lib/contratos-server", () => ({ responsaveisDoAluno: vi.fn(async () => ["g1"]), sha256Hex: () => "hash" }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async () => ({ sub: "u1", role: "ADMIN", schoolId: "s1" })),
  AuthError: class AuthError extends Error {},
}));

import { POST } from "@/app/api/admin/contratos/vencimento/route";
import { carregarConfig } from "@/lib/contrato-modelo/servidor";
import { DIA_VENCIMENTO_PADRAO } from "@/lib/billing";
import {
  DIA_VENCIMENTO_MENSALIDADE,
  MODELO_CONTRATO_2027,
  comVencimentoFixo,
  configInicial,
  diaDoMes,
  type CondicoesContrato,
} from "@/lib/contrato-modelo/tipos";

const condicoesAntigas = (): CondicoesContrato => {
  const config = configInicial();
  config.parcelas = { ...config.parcelas, vencimentoDia: 10, primeiroUltimo: "10/01/2027 a 10/12/2027" };
  return { modelo: MODELO_CONTRATO_2027, anoLetivo: 2027, etapa: "EI", turma: "Maternal", periodo: null, parcelaBruta: 0, parcelaLiquida: 0, config };
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  tx.contrato.updateMany.mockResolvedValue({ count: 1 });
});

describe("vencimento sempre no dia 05", () => {
  it("é o padrão do contrato e dos boletos", () => {
    expect(DIA_VENCIMENTO_MENSALIDADE).toBe(5);
    expect(DIA_VENCIMENTO_PADRAO).toBe(5);
    expect(configInicial().parcelas.vencimentoDia).toBe(5);
    expect(configInicial().parcelas.primeiroUltimo).toBe("05/01/2027 a 05/12/2027");
    expect(diaDoMes(5)).toBe("05");
  });

  it("corrige o dia e as datas de primeiro/último vencimento", () => {
    const c = comVencimentoFixo(condicoesAntigas().config);
    expect(c.parcelas.vencimentoDia).toBe(5);
    expect(c.parcelas.primeiroUltimo).toBe("05/01/2027 a 05/12/2027");
    expect(comVencimentoFixo({ ...c, parcelas: { ...c.parcelas, primeiroUltimo: "1/2/2027 a 31/12/2027" } }).parcelas.primeiroUltimo).toBe(
      "05/2/2027 a 05/12/2027",
    );
  });

  it("configuração salva com outro dia é lida com o dia 05", async () => {
    prismaMock.contratoConfig.findUnique.mockResolvedValue({ dados: condicoesAntigas().config, updatedAt: new Date() });
    const { config } = await carregarConfig("s1", 2027);
    expect(config.parcelas.vencimentoDia).toBe(5);
    expect(config.parcelas.primeiroUltimo).toBe("05/01/2027 a 05/12/2027");
  });
});

describe("POST /api/admin/contratos/vencimento", () => {
  const req = () => new NextRequest("http://t/api/admin/contratos/vencimento", { method: "POST" });

  it("busca só contratos do app aguardando assinatura e sem assinado enviado", async () => {
    prismaMock.contrato.findMany.mockResolvedValue([]);
    await POST(req());
    expect(prismaMock.contrato.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolId: "s1", modelo: MODELO_CONTRATO_2027, status: "AGUARDANDO_ASSINATURA", arquivos: { none: { tipo: "ASSINADO" } } }),
      }),
    );
  });

  it("grava o dia 05, gera PDF novo, registra o evento e avisa a família", async () => {
    prismaMock.contrato.findMany.mockResolvedValue([
      { id: "c1", studentId: "a1", condicoes: condicoesAntigas(), dadosFamilia: null, student: { name: "Ana Souza" } },
    ]);
    const res = await POST(req());
    expect(await res.json()).toEqual({ corrigidos: [{ id: "c1", nome: "Ana Souza" }], total: 1 });
    const gravado = tx.contrato.updateMany.mock.calls[0][0];
    expect(gravado.where).toEqual({ id: "c1", status: "AGUARDANDO_ASSINATURA" });
    expect(gravado.data.condicoes.config.parcelas.vencimentoDia).toBe(5);
    expect(tx.contratoArquivo.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo: "MODELO", contratoId: "c1" }) }));
    expect(tx.contratoEvento.create.mock.calls[0][0].data).toMatchObject({ tipo: "CONDICOES_ATUALIZADAS", detalhe: expect.stringContaining("dia 10 → dia 05") });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
  });

  it("não mexe em contrato que já está no dia 05 nem em contrato assinado no meio-tempo", async () => {
    const jaCerto = condicoesAntigas();
    jaCerto.config = comVencimentoFixo(jaCerto.config);
    prismaMock.contrato.findMany.mockResolvedValue([
      { id: "c1", studentId: "a1", condicoes: jaCerto, dadosFamilia: null, student: { name: "Ana" } },
      { id: "c2", studentId: "a2", condicoes: condicoesAntigas(), dadosFamilia: null, student: { name: "Bia" } },
    ]);
    tx.contrato.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req());
    expect(await res.json()).toEqual({ corrigidos: [], total: 0 });
    expect(tx.contratoArquivo.create).not.toHaveBeenCalled();
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});

describe("boletos do mês", () => {
  it("vencem no dia 05 mesmo para aluno ou escola com outro dia salvo", async () => {
    vi.resetModules();
    const criar = vi.fn(async ({ data }: { data: { vencimento: Date } }) => ({ id: "b1", ...data }));
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        student: { findMany: vi.fn(async () => [{ id: "a1", name: "Ana", diaVencimento: 10, mensalidadeValor: 1000, guardians: [] }]) },
        boleto: { findUnique: vi.fn(async () => null), create: criar },
      },
    }));
    vi.doMock("@/lib/banco-inter", () => ({ isBancoInterConfigured: () => false, emitirCobranca: vi.fn(), consultarCobranca: vi.fn() }));
    vi.doMock("@/lib/boleto-aviso", () => ({ avisarNovoBoleto: vi.fn() }));
    const { gerarBoletosDoMes } = await import("@/lib/boleto-emissao");
    await gerarBoletosDoMes({ id: "s1", diaVencimentoPadrao: 23 }, "2026-11", new Date(2026, 10, 1));
    expect(criar.mock.calls[0][0].data.vencimento.getDate()).toBe(5);
    expect(criar.mock.calls[0][0].data.vencimento.getMonth()).toBe(10);
  });
});
