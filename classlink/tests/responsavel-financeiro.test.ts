import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Com mais de um responsável, contrato e boleto vão só ao responsável financeiro, nunca ao
// pedagógico. Vale para o que for criado a partir da regra; os anteriores seguem como eram.

const tx = vi.hoisted(() => ({
  guardianStudent: { updateMany: vi.fn(), update: vi.fn() },
  alteracaoCadastro: { create: vi.fn() },
  contrato: { updateMany: vi.fn() },
  boleto: { updateMany: vi.fn() },
}));
const banco = vi.hoisted(() => ({
  $transaction: vi.fn(),
  student: { findFirst: vi.fn(), findMany: vi.fn() },
  contrato: { findMany: vi.fn() },
  guardianStudent: { findMany: vi.fn() },
  contratoArquivo: { findMany: vi.fn() },
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

import { avisadosDoItem, destinoContrato, responsavelVeItem } from "@/lib/responsavel-financeiro";
import { destinosDosAlunos } from "@/lib/contratos-server";
import { GET as pendentes, PUT as indicar } from "@/app/api/admin/contratos/responsavel-financeiro/route";
import { GET as listarContratos } from "@/app/api/contratos/route";

const v = (guardianId: string, extra: { fin?: boolean; ativo?: boolean; assinou?: boolean; cpf?: boolean } = {}) => ({
  guardianId,
  responsavelFinanceiro: extra.fin ?? false,
  ativo: extra.ativo ?? true,
  assinouUltimoContrato: extra.assinou ?? false,
  temCpf: extra.cpf ?? false,
});
const ativo = { active: true, deletedAt: null, role: "GUARDIAN" };

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { sub: "dir1", role: "ADMIN", schoolId: "s1", name: "Direção" };
  banco.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  banco.contratoArquivo.findMany.mockResolvedValue([]);
});

describe("quem é o responsável financeiro", () => {
  it("indicado pela direção vence tudo", () => {
    expect(destinoContrato([v("ped", { assinou: true, cpf: true }), v("fin", { fin: true })])).toEqual({ situacao: "FINANCEIRO", ids: ["fin"] });
  });

  it("um só responsável: é ele", () => {
    expect(destinoContrato([v("mae")])).toEqual({ situacao: "UNICO", ids: ["mae"] });
  });

  it("sem indicação: quem assinou o contrato anterior", () => {
    expect(destinoContrato([v("mae", { cpf: true }), v("pai", { assinou: true })])).toEqual({ situacao: "PRESUMIDO_CONTRATO", ids: ["pai"] });
  });

  it("sem indicação nem contrato: o único com CPF de cobrança", () => {
    expect(destinoContrato([v("mae"), v("pai", { cpf: true })])).toEqual({ situacao: "PRESUMIDO_COBRANCA", ids: ["pai"] });
  });

  it("dois com CPF e nenhum outro sinal: ninguém (avisa a direção)", () => {
    expect(destinoContrato([v("mae", { cpf: true }), v("pai", { cpf: true })])).toEqual({ situacao: "INDEFINIDO", ids: [] });
  });

  it("financeiro com a conta desativada não recebe; sobra um ativo, vai para ele", () => {
    expect(destinoContrato([v("pai", { fin: true, ativo: false }), v("mae")])).toEqual({ situacao: "UNICO", ids: ["mae"] });
  });

  it("o cadastro: último contrato assinado por um responsável do aluno e CPF preenchido", async () => {
    banco.guardianStudent.findMany.mockResolvedValue([
      { studentId: "a1", guardianId: "mae", responsavelFinanceiro: false, guardian: { ...ativo, cpf: null } },
      { studentId: "a1", guardianId: "pai", responsavelFinanceiro: false, guardian: { ...ativo, cpf: "12345678900" } },
    ]);
    // O mais recente foi anexado pela direção (não conta); o anterior, enviado pela mãe.
    banco.contratoArquivo.findMany.mockResolvedValue([
      { enviadoPorId: "dir1", contrato: { studentId: "a1" } },
      { enviadoPorId: "mae", contrato: { studentId: "a1" } },
    ]);
    expect((await destinosDosAlunos(["a1"])).get("a1")).toEqual({ situacao: "PRESUMIDO_CONTRATO", ids: ["mae"] });
  });
});

describe("contratos e boletos anteriores à regra seguem como eram", () => {
  const vinculos = [v("mae", { fin: true }), v("pai")];

  it("avisos: anterior vai para quem ia antes; novo só para o destinatário; novo sem destinatário, ninguém", () => {
    expect(avisadosDoItem({ porResponsavelFinanceiro: false, destinatarioId: null }, vinculos, ["mae", "pai"])).toEqual(["mae", "pai"]);
    expect(avisadosDoItem({ porResponsavelFinanceiro: true, destinatarioId: "mae" }, vinculos, ["mae", "pai"])).toEqual(["mae"]);
    expect(avisadosDoItem({ porResponsavelFinanceiro: true, destinatarioId: null }, vinculos, ["mae", "pai"])).toEqual([]);
  });

  it("quem vê no app: anterior, todos os vinculados; novo, só o destinatário", () => {
    expect(responsavelVeItem({ porResponsavelFinanceiro: false, destinatarioId: null }, true, "pai")).toBe(true);
    expect(responsavelVeItem({ porResponsavelFinanceiro: true, destinatarioId: "mae" }, true, "pai")).toBe(false);
    expect(responsavelVeItem({ porResponsavelFinanceiro: true, destinatarioId: "mae" }, true, "mae")).toBe(true);
    expect(responsavelVeItem({ porResponsavelFinanceiro: true, destinatarioId: "mae" }, false, "mae")).toBe(false);
  });
});

describe("direção indica o responsável financeiro", () => {
  const put = (corpo: unknown) =>
    indicar(new NextRequest("http://t/api/admin/contratos/responsavel-financeiro", { method: "PUT", body: JSON.stringify(corpo) }));

  beforeEach(() => {
    banco.student.findFirst.mockResolvedValue({
      id: "a1",
      guardians: [
        { guardianId: "mae", responsavelFinanceiro: false, guardian: { name: "Maria", ...ativo } },
        { guardianId: "pai", responsavelFinanceiro: true, guardian: { name: "João", ...ativo } },
      ],
    });
  });

  it("marca um, desmarca o anterior, registra no histórico e passa os itens em aberto da regra nova para ele", async () => {
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
      campo: "responsavelFinanceiro",
      valorAnterior: "João",
      valorNovo: "Maria",
      porUserId: "dir1",
    });
    expect(tx.contrato.updateMany.mock.calls[0][0]).toEqual({
      where: { studentId: "a1", porResponsavelFinanceiro: true, status: { in: ["AGUARDANDO_ASSINATURA", "DEVOLVIDO"] } },
      data: { destinatarioId: "mae" },
    });
    expect(tx.boleto.updateMany.mock.calls[0][0].where).toMatchObject({ studentId: "a1", porResponsavelFinanceiro: true, codigoSolicitacao: null });
  });

  it("recusa responsável que não é do aluno", async () => {
    const res = await put({ studentId: "a1", guardianId: "outro" });
    expect(res.status).toBe(404);
    expect(banco.$transaction).not.toHaveBeenCalled();
  });

  it("já era o financeiro: não grava histórico", async () => {
    await put({ studentId: "a1", guardianId: "pai" });
    expect(tx.alteracaoCadastro.create).not.toHaveBeenCalled();
  });

  it("lista só alunos com dois ou mais responsáveis em que nada indica o financeiro", async () => {
    const g = (id: string) => ({ relation: null, guardian: { id, name: id } });
    banco.student.findMany.mockResolvedValue([
      { id: "a1", name: "Ana", class: { name: "G3" }, guardians: [g("mae"), g("pai")] },
      { id: "a2", name: "Bia", class: { name: "G3" }, guardians: [g("mae2"), g("pai2")] },
      { id: "a3", name: "Caio", class: { name: "G3" }, guardians: [g("mae3")] },
    ]);
    const vinc = (studentId: string, guardianId: string, fin = false) => ({
      studentId,
      guardianId,
      responsavelFinanceiro: fin,
      guardian: { ...ativo, cpf: null },
    });
    banco.guardianStudent.findMany.mockResolvedValue([vinc("a1", "mae"), vinc("a1", "pai"), vinc("a2", "mae2", true), vinc("a2", "pai2")]);
    const json = await (await pendentes()).json();
    expect(json.pendentes.map((p: { id: string }) => p.id)).toEqual(["a1"]);
  });
});

