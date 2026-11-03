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
}));
const notifyUsers = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/push", () => ({ notifyUsers }));
vi.mock("@/lib/contratos-server", () => ({ responsaveisDoAluno: vi.fn(async () => ["g1"]), sha256Hex: () => "hash" }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async () => ({ sub: "u1", role: "ADMIN", schoolId: "s1" })),
  AuthError: class AuthError extends Error {},
}));

import { GET, POST } from "@/app/api/admin/contratos/valores/route";
import { conferirValor, precisaAtualizar } from "@/lib/contrato-modelo/conferencia";
import { MODELO_CONTRATO_2027, configInicial, cronogramaParcelas, type CondicoesContrato } from "@/lib/contrato-modelo/tipos";

const condicoes = (extra: Partial<CondicoesContrato> = {}): CondicoesContrato => ({
  modelo: MODELO_CONTRATO_2027,
  anoLetivo: 2027,
  etapa: "EI",
  turma: "Maternal",
  periodo: null,
  parcelaBruta: 0,
  parcelaLiquida: 0,
  config: configInicial(),
  ...extra,
});

const contrato = (id: string, c: CondicoesContrato, aluno: { mensalidadeValor: string | null; bolsista?: boolean }, extra: object = {}) => ({
  id,
  status: "AGUARDANDO_ASSINATURA",
  createdAt: new Date("2026-11-01T12:00:00Z"),
  condicoes: c,
  dadosFamilia: null,
  studentId: `s-${id}`,
  student: { name: `Aluno ${id}`, mensalidadeValor: aluno.mensalidadeValor, bolsista: aluno.bolsista ?? false, class: { name: "Maternal" } },
  arquivos: [],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  tx.contrato.updateMany.mockResolvedValue({ count: 1 });
});

describe("cronograma das 12 parcelas na cláusula 7ª", () => {
  it("lista as 12 parcelas de 05/01/2027 a 05/12/2027 com o mesmo valor", () => {
    const linhas = cronogramaParcelas(configInicial().parcelas, 2730);
    expect(linhas).toHaveLength(12);
    expect(linhas[0]).toEqual({ rotulo: "1ª parcela - 05/01/2027 (jan)", valor: 2730 });
    expect(linhas[11]).toEqual({ rotulo: "12ª parcela - 05/12/2027 (dez)", valor: 2730 });
    expect(linhas.reduce((s, l) => s + l.valor, 0)).toBe(32760);
  });

  it("sem datas legíveis, numera as parcelas", () => {
    const linhas = cronogramaParcelas({ ...configInicial().parcelas, primeiroUltimo: "" }, 100);
    expect(linhas[0].rotulo).toBe("Parcela 1/12");
  });
});

describe("conferência do valor gravado no contrato", () => {
  const aluno = { mensalidade: 2500, bolsista: false };
  it("classifica cada situação", () => {
    expect(conferirValor(condicoes({ parcelaBruta: 2730 }), aluno)).toEqual({ situacao: "OK", valorContrato: 2730, valorEsperado: 2730 });
    expect(conferirValor(condicoes(), aluno).situacao).toBe("SEM_VALOR");
    expect(conferirValor(condicoes({ parcelaBruta: 2500 }), aluno).situacao).toBe("VALOR_DIFERENTE");
    expect(conferirValor(condicoes({ parcelaBruta: 2000, reajuste: { valorAnterior: 2500, percentual: 9.2, base: "BRUTA" } }), aluno).situacao).toBe(
      "AJUSTADO",
    );
    expect(conferirValor(condicoes(), { mensalidade: null, bolsista: false }).situacao).toBe("SEM_MENSALIDADE");
    expect(conferirValor(condicoes({ bolsista: true }), { mensalidade: null, bolsista: true }).situacao).toBe("OK");
    expect(conferirValor(condicoes(), { mensalidade: null, bolsista: true }).situacao).toBe("SEM_VALOR");
  });

  it("só atualiza contrato em branco ou com valor sem a correção", () => {
    expect(precisaAtualizar("SEM_VALOR")).toBe(true);
    expect(precisaAtualizar("VALOR_DIFERENTE")).toBe(true);
    expect(precisaAtualizar("OK")).toBe(false);
    expect(precisaAtualizar("AJUSTADO")).toBe(false);
    expect(precisaAtualizar("SEM_MENSALIDADE")).toBe(false);
  });
});

