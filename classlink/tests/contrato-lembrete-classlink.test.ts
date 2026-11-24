import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Lembrete do contrato também pelo ClassLink: mensagem nas Mensagens + notificação, uma vez por dia.

const banco = vi.hoisted(() => ({
  prisma: {
    contrato: { findFirst: vi.fn() },
    lembretePendencia: { findUnique: vi.fn(), upsert: vi.fn() },
    conversation: { upsert: vi.fn<(args: { create: unknown }) => Promise<{ id: string }>>(async () => ({ id: "conv1" })) },
    message: { create: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: banco.prisma }));
const push = vi.hoisted(() => ({ notifyUsers: vi.fn(async () => ({ enviados: 1 })) }));
vi.mock("@/lib/push", () => push);
vi.mock("@/lib/permissoes-mensagens", () => ({ exigirPodeConversar: vi.fn(async () => undefined) }));
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/session", () => ({
  requireDirecao: vi.fn(async () => ({ sub: "dir1", role: "ADMIN", schoolId: "escola1", name: "Direção" })),
  AuthError: class extends Error {},
}));

import { POST } from "@/app/api/admin/contratos/[id]/lembrete/route";
import { jaLembradoHoje, textoLembreteContrato } from "@/lib/lembrete-contrato";

const ctx = { params: Promise.resolve({ id: "c1" }) } as never;
const req = (corpo: unknown) => new NextRequest("http://t/api/admin/contratos/c1/lembrete", { method: "POST", body: JSON.stringify(corpo) });
const contrato = (status: string, guardians = [{ guardian: { id: "resp1", name: "Maria Souza" } }]) => ({
  id: "c1",
  status,
  anoLetivo: 2027,
  updatedAt: new Date("2026-11-10T12:00:00Z"),
  student: { name: "Ravi Souza", guardians },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  banco.prisma.lembretePendencia.findUnique.mockResolvedValue(null);
});

describe("lembrar no ClassLink", () => {
  it("grava a mensagem na conversa da direção com a família, notifica e marca o lembrete do dia", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue(contrato("AGUARDANDO_ASSINATURA"));
    const res = await POST(req({ responsavelId: "resp1" }), ctx);
    expect(res.status).toBe(201);
    expect(banco.prisma.conversation.upsert.mock.calls[0][0].create).toEqual({ staffId: "dir1", guardianId: "resp1" });
    const msg = banco.prisma.message.create.mock.calls[0][0].data;
    expect(msg).toMatchObject({ conversationId: "conv1", senderId: "dir1", channel: "APP" });
    expect(msg.body).toMatch(/Olá, Maria!.*contrato de matrícula 2027 de Ravi está aguardando/);
    expect(push.notifyUsers).toHaveBeenCalledWith(["resp1"], expect.objectContaining({ url: "/dashboard/contratos" }));
    const marca = banco.prisma.lembretePendencia.upsert.mock.calls[0][0];
    expect(marca.where.tipo_referenciaId_responsavelId).toEqual({ tipo: "CONTRATO", referenciaId: "c1", responsavelId: "resp1" });
    expect(marca.update.ultimoEnvioEm).toBeInstanceOf(Date);
    // Não gasta um dos envios automáticos.
    expect(marca.update).not.toHaveProperty("envios");
  });

  it("não duplica: família já lembrada hoje (automático ou manual) recebe 409 e nada é enviado", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue(contrato("AGUARDANDO_ASSINATURA"));
    banco.prisma.lembretePendencia.findUnique.mockResolvedValue({ ultimoEnvioEm: new Date() });
    const res = await POST(req({ responsavelId: "resp1" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/já recebeu o lembrete deste contrato hoje/);
    expect(banco.prisma.message.create).not.toHaveBeenCalled();
    expect(push.notifyUsers).not.toHaveBeenCalled();
  });

  it("contrato que já saiu da família (em conferência) não gera lembrete", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue(contrato("EM_CONFERENCIA"));
    expect((await POST(req({ responsavelId: "resp1" }), ctx)).status).toBe(409);
    expect(banco.prisma.message.create).not.toHaveBeenCalled();
  });

  it("responsável que não é do aluno: 404", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue(contrato("AGUARDANDO_ASSINATURA", []));
    expect((await POST(req({ responsavelId: "outro" }), ctx)).status).toBe(404);
    expect(banco.prisma.message.create).not.toHaveBeenCalled();
  });

  it("contrato de outra escola: 404", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue(null);
    expect((await POST(req({ responsavelId: "resp1" }), ctx)).status).toBe(404);
  });
});

describe("regras do lembrete", () => {
  it("devolvido pede o reenvio corrigido", () => {
    expect(textoLembreteContrato("Maria", "Ravi", 2027, "DEVOLVIDO")).toMatch(/voltou para correção/);
  });
  it("mesmo dia é contado no calendário de Brasília", () => {
    // 17/11 22h em Brasília (18/11 01h UTC) e 17/11 10h em Brasília: mesmo dia.
    expect(jaLembradoHoje(new Date("2026-11-17T13:00:00Z"), new Date("2026-11-18T01:00:00Z"))).toBe(true);
    // 17/11 13h UTC e 18/11 13h UTC: dias diferentes.
    expect(jaLembradoHoje(new Date("2026-11-17T13:00:00Z"), new Date("2026-11-18T13:00:00Z"))).toBe(false);
    expect(jaLembradoHoje(null, new Date())).toBe(false);
  });
});

describe("lembrar no ClassLink: contrato da regra do responsável financeiro", () => {
  const novo = (destinatarioId: string | null, guardians: { guardian: { id: string; name: string } }[]) => ({
    ...contrato("AGUARDANDO_ASSINATURA", guardians),
    porResponsavelFinanceiro: true,
    destinatarioId,
  });

  it("lembra o destinatário (responsável financeiro)", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue(novo("mae", [{ guardian: { id: "mae", name: "Maria Souza" } }]));
    const res = await POST(req({ responsavelId: "mae" }), ctx);
    expect(res.status).toBe(201);
    expect(push.notifyUsers).toHaveBeenCalledWith(["mae"], expect.anything());
  });

  it("recusa lembrar quem não é o financeiro (pedagógico)", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue(novo("mae", [{ guardian: { id: "pai", name: "João Souza" } }]));
    const res = await POST(req({ responsavelId: "pai" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/não é o responsável financeiro/);
    expect(push.notifyUsers).not.toHaveBeenCalled();
    expect(banco.prisma.message.create).not.toHaveBeenCalled();
  });

  it("sem destinatário: não lembra ninguém e pede a indicação", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValue(novo(null, [{ guardian: { id: "pai", name: "João Souza" } }]));
    const res = await POST(req({ responsavelId: "pai" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/indique o responsável financeiro/);
    expect(push.notifyUsers).not.toHaveBeenCalled();
  });
});
