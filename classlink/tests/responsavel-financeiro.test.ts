import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Com mais de um responsável, o contrato vai só ao responsável financeiro (quem assina), nunca ao
// pedagógico. Sem financeiro indicado, nada é enviado e a direção é avisada na tela Contratos.

const tx = vi.hoisted(() => ({
  guardianStudent: { updateMany: vi.fn(), update: vi.fn() },
  alteracaoCadastro: { create: vi.fn() },
}));
const banco = vi.hoisted(() => ({
  $transaction: vi.fn(),
  student: { findFirst: vi.fn(), findMany: vi.fn() },
  contrato: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: banco }));
const sessao = vi.hoisted(() => ({ atual: { sub: "dir1", role: "ADMIN", schoolId: "s1", name: "Direção" } as Record<string, string> }));
vi.mock("@/lib/session", () => ({
  requireDirecao: vi.fn(async () => sessao.atual),
  requireRole: vi.fn(async () => sessao.atual),
  exigirDirecaoSeAdmin: vi.fn(async () => undefined),
  AuthError: class AuthError extends Error {},
}));
vi.mock("@/lib/visibilidade-server", () => ({ exigirArea: vi.fn(async () => undefined) }));

import { destinoContrato, responsavelVeContrato } from "@/lib/responsavel-financeiro";
import { GET as pendentes, PUT as indicar } from "@/app/api/admin/contratos/responsavel-financeiro/route";
import { GET as listarContratos } from "@/app/api/contratos/route";

const v = (guardianId: string, responsavelFinanceiro = false, ativo = true) => ({ guardianId, responsavelFinanceiro, ativo });
const ativo = { active: true, deletedAt: null, role: "GUARDIAN" };

describe("destino do contrato", () => {
  it("financeiro indicado: só ele, mesmo com outros responsáveis", () => {
    expect(destinoContrato([v("pedagogica"), v("financeiro", true)])).toEqual({ situacao: "FINANCEIRO", ids: ["financeiro"] });
  });

  it("um só responsável: é ele, sem precisar indicar", () => {
    expect(destinoContrato([v("mae")])).toEqual({ situacao: "UNICO", ids: ["mae"] });
  });

  it("dois responsáveis sem financeiro indicado: ninguém (não escolhe sozinho)", () => {
    expect(destinoContrato([v("mae"), v("pai")])).toEqual({ situacao: "INDEFINIDO", ids: [] });
  });

  it("financeiro com a conta desativada não recebe; sobra um ativo, vai para ele", () => {
    expect(destinoContrato([v("pai", true, false), v("mae")])).toEqual({ situacao: "UNICO", ids: ["mae"] });
  });

  it("sem responsável ativo: ninguém", () => {
    expect(destinoContrato([])).toEqual({ situacao: "SEM_RESPONSAVEL", ids: [] });
  });

  it("quem vê o contrato no app: com financeiro indicado, só ele; sem indicação, todos os vinculados como antes", () => {
    expect(responsavelVeContrato([v("ped"), v("fin", true)], "fin")).toBe(true);
    expect(responsavelVeContrato([v("ped"), v("fin", true)], "ped")).toBe(false);
    expect(responsavelVeContrato([v("mae"), v("pai")], "pai")).toBe(true);
    expect(responsavelVeContrato([v("mae")], "estranho")).toBe(false);
  });
});

describe("direção indica o responsável financeiro", () => {
  const put = (corpo: unknown) =>
    indicar(new NextRequest("http://t/api/admin/contratos/responsavel-financeiro", { method: "PUT", body: JSON.stringify(corpo) }));

  beforeEach(() => {
    vi.clearAllMocks();
    sessao.atual = { sub: "dir1", role: "ADMIN", schoolId: "s1", name: "Direção" };
    banco.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
    banco.student.findFirst.mockResolvedValue({
      id: "a1",
      guardians: [
        { guardianId: "mae", responsavelFinanceiro: false, guardian: { name: "Maria", ...ativo } },
        { guardianId: "pai", responsavelFinanceiro: true, guardian: { name: "João", ...ativo } },
      ],
    });
  });

  it("marca um, desmarca o anterior e registra no histórico do cadastro", async () => {
    const res = await put({ studentId: "a1", guardianId: "mae" });
    expect(res.status).toBe(200);
    expect(tx.guardianStudent.updateMany).toHaveBeenCalledWith({
      where: { studentId: "a1", responsavelFinanceiro: true },
      data: { responsavelFinanceiro: false },
    });
    expect(tx.guardianStudent.update).toHaveBeenCalledWith({
      where: { guardianId_studentId: { guardianId: "mae", studentId: "a1" } },
      data: { responsavelFinanceiro: true },
    });
    expect(tx.alteracaoCadastro.create.mock.calls[0][0].data).toMatchObject({
      entidade: "ALUNO",
      entidadeId: "a1",
      campo: "responsavelFinanceiro",
      valorAnterior: "João",
      valorNovo: "Maria",
      porUserId: "dir1",
    });
  });

  it("recusa responsável que não é do aluno", async () => {
    const res = await put({ studentId: "a1", guardianId: "outro" });
    expect(res.status).toBe(404);
    expect(banco.$transaction).not.toHaveBeenCalled();
  });

  it("já era o financeiro: não grava nada", async () => {
    const res = await put({ studentId: "a1", guardianId: "pai" });
    expect(res.status).toBe(200);
    expect(banco.$transaction).not.toHaveBeenCalled();
  });

  it("lista só alunos com dois ou mais responsáveis e nenhum financeiro", async () => {
    const g = (id: string, fin = false) => ({ relation: null, responsavelFinanceiro: fin, guardian: { id, name: id } });
    banco.student.findMany.mockResolvedValue([
      { id: "a1", name: "Ana", class: { name: "G3" }, guardians: [g("mae"), g("pai")] },
      { id: "a2", name: "Bia", class: { name: "G3" }, guardians: [g("mae2", true), g("pai2")] },
      { id: "a3", name: "Caio", class: { name: "G3" }, guardians: [g("mae3")] },
    ]);
    const json = await (await pendentes()).json();
    expect(json.pendentes.map((p: { id: string }) => p.id)).toEqual(["a1"]);
  });
});

describe("contratos na tela da família", () => {
  const contrato = (id: string, guardians: unknown[]) => ({
    id,
    titulo: "Contrato 2027",
    anoLetivo: 2027,
    status: "AGUARDANDO_ASSINATURA",
    dadosFamilia: null,
    condicoes: null,
    student: { id: "a1", name: "Ana", class: { name: "G3" }, guardians },
    arquivos: [],
  });
  const vinc = (guardianId: string, responsavelFinanceiro = false) => ({ guardianId, responsavelFinanceiro, guardian: ativo });

  it("o responsável pedagógico não vê o contrato quando há financeiro indicado", async () => {
    banco.contrato.findMany.mockResolvedValue([contrato("c1", [vinc("mae", true), vinc("pai")])]);
    sessao.atual = { sub: "pai", role: "GUARDIAN", schoolId: "s1", name: "João" };
    const pai = await (await listarContratos(new NextRequest("http://t/api/contratos"))).json();
    expect(pai.contratos).toEqual([]);

    sessao.atual = { sub: "mae", role: "GUARDIAN", schoolId: "s1", name: "Maria" };
    const mae = await (await listarContratos(new NextRequest("http://t/api/contratos"))).json();
    expect(mae.contratos.map((c: { id: string }) => c.id)).toEqual(["c1"]);
    // Os vínculos dos outros responsáveis não vão para a família.
    expect(mae.contratos[0].student).not.toHaveProperty("guardians");
  });
});
