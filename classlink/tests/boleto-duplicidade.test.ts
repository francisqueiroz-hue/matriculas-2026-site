import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { boletosDuplicados, textoDuplicidade, type BoletoParaDuplicidade } from "@/lib/duplicidade-boletos";
import { transicaoBaixa, transicaoCancelamento } from "@/lib/baixa-boleto";

const prismaMock = vi.hoisted(() => {
  const m = {
    boleto: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    boletoBaixaLog: { create: vi.fn() },
    student: { findMany: vi.fn(), create: vi.fn() },
    class: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  m.$transaction.mockImplementation(async (fn: (tx: typeof m) => unknown) => fn(m));
  return m;
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async () => ({ sub: "u1", name: "Diretora Ana", role: "ADMIN", schoolId: "s1" })),
  AuthError: class AuthError extends Error {},
}));
vi.mock("@/lib/billing", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing")>()),
  agoraNoFusoDaEscola: () => new Date(2026, 10, 4, 10, 0, 0),
}));

import { PATCH } from "@/app/api/admin/billing/boletos/[id]/route";
import { GET } from "@/app/api/admin/billing/conferencia/route";
import { POST as criarAluno } from "@/app/api/admin/students/route";

const b = (id: string, studentId: string, aluno: string, extra: Partial<BoletoParaDuplicidade> = {}): BoletoParaDuplicidade => ({
  id,
  studentId,
  aluno,
  turma: "Infantil 4",
  mesReferencia: "2026-10",
  status: "PAGO",
  alunoExcluido: false,
  ...extra,
});

describe("boletosDuplicados", () => {
  it("mesmo aluno com dois cadastros no mesmo mês", () => {
    const r = boletosDuplicados([b("b1", "s1", "Antonella Souza"), b("b2", "s2", "Antonella de Souza", { status: "PENDENTE" })]);
    expect(r.get("b1")?.map((o) => o.id)).toEqual(["b2"]);
    expect(r.get("b2")?.map((o) => o.id)).toEqual(["b1"]);
    expect(textoDuplicidade(r.get("b1")![0])).toMatch(/Antonella de Souza.*em aberto/);
  });
  it("irmãos, meses diferentes e cancelados não contam", () => {
    expect(boletosDuplicados([b("b1", "s1", "Antonella Souza"), b("b2", "s2", "Bernardo Souza")]).size).toBe(0);
    expect(boletosDuplicados([b("b1", "s1", "Antonella Souza"), b("b2", "s2", "Antonella Souza", { mesReferencia: "2026-11" })]).size).toBe(0);
    expect(boletosDuplicados([b("b1", "s1", "Antonella Souza"), b("b2", "s2", "Antonella Souza", { status: "CANCELADO" })]).size).toBe(0);
  });
});

describe("transicaoCancelamento", () => {
  it("cancela e reativa só o que faz sentido", () => {
    expect(transicaoCancelamento("CANCELAR", { status: "PAGO", codigoSolicitacao: null })).toBe("CANCELADO");
    expect(transicaoCancelamento("CANCELAR", { status: "PENDENTE", codigoSolicitacao: null })).toBe("CANCELADO");
    expect(transicaoCancelamento("REATIVAR", { status: "CANCELADO", codigoSolicitacao: null })).toBe("PENDENTE");
    expect(() => transicaoCancelamento("CANCELAR", { status: "CANCELADO", codigoSolicitacao: null })).toThrow(/já está/);
    expect(() => transicaoCancelamento("REATIVAR", { status: "PAGO", codigoSolicitacao: null })).toThrow(/não está/);
    expect(() => transicaoCancelamento("CANCELAR", { status: "PENDENTE", codigoSolicitacao: "x" })).toThrow(/banco/);
  });
  it("cancelado não recebe baixa", () => {
    expect(() => transicaoBaixa("PAGO", { status: "CANCELADO", codigoSolicitacao: null }, new Date())).toThrow(/cancelado/);
  });
});

const ctx = { params: Promise.resolve({ id: "b2" }) } as never;
const patch = (corpo: unknown) =>
  PATCH(new NextRequest("http://x/api/admin/billing/boletos/b2", { method: "PATCH", body: JSON.stringify(corpo) }), ctx);
const pago = {
  id: "b2",
  schoolId: "s1",
  status: "PAGO",
  codigoSolicitacao: null,
  valor: 1200,
  valorPago: 1200,
  pagoEm: new Date(2026, 9, 5, 12),
  updatedAt: new Date(2026, 9, 5, 13),
};