describe("rota de conferência dos contratos 2027", () => {
  const lista = () => [
    contrato("c1", condicoes(), { mensalidadeValor: "2500.00" }),
    contrato("c2", condicoes({ parcelaBruta: 2730, parcelaLiquida: 2730 }), { mensalidadeValor: "2500.00" }),
    contrato("c3", condicoes(), { mensalidadeValor: "2500.00" }, { status: "ASSINADO" }),
  ];

  it("GET lista o valor no contrato, o corrigido e quem já assinou, sem alterar nada", async () => {
    prismaMock.contrato.findMany.mockResolvedValue(lista());
    const json = await (await GET()).json();
    expect(json.linhas.map((l: { id: string; situacao: string; assinado: boolean; atualizavel: boolean }) => [l.id, l.situacao, l.assinado, l.atualizavel])).toEqual([
      ["c1", "SEM_VALOR", false, true],
      ["c2", "OK", false, false],
      ["c3", "SEM_VALOR", true, false],
    ]);
    expect(tx.contrato.updateMany).not.toHaveBeenCalled();
  });

  it("POST atualiza só o não assinado sem valor, registra o evento e avisa a família", async () => {
    prismaMock.contrato.findMany.mockResolvedValue(lista());
    const json = await (await POST(new NextRequest("http://t/api/admin/contratos/valores", { method: "POST" }))).json();
    expect(json).toEqual({ atualizados: [{ id: "c1", nome: "Aluno c1" }], total: 1 });
    expect(tx.contrato.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = tx.contrato.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ id: "c1", status: "AGUARDANDO_ASSINATURA" });
    expect(data.condicoes).toMatchObject({ parcelaBruta: 2730, parcelaLiquida: 2730, reajuste: { valorAnterior: 2500, percentual: 9.2, base: "BRUTA" } });
    expect(tx.contratoEvento.create.mock.calls[0][0].data).toMatchObject({
      tipo: "CONDICOES_ATUALIZADAS",
      detalhe: "Valor da parcela atualizado: em branco → R$ 2.730,00",
    });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
  });

  it("POST não mexe se a família assinou no meio-tempo", async () => {
    prismaMock.contrato.findMany.mockResolvedValue([lista()[0]]);
    tx.contrato.updateMany.mockResolvedValue({ count: 0 });
    const json = await (await POST(new NextRequest("http://t/api/admin/contratos/valores", { method: "POST" }))).json();
    expect(json.total).toBe(0);
    expect(tx.contratoArquivo.create).not.toHaveBeenCalled();
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});

describe("atualização de um contrato só (botão no cartão do aluno)", () => {
  it("POST com ids atualiza só o contrato pedido", async () => {
    prismaMock.contrato.findMany.mockResolvedValue([
      contrato("c1", condicoes(), { mensalidadeValor: "750.00" }),
      contrato("c4", condicoes(), { mensalidadeValor: "2500.00" }),
    ]);
    const req = new NextRequest("http://t/api/admin/contratos/valores", { method: "POST", body: JSON.stringify({ ids: ["c1"] }) });
    const json = await (await POST(req)).json();
    expect(json).toEqual({ atualizados: [{ id: "c1", nome: "Aluno c1" }], total: 1 });
    expect(tx.contrato.updateMany.mock.calls[0][0].data.condicoes).toMatchObject({ parcelaBruta: 819, parcelaLiquida: 819 });
  });
});
