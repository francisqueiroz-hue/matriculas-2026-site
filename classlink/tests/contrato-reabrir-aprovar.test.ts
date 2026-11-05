import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Aprovar envio "gov.br" sem assinatura digital pede confirmação; contrato aprovado pode ser reaberto.

const banco = vi.hoisted(() => {
  const tx = {
    contrato: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(async () => ({ id: "c1" })) },
    contratoEvento: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      contrato: { findFirst: vi.fn() },
      contratoArquivo: { findFirst: vi.fn(), count: vi.fn() },
      guardianStudent: { findMany: vi.fn(async () => [{ guardianId: "resp1" }]) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: banco.prisma }));
const push = vi.hoisted(() => ({ notifyUsers: vi.fn(async () => undefined) }));
vi.mock("@/lib/push", () => push);
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async () => ({ sub: "dir1", role: "ADMIN", schoolId: "escola1", name: "Direção" })),
  AuthError: class extends Error {},
}));

import { PATCH } from "@/app/api/admin/contratos/[id]/route";
import { ERRO_SEM_ASSINATURA_DIGITAL } from "@/lib/contratos";

const ctx = { params: Promise.resolve({ id: "c1" }) } as never;
const req = (corpo: unknown) => new NextRequest("http://t/api/admin/contratos/c1", { method: "PATCH", body: JSON.stringify(corpo) });
const pdfSemAssinatura = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  banco.tx.contrato.updateMany.mockResolvedValue({ count: 1 });
  banco.prisma.contratoArquivo.findFirst.mockResolvedValue({ conteudo: pdfSemAssinatura, blobPath: null });
  banco.prisma.contratoArquivo.count.mockResolvedValue(1);
});

describe("aprovar envio gov.br", () => {
  beforeEach(() => {
    banco.prisma.contrato.findFirst.mockResolvedValue({ id: "c1", studentId: "a1", status: "EM_CONFERENCIA", metodoAssinatura: "GOVBR", student: { name: "Ravi" } });
  });

  it("sem assinatura digital no PDF: recusa e pede confirmação", async () => {
    const res = await PATCH(req({ acao: "APROVAR" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(ERRO_SEM_ASSINATURA_DIGITAL);
    expect(banco.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("com confirmação explícita aprova e registra no histórico", async () => {
    const res = await PATCH(req({ acao: "APROVAR", confirmarSemAssinatura: true }), ctx);
    expect(res.status).toBe(200);
    expect(banco.tx.contrato.updateMany.mock.calls[0][0].data.status).toBe("COMPLETO");
    expect(banco.tx.contratoEvento.create.mock.calls[0][0].data.detalhe).toMatch(/sem assinatura digital/);
  });

  it("assinatura à mão não passa pela pré-conferência", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValueOnce({ id: "c1", studentId: "a1", status: "EM_CONFERENCIA", metodoAssinatura: "MANUSCRITA", student: { name: "Ravi" } });
    expect((await PATCH(req({ acao: "APROVAR" }), ctx)).status).toBe(200);
    expect(banco.prisma.contratoArquivo.findFirst).not.toHaveBeenCalled();
  });
});

describe("reabrir contrato aprovado", () => {
  it("completo volta a devolvido com motivo, avisa a família e limpa o 'anexado pela escola'", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue({ id: "c1", studentId: "a1", status: "COMPLETO", metodoAssinatura: "GOVBR", student: { name: "Ravi" } });
    const res = await PATCH(req({ acao: "REABRIR", motivo: "o PDF não tem assinatura" }), ctx);
    expect(res.status).toBe(200);
    expect(banco.tx.contrato.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", status: "COMPLETO" },
      data: { status: "DEVOLVIDO", motivoDevolucao: "o PDF não tem assinatura", confirmadoPelaEscola: false },
    });
    expect(banco.tx.contratoEvento.create.mock.calls[0][0].data).toMatchObject({ tipo: "DEVOLVIDO" });
    expect(banco.tx.contratoEvento.create.mock.calls[0][0].data.detalhe).toMatch(/^Reaberto pela escola/);
    expect(push.notifyUsers).toHaveBeenCalledWith(["resp1"], expect.objectContaining({ title: "Contrato devolvido para correção" }));
  });

  it("não reabre contrato que não foi aprovado", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue({ id: "c1", studentId: "a1", status: "AGUARDANDO_ASSINATURA", metodoAssinatura: null, student: { name: "Ravi" } });
    expect((await PATCH(req({ acao: "REABRIR", motivo: "teste" }), ctx)).status).toBe(409);
  });

  it("não reabre contrato registrado pela escola sem modelo (a família não teria como reenviar)", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue({ id: "c1", studentId: "a1", status: "COMPLETO", metodoAssinatura: "MANUSCRITA", student: { name: "Ravi" } });
    banco.prisma.contratoArquivo.count.mockResolvedValue(0);
    const res = await PATCH(req({ acao: "REABRIR", motivo: "teste" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Anexar\/substituir/);
    expect(banco.tx.contrato.updateMany).not.toHaveBeenCalled();
  });
});
