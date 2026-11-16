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
const bloqueioMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp-falhas", async (original) => ({
  ...(await original<typeof import("@/lib/whatsapp-falhas")>()),
  bloqueioPorCobranca: bloqueioMock,
}));
const ErroWhatsAppFake = vi.hoisted(
  () =>
    class extends Error {
      constructor(
        message: string,
        readonly codigo: number | null,
      ) {
        super(message);
      }
    },
);
vi.mock("@/lib/whatsapp", () => ({
  ErroWhatsApp: ErroWhatsAppFake,
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
  bloqueioMock.mockResolvedValue(null);
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

  it("janela fechada e sem aviso padrão aprovado: vai pelo ClassLink, com a explicação", async () => {
    modeloMock.mockResolvedValue(null);
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ phone: "5521987654321", whatsappUltimaMensagemEm: null });
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).aviso).toMatch(/24 horas/);
    expect(enviarMock).not.toHaveBeenCalled();
    expect(templateMock).not.toHaveBeenCalled();
    expect(prismaMock.message.create.mock.calls[0][0].data.channel).toBe("APP");
  });

  it("janela aberta: envia e grava com canal WHATSAPP", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ phone: "5521987654321", whatsappUltimaMensagemEm: new Date(Date.now() - 3600 * 1000) });
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(201);
    expect(enviarMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.message.create.mock.calls[0][0].data.channel).toBe("WHATSAPP");
  });

});

describe("falha do WhatsApp não trava o envio", () => {
  const janelaAberta = { phone: "5521987654321", whatsappUltimaMensagemEm: new Date(Date.now() - 3600 * 1000) };

  it("conta bloqueada por pagamento pendente (131042 recente): nem tenta a Meta, envia pelo ClassLink", async () => {
    bloqueioMock.mockResolvedValue({ desde: new Date() });
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(janelaAberta);
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).aviso).toMatch(/pagamento pendente/);
    expect(enviarMock).not.toHaveBeenCalled();
    expect(prismaMock.message.create.mock.calls[0][0].data.channel).toBe("APP");
    expect(prismaMock.message.create.mock.calls[0][0].data.externalId).toBeUndefined();
  });

  it("Meta recusa na hora (ex.: 131042): a mensagem vai pelo ClassLink e a equipe vê o motivo", async () => {
    enviarMock.mockRejectedValue(new ErroWhatsAppFake("unsettled payments", 131042));
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(janelaAberta);
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(201);
    const corpo = await res.json();
    expect(corpo.aviso).toMatch(/Pagamento pendente/);
    expect(corpo.aviso).toMatch(/ClassLink/);
    expect(prismaMock.message.create.mock.calls[0][0].data.channel).toBe("APP");
  });

  it("WhatsApp sem resposta (tempo esgotado) no aviso padrão: a mensagem fica no ClassLink", async () => {
    templateMock.mockRejectedValue(new ErroWhatsAppFake("O WhatsApp não respondeu a tempo", null));
    prismaMock.user.findUniqueOrThrow
      .mockResolvedValueOnce({ phone: "5521987654321", whatsappUltimaMensagemEm: null })
      .mockResolvedValueOnce({ id: "staff1", name: "Dir", role: "ADMIN", funcao: null, nomeParaFamilias: null });
    const res = await POST(req("WHATSAPP"), ctx);
    expect(res.status).toBe(201);
    const corpo = await res.json();
    expect(corpo.avisoPeloWhatsApp).toBe(false);
    expect(corpo.aviso).toMatch(/não aceitou o envio/);
    expect(registrarAvisoMock).not.toHaveBeenCalled();
  });
});
