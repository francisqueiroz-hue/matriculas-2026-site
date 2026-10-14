import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// after() só existe dentro de uma requisição real do Next; aqui ele só precisa não quebrar.
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: vi.fn() }));

const prismaMock = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn() },
  message: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ sub: "staff1", role: "ADMIN", schoolId: "s1" })),
  AuthError: class extends Error {},
}));
vi.mock("@/lib/messaging", () => ({ assertConversationParticipant: vi.fn(async () => ({ staffId: "staff1", guardianId: "g1" })) }));
vi.mock("@/lib/permissoes-mensagens", () => ({ exigirPodeConversar: vi.fn(), exigirPodeExcluirConversa: vi.fn() }));
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn() }));
vi.mock("@/lib/avisos-equipe", () => ({ avisarEquipePorWhatsApp: vi.fn() }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmailMessage: vi.fn() }));
const enviarMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp", () => ({
  isWhatsAppConfigured: () => true,
  normalizePhoneBR: (p: string) => p,
  sendWhatsAppTextMessage: enviarMock,
}));

import { POST } from "@/app/api/messages/conversations/[id]/route";

const ctx = { params: Promise.resolve({ id: "c1" }) } as never;
const req = (channel: string) =>
  new NextRequest("http://t/api/messages/conversations/c1", { method: "POST", body: JSON.stringify({ body: "Olá", channel }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  prismaMock.message.create.mockResolvedValue({ id: "m1", sender: { id: "staff1", name: "Dir", role: "ADMIN" } });
  enviarMock.mockResolvedValue({ externalId: "wamid.1" });
});

describe("envio pelo WhatsApp respeita a janela de 24h", () => {
  it("janela fechada: 409 com explicação, nada é enviado nem gravado como 'via WhatsApp'", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ phone: "5521987654321", whatsappUltimaMensagemEm: new Date(Date.now() - 30 * 3600 * 1000) });
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/24 horas/);
    expect(enviarMock).not.toHaveBeenCalled();
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("família nunca escreveu pelo WhatsApp: também recusa", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ phone: "5521987654321", whatsappUltimaMensagemEm: null });
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(409);
  });

  it("janela aberta: envia e grava com canal WHATSAPP", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ phone: "5521987654321", whatsappUltimaMensagemEm: new Date(Date.now() - 3600 * 1000) });
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(201);
    expect(enviarMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.message.create.mock.calls[0][0].data.channel).toBe("WHATSAPP");
  });
});
