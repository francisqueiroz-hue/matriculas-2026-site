import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  consentimentoLgpd: { updateMany: vi.fn(), create: vi.fn() },
  fichaSaude: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  pessoaAutorizada: { updateMany: vi.fn(), createMany: vi.fn() },
  alteracaoCadastro: { createMany: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  guardianStudent: { findFirst: vi.fn(), findMany: vi.fn() },
  student: { findFirst: vi.fn() },
  consentimentoLgpd: { findFirst: vi.fn() },
  fichaSaude: { findUnique: vi.fn(), findMany: vi.fn() },
  pessoaAutorizada: { findMany: vi.fn() },
  alteracaoCadastro: { findMany: vi.fn() },
}));
const pushMock = vi.hoisted(() => ({ notifyUsers: vi.fn() }));
vi.mock("@/lib/push", () => pushMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
type Sessao = { sub: string; role: string; schoolId: string; name: string };
const sessaoMock = vi.hoisted(() => ({ atual: {} as Sessao }));
vi.mock("@/lib/session", () => {
  class AuthError extends Error {
    constructor(
      message: string,
      readonly status = 401,
    ) {
      super(message);
    }
  }
  return { AuthError, requireSession: vi.fn(async () => sessaoMock.atual) };
});

import { GET, PUT } from "@/app/api/alunos/[id]/saude/route";
import { POST as conferir } from "@/app/api/alunos/[id]/saude/conferir/route";
import { DELETE as revogar } from "@/app/api/alunos/[id]/saude/consentimento/route";
import { GET as entrada } from "@/app/api/saude/route";
import { VERSAO_TERMO_SAUDE } from "@/lib/ficha-saude";

const ctx = { params: Promise.resolve({ id: "a1" }) } as never;
const DIRECAO: Sessao = { sub: "d1", role: "ADMIN", schoolId: "s1", name: "Direção" };
const MAE: Sessao = { sub: "g1", role: "GUARDIAN", schoolId: "s1", name: "Ana Souza" };
const PROFESSORA: Sessao = { sub: "p1", role: "STAFF", schoolId: "s1", name: "Prof" };
const aluno = {
  id: "a1",
  name: "Lia Souza",
  class: { name: "Maternal" },
  guardians: [{ relation: "mãe", guardian: { id: "g1", name: "Ana Souza" } }],
};
const consentimento = { id: "c1", versaoTexto: VERSAO_TERMO_SAUDE, consentidoPorNome: "Ana Souza", consentidoEm: new Date() };
const req = (metodo = "GET", corpo?: unknown) =>
  new NextRequest("http://t/api/alunos/a1/saude", { method: metodo, ...(corpo !== undefined && { body: JSON.stringify(corpo) }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessaoMock.atual = DIRECAO;
  prismaMock.user.findUnique.mockResolvedValue({ isCoordenacao: false });
  prismaMock.user.findMany.mockResolvedValue([{ id: "d1" }, { id: "c9" }]);
  prismaMock.guardianStudent.findFirst.mockResolvedValue({ id: "v1" });
  prismaMock.student.findFirst.mockResolvedValue(aluno);
  prismaMock.consentimentoLgpd.findFirst.mockResolvedValue(consentimento);
  prismaMock.fichaSaude.findUnique.mockResolvedValue({ alergias: "leite", medicamentos: null, condicoes: null, restricoesAlimentares: null, orientacoesEmergencia: null });
  prismaMock.pessoaAutorizada.findMany.mockResolvedValue([]);
  prismaMock.alteracaoCadastro.findMany.mockResolvedValue([]);
  tx.fichaSaude.findUnique.mockResolvedValue(null);
  tx.consentimentoLgpd.updateMany.mockResolvedValue({ count: 1 });
  pushMock.notifyUsers.mockResolvedValue({ aparelhos: 0, enviados: 0, erros: [] });
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe("quem pode ver", () => {
  it("professor sem coordenação: 403", async () => {
    sessaoMock.atual = PROFESSORA;
    expect((await GET(req(), ctx)).status).toBe(403);
    expect((await entrada()).status).toBe(403);
  });

  it("coordenação vê (conferido no banco)", async () => {
    sessaoMock.atual = PROFESSORA;
    prismaMock.user.findUnique.mockResolvedValue({ isCoordenacao: true });
    const r = await GET(req(), ctx);
    expect(r.status).toBe(200);
    expect((await r.json()).saude.alergias).toBe("leite");
  });

  it("família de outro aluno: 404, sem revelar o aluno", async () => {
    sessaoMock.atual = MAE;
    prismaMock.guardianStudent.findFirst.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(404);
    expect(prismaMock.student.findFirst).not.toHaveBeenCalled();
  });

  it("família vê a ficha, mas não o histórico nem o controle de conferência", async () => {
    sessaoMock.atual = MAE;
    const d = await (await GET(req(), ctx)).json();
    expect(d.papel).toBe("FAMILIA");
    expect(d.historico).toBeNull();
    expect(d.conferencia).toBeNull();
  });

  it("sem consentimento ativo, os dados de saúde não saem", async () => {
    prismaMock.consentimentoLgpd.findFirst.mockResolvedValue(null);
    const d = await (await GET(req(), ctx)).json();
    expect(d.saude).toBeNull();
  });

  it("nunca consulta nem devolve mensalidade", async () => {
    const d = await (await GET(req(), ctx)).json();
    expect(JSON.stringify(d)).not.toMatch(/mensalidade|bolsista|diaVencimento/i);
    const select = prismaMock.student.findFirst.mock.calls[0][0].select;
    expect(Object.keys(select)).not.toContain("mensalidadeValor");
  });
});

describe("salvar", () => {
  it("recusa dado de saúde sem consentimento", async () => {
    prismaMock.consentimentoLgpd.findFirst.mockResolvedValue(null);
    const r = await PUT(req("PUT", { ficha: { alergias: "ovo" } }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/consentimento/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("família aceita o termo e salva no mesmo envio; escola é avisada", async () => {
    sessaoMock.atual = MAE;
    prismaMock.consentimentoLgpd.findFirst.mockResolvedValue(null);
    prismaMock.fichaSaude.findUnique.mockResolvedValue(null);
    const r = await PUT(
      req("PUT", { ficha: { alergias: "ovo" }, consentimento: { aceito: true, versaoTexto: VERSAO_TERMO_SAUDE } }),
      ctx,
    );
    expect(r.status).toBe(200);
    expect(tx.consentimentoLgpd.create.mock.calls[0][0].data).toMatchObject({
      finalidade: "DADO_DE_SAUDE",
      consentidoPorId: "g1",
      consentidoPorNome: "Ana Souza",
      versaoTexto: VERSAO_TERMO_SAUDE,
    });
    const upsert = tx.fichaSaude.upsert.mock.calls[0][0];
    expect(upsert.create).toMatchObject({ alergias: "ovo", alteradoPelaFamiliaPor: "Ana Souza" });
    expect(upsert.create.pendenteConferenciaDesde).toBeInstanceOf(Date);
    const historico = tx.alteracaoCadastro.createMany.mock.calls[0][0].data;
    expect(historico.map((h: { campo: string }) => h.campo)).toEqual(["saude.alergias", "consentimento"]);
    expect(historico[0]).toMatchObject({ entidade: "ALUNO_SAUDE", porNome: "Ana Souza (família)", valorAnterior: null, valorNovo: "ovo" });
    expect(pushMock.notifyUsers).toHaveBeenCalledWith(["d1", "c9"], expect.objectContaining({ url: "/dashboard/saude?aluno=a1" }));
    // Destinatários: direção e coordenação ativas desta escola.
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toMatchObject({ schoolId: "s1", active: true, deletedAt: null });
  });

  it("escola registra aceite em papel só de responsável vinculado", async () => {
    prismaMock.consentimentoLgpd.findFirst.mockResolvedValue(null);
    const ruim = await PUT(req("PUT", { consentimento: { aceito: true, versaoTexto: VERSAO_TERMO_SAUDE, consentidoPorId: "estranho" } }), ctx);
    expect(ruim.status).toBe(400);
    const ok = await PUT(req("PUT", { consentimento: { aceito: true, versaoTexto: VERSAO_TERMO_SAUDE, consentidoPorId: "g1" } }), ctx);
    expect(ok.status).toBe(200);
    expect(tx.consentimentoLgpd.create.mock.calls[0][0].data).toMatchObject({ consentidoPorId: "g1", consentidoPorNome: "Ana Souza" });
  });

  it("alteração da escola não avisa nem marca 'a conferir'", async () => {
    await PUT(req("PUT", { ficha: { alergias: "leite e ovo" } }), ctx);
    expect(tx.fichaSaude.upsert.mock.calls[0][0].update.pendenteConferenciaDesde).toBeUndefined();
    expect(pushMock.notifyUsers).not.toHaveBeenCalled();
    expect(tx.alteracaoCadastro.createMany.mock.calls[0][0].data[0]).toMatchObject({
      campo: "saude.alergias",
      valorAnterior: "leite",
      valorNovo: "leite e ovo",
      porNome: "Direção (escola)",
    });
  });

  it("nada mudou: não grava nem avisa", async () => {
    sessaoMock.atual = MAE;
    const r = await PUT(req("PUT", { ficha: { alergias: "leite" } }), ctx);
    expect(await r.json()).toEqual({ ok: true, alterado: false });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(pushMock.notifyUsers).not.toHaveBeenCalled();
  });

  it("autorizados: inclui e remove (removido fica guardado com data)", async () => {
    sessaoMock.atual = MAE;
    prismaMock.pessoaAutorizada.findMany.mockResolvedValue([
      { id: "p1", nome: "João Souza", parentesco: "tio", telefone: null, documento: null, observacao: null },
    ]);
    const r = await PUT(req("PUT", { autorizados: [{ nome: "Maria Souza", parentesco: "avó", telefone: "(21) 99876-5432" }] }), ctx);
    expect(r.status).toBe(200);
    expect(tx.pessoaAutorizada.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["p1"] }, studentId: "a1" } });
    expect(tx.pessoaAutorizada.updateMany.mock.calls[0][0].data.removidoEm).toBeInstanceOf(Date);
    expect(tx.pessoaAutorizada.createMany.mock.calls[0][0].data[0]).toMatchObject({ nome: "Maria Souza", telefone: "21998765432", studentId: "a1" });
    expect(pushMock.notifyUsers).toHaveBeenCalledTimes(1);
  });

  it("id de pessoa de outro aluno: 409", async () => {
    const r = await PUT(req("PUT", { autorizados: [{ id: "de-outro", nome: "Fulano" }] }), ctx);
    expect(r.status).toBe(409);
  });

  it("professor não salva", async () => {
    sessaoMock.atual = PROFESSORA;
    expect((await PUT(req("PUT", { ficha: { alergias: "x" } }), ctx)).status).toBe(403);
  });
});

describe("conferência e retirada do consentimento", () => {
  it("família não confere; escola confere e o aviso sai", async () => {
    sessaoMock.atual = MAE;
    expect((await conferir(req("POST"), ctx)).status).toBe(403);
    sessaoMock.atual = DIRECAO;
    tx.fichaSaude.findUnique.mockResolvedValue({ pendenteConferenciaDesde: new Date(), alteradoPelaFamiliaPor: "Ana Souza" });
    expect((await conferir(req("POST"), ctx)).status).toBe(200);
    expect(tx.fichaSaude.update.mock.calls[0][0].data).toMatchObject({ pendenteConferenciaDesde: null, conferidoPorNome: "Direção" });
  });

  it("nada a conferir: 409", async () => {
    tx.fichaSaude.findUnique.mockResolvedValue({ pendenteConferenciaDesde: null });
    expect((await conferir(req("POST"), ctx)).status).toBe(409);
  });

  it("família retira o consentimento: apaga a saúde, guarda histórico e avisa a escola", async () => {
    sessaoMock.atual = MAE;
    tx.fichaSaude.findUnique.mockResolvedValue({ alergias: "leite", medicamentos: null, condicoes: null, restricoesAlimentares: null, orientacoesEmergencia: null });
    expect((await revogar(req("DELETE"), ctx)).status).toBe(200);
    expect(tx.fichaSaude.update.mock.calls[0][0].data).toMatchObject({ alergias: null, medicamentos: null });
    const campos = tx.alteracaoCadastro.createMany.mock.calls[0][0].data.map((h: { campo: string }) => h.campo);
    expect(campos).toEqual(["consentimento", "saude.alergias"]);
    expect(pushMock.notifyUsers).toHaveBeenCalledTimes(1);
  });
});

describe("entrada da tela", () => {
  it("família recebe só os filhos; escola recebe as fichas a conferir", async () => {
    sessaoMock.atual = MAE;
    prismaMock.guardianStudent.findMany.mockResolvedValue([{ student: { id: "a1", name: "Lia Souza", class: { name: "Maternal" } } }]);
    expect(await (await entrada()).json()).toEqual({ papel: "FAMILIA", alunos: [{ id: "a1", name: "Lia Souza", turma: "Maternal" }] });

    sessaoMock.atual = DIRECAO;
    prismaMock.fichaSaude.findMany.mockResolvedValue([
      { pendenteConferenciaDesde: new Date("2026-11-16T12:00:00Z"), alteradoPelaFamiliaPor: "Ana Souza", student: { id: "a1", name: "Lia Souza", class: { name: "Maternal" } } },
    ]);
    const d = await (await entrada()).json();
    expect(d.pendentes[0]).toMatchObject({ alunoId: "a1", por: "Ana Souza" });
    expect(prismaMock.fichaSaude.findMany.mock.calls[0][0].where).toMatchObject({ schoolId: "s1" });
  });
});
