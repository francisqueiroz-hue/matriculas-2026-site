import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  contrato: { create: vi.fn() },
  contratoArquivo: { create: vi.fn() },
  contratoEvento: { create: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  student: { findMany: vi.fn() },
  contrato: { findMany: vi.fn() },
  contratoConfig: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const afterTarefas = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => void afterTarefas.push(fn) };
});
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn(async () => undefined) }));
const destinos = vi.hoisted(() => ({ porAluno: new Map<string, { situacao: string; ids: string[] }>() }));
vi.mock("@/lib/contratos-server", () => ({
  sha256Hex: () => "hash",
  destinosDosAlunos: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, destinos.porAluno.get(id) ?? { situacao: "UNICO", ids: [`resp-${id}`] }]))),
}));
vi.mock("@/lib/session", () => ({
  // Rotas só da direção: aqui a sessão simulada já é da direção (ver tests/direcao-acesso.test.ts).
  requireDirecao: async () => (await import("@/lib/session")).requireRole("ADMIN"),
  exigirDirecaoSeAdmin: async () => undefined,
  requireRole: vi.fn(async () => ({ sub: "u1", role: "ADMIN", schoolId: "s1" })),
  AuthError: class AuthError extends Error {},
}));

import { POST } from "@/app/api/admin/contratos/lote/route";
import { notifyUsers } from "@/lib/push";

const req = (corpo: unknown) => new NextRequest("http://t/api/admin/contratos/lote", { method: "POST", body: JSON.stringify(corpo) });
const corpo = {
  anoLetivo: 2027,
  titulo: "Contrato 2027",
  itens: [
    { studentId: "a1", etapa: "EI" },
    { studentId: "a2", etapa: "EI" },
  ],
  reajuste: { percentual: 9.2, base: "BRUTA", descontoPct: 0, arredondamento: "CENTAVOS" },
};

beforeEach(() => {
  vi.clearAllMocks();
  afterTarefas.length = 0;
  vi.mocked(notifyUsers).mockReset().mockResolvedValue(undefined as never);
  prismaMock.contratoConfig.findUnique.mockResolvedValue(null);
  prismaMock.contrato.findMany.mockResolvedValue([]);
  prismaMock.student.findMany.mockResolvedValue([
    { id: "a1", name: "Lia", mensalidadeValor: "2500.00", bolsista: false, class: { name: "Maternal" } },
    { id: "a2", name: "Rui", mensalidadeValor: null, bolsista: false, class: { name: "Maternal" } },
  ]);
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  tx.contrato.create.mockResolvedValue({ id: "c1" });
});

describe("envio da renovação com correção", () => {
  it("grava a mensalidade cadastrada corrigida e bloqueia quem não tem mensalidade", async () => {
    const res = await POST(req(corpo));
    const json = await res.json();
    expect(json.criados).toEqual([{ id: "c1", studentId: "a1", nome: "Lia" }]);
    expect(json.ignorados).toEqual([
      { studentId: "a2", nome: "Rui", motivo: "Mensalidade não cadastrada — preencha no cadastro do aluno antes de enviar" },
    ]);
    const condicoes = tx.contrato.create.mock.calls[0][0].data.condicoes;
    expect(condicoes.parcelaBruta).toBe(2730);
    expect(condicoes.parcelaLiquida).toBe(2730);
    expect(condicoes.reajuste).toEqual({ valorAnterior: 2500, base: "BRUTA", percentual: 9.2 });
    expect(tx.contrato.create).toHaveBeenCalledTimes(1);
  });

  it("bolsista não bloqueia: contrato sem parcelas e com a isenção", async () => {
    prismaMock.student.findMany.mockResolvedValue([{ id: "a2", name: "Rui", mensalidadeValor: null, bolsista: true, class: { name: "Maternal" } }]);
    const res = await POST(req({ ...corpo, itens: [{ studentId: "a2", etapa: "EI" }] }));
    const json = await res.json();
    expect(json.ignorados).toEqual([]);
    const condicoes = tx.contrato.create.mock.calls[0][0].data.condicoes;
    expect(condicoes).toMatchObject({ bolsista: true, parcelaBruta: 0, parcelaLiquida: 0, reajuste: null });
  });
});

describe("aviso às famílias no envio em lote", () => {
  it("a resposta não espera a notificação: aviso travado não segura o envio da turma", async () => {
    vi.mocked(notifyUsers).mockImplementationOnce(() => new Promise(() => undefined)); // nunca responde
    const res = await POST(req(corpo));
    expect(res.status).toBe(201);
    expect((await res.json()).criados).toHaveLength(1);
    expect(notifyUsers).not.toHaveBeenCalled();
    expect(afterTarefas).toHaveLength(1);
  });

  it("depois da resposta, avisa a família de cada contrato criado", async () => {
    await POST(req(corpo));
    for (const t of afterTarefas.splice(0)) await t();
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyUsers).mock.calls[0][1]).toMatchObject({ title: "Contrato de matrícula 2027", url: "/dashboard/contratos" });
  });

  it("falha no aviso não derruba os demais", async () => {
    prismaMock.student.findMany.mockResolvedValue([
      { id: "a1", name: "Lia", mensalidadeValor: "2500.00", bolsista: false, class: { name: "Maternal" } },
      { id: "a3", name: "Bia", mensalidadeValor: "2500.00", bolsista: false, class: { name: "Maternal" } },
    ]);
    vi.mocked(notifyUsers).mockRejectedValueOnce(new Error("firebase fora")).mockResolvedValueOnce(undefined as never);
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await POST(req({ ...corpo, itens: [{ studentId: "a1", etapa: "EI" }, { studentId: "a3", etapa: "EI" }] }));
    for (const t of afterTarefas.splice(0)) await t();
    expect(notifyUsers).toHaveBeenCalledTimes(2);
    erro.mockRestore();
  });
});

describe("envio em lote com mais de um responsável", () => {
  beforeEach(() => destinos.porAluno.clear());

  it("sem responsável financeiro indicado: o aluno fica de fora, com o motivo, e ninguém é avisado", async () => {
    destinos.porAluno.set("a1", { situacao: "INDEFINIDO", ids: [] });
    const res = await POST(req({ ...corpo, itens: [{ studentId: "a1", etapa: "EI" }] }));
    const json = await res.json();
    expect(json.criados).toEqual([]);
    expect(json.ignorados[0]).toMatchObject({ studentId: "a1", motivo: expect.stringMatching(/responsável financeiro/) });
    expect(tx.contrato.create).not.toHaveBeenCalled();
    expect(afterTarefas).toHaveLength(0);
  });

  it("com responsável financeiro: só ele recebe o aviso do contrato", async () => {
    destinos.porAluno.set("a1", { situacao: "FINANCEIRO", ids: ["mae"] });
    await POST(req({ ...corpo, itens: [{ studentId: "a1", etapa: "EI" }] }));
    for (const t of afterTarefas.splice(0)) await t();
    expect(vi.mocked(notifyUsers).mock.calls[0][0]).toEqual(["mae"]);
  });
});
