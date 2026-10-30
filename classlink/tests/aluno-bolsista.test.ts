import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { alteracoesFinanceiro } from "@/lib/historico-cadastro";

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  student: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  alteracaoCadastro: { createMany: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async () => ({ sub: "u1", role: "ADMIN", schoolId: "s1", name: "Direção" })),
  AuthError: class AuthError extends Error {},
}));

import { PUT as salvarMensalidade } from "@/app/api/admin/students/[id]/billing/route";
import { POST as marcarBolsistas } from "@/app/api/admin/students/bolsistas/route";

const req = (url: string, metodo: string, corpo: unknown) => new NextRequest(`http://t${url}`, { method: metodo, body: JSON.stringify(corpo) });
const ctx = { params: Promise.resolve({ id: "a1" }) } as never;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  tx.student.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "a1", ...data }));
});

describe("histórico financeiro", () => {
  it("registra mensalidade e isenção, e nada quando não muda", () => {
    expect(alteracoesFinanceiro({ mensalidade: 2500, bolsista: false }, { mensalidade: null, bolsista: true })).toEqual([
      { campo: "mensalidade", valorAnterior: "2500.00", valorNovo: null },
      { campo: "bolsista", valorAnterior: "Não", valorNovo: "Sim" },
    ]);
    expect(alteracoesFinanceiro({ mensalidade: 2500, bolsista: false }, { mensalidade: 2500, bolsista: false })).toEqual([]);
  });
});

describe("cadastro do aluno", () => {
  it("marcar bolsista apaga a mensalidade e grava no histórico", async () => {
    tx.student.findFirst.mockResolvedValue({ mensalidadeValor: "2500.00", bolsista: false });
    const res = await salvarMensalidade(req("/api/admin/students/a1/billing", "PUT", { mensalidadeValor: 2500, bolsista: true }), ctx);
    expect(res.status).toBe(200);
    expect(tx.student.update.mock.calls[0][0].data).toMatchObject({ mensalidadeValor: null, bolsista: true });
    const linhas = tx.alteracaoCadastro.createMany.mock.calls[0][0].data;
    expect(linhas.map((l: { campo: string }) => l.campo)).toEqual(["mensalidade", "bolsista"]);
    expect(linhas[0]).toMatchObject({ entidade: "ALUNO", entidadeId: "a1", porNome: "Direção" });
  });

  it("marcação em lote só pega quem não tem mensalidade e registra cada um", async () => {
    tx.student.findMany.mockResolvedValue([{ id: "a1" }, { id: "a3" }]);
    const res = await marcarBolsistas(req("/api/admin/students/bolsistas", "POST", { studentIds: ["a1", "a2", "a3"] }));
    expect(await res.json()).toEqual({ marcados: 2, ignorados: 1 });
    expect(tx.student.findMany.mock.calls[0][0].where).toMatchObject({ schoolId: "s1", mensalidadeValor: null, bolsista: false });
    expect(tx.alteracaoCadastro.createMany.mock.calls[0][0].data).toHaveLength(2);
  });
});
