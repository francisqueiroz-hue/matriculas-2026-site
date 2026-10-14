import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  refreshToken: { count: vi.fn() },
  message: { findUnique: vi.fn(), create: vi.fn() },
  conversation: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const conversaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/permissoes-mensagens", () => ({ conversaDaFamiliaComGestao: conversaMock }));

import { chaveBoasVindas, ehPrimeiroAcesso, enviarBoasVindasApp, TEXTO_BOAS_VINDAS_APP } from "@/lib/boas-vindas";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ehPrimeiroAcesso", () => {
  it("responsável sem nenhuma sessão anterior é primeiro acesso", async () => {
    prismaMock.refreshToken.count.mockResolvedValue(0);
    expect(await ehPrimeiroAcesso({ id: "u1", role: "GUARDIAN" })).toBe(true);
  });

  it("quem já teve sessão (mesmo revogada) não recebe boas-vindas atrasadas", async () => {
    prismaMock.refreshToken.count.mockResolvedValue(3);
    expect(await ehPrimeiroAcesso({ id: "u1", role: "GUARDIAN" })).toBe(false);
  });

  it("equipe nunca recebe (e nem consulta o banco)", async () => {
    expect(await ehPrimeiroAcesso({ id: "s1", role: "STAFF" })).toBe(false);
    expect(await ehPrimeiroAcesso({ id: "a1", role: "ADMIN" })).toBe(false);
    expect(prismaMock.refreshToken.count).not.toHaveBeenCalled();
  });

  it("erro no banco vira false (não atrapalha o login)", async () => {
    prismaMock.refreshToken.count.mockRejectedValue(new Error("db"));
    expect(await ehPrimeiroAcesso({ id: "u1", role: "GUARDIAN" })).toBe(false);
  });
});

describe("enviarBoasVindasApp", () => {
  it("grava a mensagem na conversa com a gestão, assinada por quem atende, com chave única", async () => {
    prismaMock.message.findUnique.mockResolvedValue(null);
    conversaMock.mockResolvedValue("c1");
    prismaMock.conversation.findUnique.mockResolvedValue({ staffId: "adm1" });
    prismaMock.message.create.mockResolvedValue({});

    await enviarBoasVindasApp({ id: "u1", schoolId: "s1" });

    expect(prismaMock.message.create).toHaveBeenCalledWith({
      data: { conversationId: "c1", senderId: "adm1", body: TEXTO_BOAS_VINDAS_APP, channel: "APP", externalId: chaveBoasVindas("u1") },
    });
  });

  it("não repete se já foi enviada", async () => {
    prismaMock.message.findUnique.mockResolvedValue({ id: "m1" });
    await enviarBoasVindasApp({ id: "u1", schoolId: "s1" });
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("sem gestão para conversar, não faz nada e não falha", async () => {
    prismaMock.message.findUnique.mockResolvedValue(null);
    conversaMock.mockResolvedValue(null);
    await expect(enviarBoasVindasApp({ id: "u1", schoolId: "s1" })).resolves.toBeUndefined();
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("erro ao gravar não lança", async () => {
    prismaMock.message.findUnique.mockRejectedValue(new Error("db"));
    await expect(enviarBoasVindasApp({ id: "u1", schoolId: "s1" })).resolves.toBeUndefined();
  });
});
