import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { alertasBaixa, celulaCsv, mesValido, type BoletoPagoConferencia } from "@/lib/conferencia-baixas";
import { correcaoBaixa, valorEmReais } from "@/lib/baixa-boleto";

const prismaMock = vi.hoisted(() => {
  const m = {
    boleto: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    boletoBaixaLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  m.$transaction.mockImplementation(async (fn: (tx: typeof m) => unknown) => fn(m));
  return m;
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
type Sessao = { sub: string; name: string; role: string; schoolId: string };
const sessaoMock = vi.hoisted(() => ({ atual: { sub: "u1", name: "Diretora Ana", role: "ADMIN", schoolId: "s1" } as Sessao }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async (...roles: string[]) => {
    if (!roles.includes(sessaoMock.atual.role)) {
      const { AuthError } = await import("@/lib/session");
      throw new AuthError("Acesso negado para este perfil", 403);
    }
    return sessaoMock.atual;
  }),
  AuthError: class AuthError extends Error {
    constructor(
      message: string,
      readonly status = 401,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/billing", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing")>()),
  agoraNoFusoDaEscola: () => new Date(2026, 10, 4, 10, 0, 0),
}));

import { PATCH } from "@/app/api/admin/billing/boletos/[id]/route";
import { GET } from "@/app/api/admin/billing/conferencia/route";

const hoje = new Date(2026, 10, 4, 10, 0, 0);
const base: BoletoPagoConferencia = {
  valor: 1200,
  valorPago: 1200,
  vencimento: new Date(2026, 9, 5, 12),
  pagoEm: new Date(2026, 9, 5, 12),
  mensalidadeCadastro: 1200,
  bolsista: false,
  alunoExcluido: false,
  baixasPago: 1,
};
const codigos = (b: Partial<BoletoPagoConferencia>) => alertasBaixa({ ...base, ...b }, hoje).map((a) => a.codigo);

describe("alertasBaixa", () => {
  it("baixa certinha não tem alerta", () => {
    expect(codigos({})).toEqual([]);
  });
  it("baixa antiga sem valor recebido não acusa diferença", () => {
    expect(codigos({ valorPago: null })).toEqual([]);
  });
  it("recebido diferente do boleto, com o sentido e o valor da diferença", () => {
    const [a] = alertasBaixa({ ...base, valorPago: 1150 }, hoje);
    expect(a.codigo).toBe("PAGO_DIFERENTE");
    expect(a.texto).toMatch(/a menos/);
    expect(a.texto).toMatch(/50,00/);
    expect(alertasBaixa({ ...base, valorPago: 1250 }, hoje)[0].texto).toMatch(/a mais/);
  });
  it("centavos de arredondamento não contam como diferença", () => {
    expect(codigos({ valorPago: 1200.001 })).toEqual([]);
  });
  it("boleto diferente da mensalidade do cadastro; aluno sem mensalidade", () => {
    expect(codigos({ mensalidadeCadastro: 1300 })).toEqual(["DIFERENTE_MENSALIDADE"]);
    expect(codigos({ mensalidadeCadastro: null })).toEqual(["SEM_MENSALIDADE"]);
  });
  it("valor zerado, sem data, data futura e data distante", () => {
    expect(codigos({ valorPago: 0 })).toContain("VALOR_ZERADO");
    expect(codigos({ pagoEm: null })).toEqual(["SEM_DATA"]);
    expect(codigos({ pagoEm: new Date(2026, 10, 10, 12) })).toEqual(["DATA_FUTURA"]);
    expect(codigos({ pagoEm: new Date(2025, 9, 5, 12) })).toEqual(["DATA_DISTANTE"]);
  });
  it("bolsista pago, baixa refeita e aluno excluído", () => {
    expect(codigos({ bolsista: true, mensalidadeCadastro: null })).toEqual(["BOLSISTA"]);
    expect(codigos({ baixasPago: 2 })).toEqual(["BAIXA_REFEITA"]);
    expect(codigos({ alunoExcluido: true })).toEqual(["ALUNO_EXCLUIDO"]);
  });
});

describe("valorEmReais", () => {
  it("aceita formatos brasileiros e número", () => {
    expect(valorEmReais("1.234,56")).toBe(1234.56);
    expect(valorEmReais("1234,5")).toBe(1234.5);
    expect(valorEmReais("R$ 980,00")).toBe(980);
    expect(valorEmReais("980.00")).toBe(980);
    expect(valorEmReais(1200)).toBe(1200);
  });
  it("recusa zero, negativo, texto e acima do teto", () => {
    expect(() => valorEmReais("0")).toThrow(/maior que zero/);
    expect(() => valorEmReais(-5)).toThrow(/maior que zero/);
    expect(() => valorEmReais("abc")).toThrow(/inválido/);
    expect(() => valorEmReais("12,345")).toThrow(/inválido/);
    expect(() => valorEmReais(60000)).toThrow(/limite/);
  });
});

describe("correcaoBaixa", () => {
  const pago = { status: "PAGO" as const, codigoSolicitacao: null, valor: 1200, valorPago: 1200, pagoEm: new Date(2026, 9, 5, 12) };
  it("devolve só o que muda", () => {
    expect(correcaoBaixa(pago, { valor: 1200, valorPago: 1150 })).toEqual({ valorPago: 1150 });
    expect(correcaoBaixa(pago, { valor: 1100, valorPago: 1200 })).toEqual({ valor: 1100 });
    expect(correcaoBaixa(pago, { dataPagamento: new Date(2026, 9, 8, 12) })).toEqual({ pagoEm: new Date(2026, 9, 8, 12) });
  });
  it("baixa antiga: gravar o recebido igual ao boleto vale como mudança", () => {
    expect(correcaoBaixa({ ...pago, valorPago: null }, { valorPago: 1200 })).toEqual({ valorPago: 1200 });
  });
  it("recusa sem mudança, boleto não pago e confirmado pelo banco", () => {
    expect(() => correcaoBaixa(pago, { valor: 1200, valorPago: 1200, dataPagamento: new Date(2026, 9, 5, 8) })).toThrow(/Nada/);
    expect(() => correcaoBaixa({ ...pago, status: "PENDENTE" }, { valor: 1 })).toThrow(/marcado como pago/);
    expect(() => correcaoBaixa({ ...pago, codigoSolicitacao: "x" }, { valor: 1 })).toThrow(/banco/);
  });
});

describe("celulaCsv e mesValido", () => {
  it("neutraliza fórmula em texto e mantém número negativo", () => {
    expect(celulaCsv("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(celulaCsv("-5,00")).toBe(`"-5,00"`);
    expect(celulaCsv('Ana "Bia"')).toBe(`"Ana ""Bia"""`);
    expect(celulaCsv(null)).toBe(`""`);
  });
  it("competência AAAA-MM", () => {
    expect(mesValido("2026-11")).toBe(true);
    expect(mesValido("2026-13")).toBe(false);
    expect(mesValido("11/2026")).toBe(false);
  });
});

const ctx = { params: Promise.resolve({ id: "b1" }) } as never;
const patch = (corpo: unknown) =>
  PATCH(new NextRequest("http://x/api/admin/billing/boletos/b1", { method: "PATCH", body: JSON.stringify(corpo) }), ctx);
const boletoPago = {
  id: "b1",
  schoolId: "s1",
  status: "PAGO",
  codigoSolicitacao: null,
  valor: 1200,
  valorPago: null,
  pagoEm: new Date(2026, 9, 5, 12),
  updatedAt: new Date(2026, 9, 5, 13),
};

describe("PATCH CORRIGIR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessaoMock.atual = { sub: "u1", name: "Diretora Ana", role: "ADMIN", schoolId: "s1" };
    prismaMock.boleto.findFirst.mockResolvedValue(boletoPago);
    prismaMock.boleto.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.boleto.findUniqueOrThrow.mockResolvedValue({ ...boletoPago, valorPago: 1150 });
  });

  it("corrige o recebido, grava antes/depois e o motivo no histórico", async () => {
    const r = await patch({ acao: "CORRIGIR", valor: "1200,00", valorPago: "1150,00", dataPagamento: "2026-10-05", motivo: "Família pagou a menos" });
    expect(r.status).toBe(200);
    expect(prismaMock.boleto.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", status: "PAGO", updatedAt: boletoPago.updatedAt },
      data: { valorPago: 1150 },
    });
    const log = prismaMock.boletoBaixaLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ acao: "CORRIGIR", valorPago: 1150, valorPagoAnterior: null, valorAnterior: 1200, motivo: "Família pagou a menos", porNome: "Diretora Ana" });
  });

  it("exige motivo", async () => {
    const r = await patch({ acao: "CORRIGIR", valorPago: "1150" });
    expect(r.status).toBe(400);
    expect(prismaMock.boleto.updateMany).not.toHaveBeenCalled();
  });

  it("recusa se outra pessoa alterou o boleto no meio", async () => {
    prismaMock.boleto.updateMany.mockResolvedValue({ count: 0 });
    const r = await patch({ acao: "CORRIGIR", valorPago: "1150", motivo: "teste" });
    expect(r.status).toBe(409);
    expect(prismaMock.boletoBaixaLog.create).not.toHaveBeenCalled();
  });

  it("boleto de outra escola não aparece", async () => {
    prismaMock.boleto.findFirst.mockResolvedValue(null);
    const r = await patch({ acao: "CORRIGIR", valorPago: "1150", motivo: "teste" });
    expect(r.status).toBe(404);
    expect(prismaMock.boleto.findFirst).toHaveBeenCalledWith({ where: { id: "b1", schoolId: "s1" } });
  });

  it("equipe (STAFF) não corrige", async () => {
    sessaoMock.atual = { ...sessaoMock.atual, role: "STAFF" };
    const r = await patch({ acao: "CORRIGIR", valorPago: "1150", motivo: "teste" });
    expect(r.status).toBe(403);
  });

  it("baixa nova grava o valor recebido (padrão: o do boleto)", async () => {
    prismaMock.boleto.findFirst.mockResolvedValue({ ...boletoPago, status: "PENDENTE", pagoEm: null });
    prismaMock.boleto.update.mockResolvedValue({ id: "b1", status: "PAGO", pagoEm: new Date() });
    await patch({ acao: "PAGO", dataPagamento: "2026-11-03" });
    expect(prismaMock.boleto.update.mock.calls[0][0].data.valorPago).toBe(1200);
    await patch({ acao: "PAGO", dataPagamento: "2026-11-03", valorPago: "1.100,00" });
    expect(prismaMock.boleto.update.mock.calls[1][0].data.valorPago).toBe(1100);
  });

  it("desfazer apaga o recebido", async () => {
    prismaMock.boleto.update.mockResolvedValue({ id: "b1", status: "PENDENTE", pagoEm: null });
    await patch({ acao: "DESFAZER" });
    expect(prismaMock.boleto.update.mock.calls[0][0].data).toMatchObject({ status: "PENDENTE", pagoEm: null, valorPago: null });
  });
});

