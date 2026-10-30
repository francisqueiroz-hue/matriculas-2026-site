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
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn(async () => undefined) }));
vi.mock("@/lib/contratos-server", () => ({ responsaveisDoAluno: vi.fn(async () => []), sha256Hex: () => "hash" }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async () => ({ sub: "u1", role: "ADMIN", schoolId: "s1" })),
  AuthError: class AuthError extends Error {},
}));

import { POST } from "@/app/api/admin/contratos/lote/route";

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
  prismaMock.contratoConfig.findUnique.mockResolvedValue(null);
  prismaMock.contrato.findMany.mockResolvedValue([]);
  prismaMock.student.findMany.mockResolvedValue([
    { id: "a1", name: "Lia", mensalidadeValor: "2500.00", class: { name: "Maternal" } },
    { id: "a2", name: "Rui", mensalidadeValor: null, class: { name: "Maternal" } },
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
});
