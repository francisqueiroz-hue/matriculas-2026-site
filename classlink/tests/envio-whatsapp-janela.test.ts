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
const registrarAvisoMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/avisos-equipe", () => ({
  avisarEquipePorWhatsApp: vi.fn(),
  parametrosModeloAviso: (remetente: string, texto: string, link: string) => [remetente, texto, link],
  registrarAviso: registrarAvisoMock,
}));
const modeloMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp-modelos", () => ({ modeloDisponivel: modeloMock }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmailMessage: vi.fn() }));
const enviarMock = vi.hoisted(() => vi.fn());
const templateMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp", () => ({
  isWhatsAppConfigured: () => true,
  normalizePhoneBR: (p: string) => p,
  sendWhatsAppTextMessage: enviarMock,
  sendWhatsAppTemplateMessage: templateMock,
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
  templateMock.mockResolvedValue({ externalId: "wamid.aviso" });
  modeloMock.mockResolvedValue({ name: "aviso_mensagem_classlink", language: "pt_BR" });
});

describe("envio pelo WhatsApp respeita a janela de 24h", () => {
  it("janela fechada com aviso padrão aprovado: texto fica no ClassLink e a família é avisada pelo modelo", async () => {
    prismaMock.user.findUniqueOrThrow
      .mockResolvedValueOnce({ phone: "5521987654321", whatsappUltimaMensagemEm: new Date(Date.now() - 30 * 3600 * 1000) })
      .mockResolvedValueOnce({ id: "staff1", name: "Dir", role: "ADMIN", funcao: null, nomeParaFamilias: "Secretaria" });
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).avisoPeloWhatsApp).toBe(true);
    expect(enviarMock).not.toHaveBeenCalled(); // nada de texto livre
    expect(templateMock).toHaveBeenCalledTimes(1);
    expect(templateMock.mock.calls[0][2][1]).toBe("Olá");
    expect(templateMock.mock.calls[0][2][2]).toContain("/dashboard/mensagens/c1");
    expect(registrarAvisoMock).toHaveBeenCalledWith("wamid.aviso", "g1", "familia", "c1");
    // gravada como mensagem do ClassLink (vale o ✓✓ de abertura), não como "via WhatsApp"
    expect(prismaMock.message.create.mock.calls[0][0].data.channel).toBe("APP");
  });

  it("janela fechada e sem aviso padrão aprovado: 409 com explicação, nada é gravado", async () => {
    modeloMock.mockResolvedValue(null);
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ phone: "5521987654321", whatsappUltimaMensagemEm: null });
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/24 horas/);
    expect(enviarMock).not.toHaveBeenCalled();
    expect(templateMock).not.toHaveBeenCalled();
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("janela aberta: envia e grava com canal WHATSAPP", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ phone: "5521987654321", whatsappUltimaMensagemEm: new Date(Date.now() - 3600 * 1000) });
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(201);
    expect(enviarMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.message.create.mock.calls[0][0].data.channel).toBe("WHATSAPP");
  });
});