describe("GET conferência", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessaoMock.atual = { sub: "u1", name: "Diretora Ana", role: "ADMIN", schoolId: "s1" };
  });
  const get = (qs = "") => GET(new NextRequest(`http://x/api/admin/billing/conferencia${qs}`));

  it("lista pagos da escola no período com alertas e totais", async () => {
    prismaMock.boleto.findMany.mockResolvedValue([
      {
        ...boletoPago,
        valorPago: 1150,
        mesReferencia: "2026-10",
        vencimento: new Date(2026, 9, 5, 12),
        student: { name: "Bia", deletedAt: null, bolsista: false, mensalidadeValor: 1200, class: { name: "Infantil 3" }, guardians: [{ guardian: { name: "Carla" } }] },
        baixas: [{ acao: "PAGO", porNome: "Secretaria", criadoEm: new Date(2026, 9, 6), motivo: null }],
      },
    ]);
    const r = await get("?de=2026-01&ate=2026-11");
    const d = await r.json();
    expect(prismaMock.boleto.findMany.mock.calls[0][0].where).toEqual({ schoolId: "s1", status: "PAGO", mesReferencia: { gte: "2026-01", lte: "2026-11" } });
    expect(d.itens[0]).toMatchObject({ aluno: "Bia", valor: 1200, valorPago: 1150, diferenca: -50, baixaPor: "Secretaria", manual: true });
    expect(d.itens[0].alertas.map((a: { codigo: string }) => a.codigo)).toEqual(["PAGO_DIFERENTE"]);
    expect(d.totais).toMatchObject({ quantidade: 1, valorBoletos: 1200, valorRecebido: 1150, comAlerta: 1 });
  });

  it("valida competência e perfil", async () => {
    expect((await get("?de=2026-13")).status).toBe(400);
    expect((await get("?de=2026-11&ate=2026-01")).status).toBe(400);
    sessaoMock.atual = { ...sessaoMock.atual, role: "GUARDIAN" };
    expect((await get()).status).toBe(403);
  });
});