describe("contratos na tela da família", () => {
  const contrato = (id: string, porResponsavelFinanceiro: boolean, destinatarioId: string | null) => ({
    id,
    titulo: "Contrato 2027",
    anoLetivo: 2027,
    status: "AGUARDANDO_ASSINATURA",
    dadosFamilia: null,
    condicoes: null,
    porResponsavelFinanceiro,
    destinatarioId,
    student: { id: "a1", name: "Ana", class: { name: "G3" } },
    arquivos: [],
  });

  it("o pedagógico não vê o contrato novo enviado ao financeiro; o anterior continua visível", async () => {
    banco.contrato.findMany.mockResolvedValue([contrato("novo", true, "mae"), contrato("antigo", false, null)]);
    sessao.atual = { sub: "pai", role: "GUARDIAN", schoolId: "s1", name: "João" };
    const pai = await (await listarContratos(new NextRequest("http://t/api/contratos"))).json();
    expect(pai.contratos.map((c: { id: string }) => c.id)).toEqual(["antigo"]);

    sessao.atual = { sub: "mae", role: "GUARDIAN", schoolId: "s1", name: "Maria" };
    const mae = await (await listarContratos(new NextRequest("http://t/api/contratos"))).json();
    expect(mae.contratos.map((c: { id: string }) => c.id)).toEqual(["novo", "antigo"]);
    expect(mae.contratos[0]).not.toHaveProperty("destinatarioId");
  });
});
