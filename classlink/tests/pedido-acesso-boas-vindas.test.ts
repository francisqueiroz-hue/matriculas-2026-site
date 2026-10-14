import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  refreshToken: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ hashPassword: vi.fn(async () => "hash") }));
const enviarMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppTextMessage: enviarMock }));

import { responderPedidoDeAcesso } from "@/lib/pedido-acesso";
import { TEXTO_BOAS_VINDAS_WHATSAPP } from "@/lib/boas-vindas";

const pessoa = { id: "u1", name: "Maria", phone: "5521987654321" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true, deletedAt: null });
  prismaMock.$transaction.mockResolvedValue([]);
  enviarMock.mockResolvedValue({ externalId: "x" });
});

describe("resposta ao pedido de ACESSO pelo WhatsApp", () => {
  it("família recebe acesso + convite para baixar o aplicativo", async () => {
    await responderPedidoDeAcesso(pessoa, "5521987654321", "https://escola.app/guia");
    const texto = enviarMock.mock.calls[0][1] as string;
    expect(texto).toContain("Senha provisória:");
    expect(texto.endsWith(TEXTO_BOAS_VINDAS_WHATSAPP)).toBe(true);
  });

  it("equipe recebe só o acesso (a frase fala em 'escola do seu filho')", async () => {
    await responderPedidoDeAcesso(pessoa, "5521987654321", "https://escola.app/login", false);
    const texto = enviarMock.mock.calls[0][1] as string;
    expect(texto).toContain("Senha provisória:");
    expect(texto).not.toContain(TEXTO_BOAS_VINDAS_WHATSAPP);
  });
});