describe("PATCH CANCELAR / REATIVAR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.boleto.findFirst.mockResolvedValue(pago);
    prismaMock.boleto.updateMany.mockResolvedValue({ count: 1 });
  });

  it("cancela com motivo, zera o recebido e guarda o anterior no histórico", async () => {
    const r = await patch({ acao: "CANCELAR", motivo: "Boleto em duplicidade" });
    expect(r.status).toBe(200);
    expect(prismaMock.boleto.updateMany).toHaveBeenCalledWith({
      where: { id: "b2", status: "PAGO", updatedAt: pago.updatedAt },
      data: { status: "CANCELADO", pagoEm: null, valorPago: null },
    });
    expect(prismaMock.boletoBaixaLog.create.mock.calls[0][0].data).toMatchObject({
      acao: "CANCELAR",
      statusAnterior: "PAGO",
      statusNovo: "CANCELADO",
      valorPagoAnterior: 1200,
      dataPagamentoAnterior: pago.pagoEm,
      motivo: "Boleto em duplicidade",
      porNome: "Diretora Ana",
    });
  });

  it("exige motivo e recusa boleto do banco", async () => {
    expect((await patch({ acao: "CANCELAR" })).status).toBe(400);
    prismaMock.boleto.findFirst.mockResolvedValue({ ...pago, codigoSolicitacao: "abc" });
    expect((await patch({ acao: "CANCELAR", motivo: "duplicado" })).status).toBe(409);
    expect(prismaMock.boleto.updateMany).not.toHaveBeenCalled();
  });

  it("reativa um cancelado", async () => {
    prismaMock.boleto.findFirst.mockResolvedValue({ ...pago, status: "CANCELADO", pagoEm: null, valorPago: null });
    const r = await patch({ acao: "REATIVAR", motivo: "cancelado por engano" });
    expect(r.status).toBe(200);
    expect(prismaMock.boleto.updateMany.mock.calls[0][0].data.status).toBe("PENDENTE");
  });
});

describe("GET conferência com duplicidade", () => {
  it("marca o pago e lista o em aberto do outro cadastro", async () => {
    vi.clearAllMocks();
    const aluno = (name: string) => ({ name, deletedAt: null, bolsista: false, mensalidadeValor: 1200, class: { name: "Infantil 4" }, guardians: [] });
    const pagoA = { ...pago, id: "b1", studentId: "s1", mesReferencia: "2026-10", vencimento: new Date(2026, 9, 5, 12), student: aluno("Antonella Souza"), baixas: [] };
    const abertoB = { ...pago, id: "b2", studentId: "s2", status: "PENDENTE", pagoEm: null, valorPago: null, mesReferencia: "2026-10", vencimento: new Date(2026, 9, 5, 12), student: aluno("Antonella de Souza"), baixas: [] };
    prismaMock.boleto.findMany.mockResolvedValueOnce([pagoA]).mockResolvedValueOnce([pagoA, abertoB]);
    const d = await (await GET(new NextRequest("http://x/api/admin/billing/conferencia?de=2026-10&ate=2026-10"))).json();
    expect(d.itens[0].alertas[0].codigo).toBe("DUPLICIDADE");
    expect(d.pendentesDuplicados).toHaveLength(1);
    expect(d.pendentesDuplicados[0]).toMatchObject({ id: "b2", aluno: "Antonella de Souza", cancelavel: true });
    expect(d.totais.comAlerta).toBe(1);
  });
});

describe("cadastro de aluno com nome parecido", () => {
  const post = (corpo: unknown) => criarAluno(new NextRequest("http://x/api/admin/students", { method: "POST", body: JSON.stringify(corpo) }));
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.class.findFirst.mockResolvedValue({ id: "c1" });
    prismaMock.student.findMany.mockResolvedValue([{ id: "s1", name: "Antonella Souza", class: { name: "Infantil 4" } }]);
    prismaMock.student.create.mockResolvedValue({ id: "s9" });
  });

  it("avisa e não cria sem confirmação", async () => {
    const r = await post({ name: "Antonella de Souza", classId: "c1" });
    expect(r.status).toBe(409);
    expect((await r.json()).semelhantes).toEqual([{ id: "s1", name: "Antonella Souza", turma: "Infantil 4" }]);
    expect(prismaMock.student.create).not.toHaveBeenCalled();
  });

  it("cria quando a direção confirma, e irmão com outro nome passa direto", async () => {
    expect((await post({ name: "Antonella de Souza", classId: "c1", confirmarSemelhante: true })).status).toBe(201);
    expect((await post({ name: "Bernardo Souza", classId: "c1" })).status).toBe(201);
    expect(prismaMock.student.create).toHaveBeenCalledTimes(2);
  });
});
