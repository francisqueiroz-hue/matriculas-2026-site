import { beforeEach, describe, expect, it, vi } from "vitest";

// renovarSessao com o banco simulado: corrida entre a renovação e o logout (caso 3 do PR #79).
const prismaMock = vi.hoisted(() => ({
  refreshToken: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.stubEnv("JWT_ACCESS_SECRET", "segredo-de-teste-com-tamanho-suficiente");

import { renovarSessao } from "@/lib/renovar-sessao-servidor";

const agora = new Date("2026-10-21T15:00:00Z");
const expira = new Date("2026-11-20T15:00:00Z");
const usuario = { id: "u1", role: "GUARDIAN", schoolId: "s1", name: "Ana", active: true, deletedAt: null };
const armazenado = { id: "rt1", revokedAt: null, expiresAt: expira, user: usuario };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.refreshToken.create.mockResolvedValue({});
});

describe("renovarSessao", () => {
  it("renova normalmente quando ninguém encerrou a sessão no meio", async () => {
    prismaMock.refreshToken.findUnique
      .mockResolvedValueOnce(armazenado)
      .mockResolvedValueOnce({ expiresAt: expira, user: { active: true, deletedAt: null } });
    const r = await renovarSessao("tok", agora);
    expect(r?.accessToken).toBeTruthy();
    expect(r?.refreshToken).toMatch(/^[0-9a-f]{96}$/);
  });

  it("logout no meio da renovação (token usado vencido depois da leitura): descarta a sessão nova", async () => {
    prismaMock.refreshToken.findUnique
      .mockResolvedValueOnce(armazenado)
      .mockResolvedValueOnce({ expiresAt: new Date(agora.getTime() + 500), user: { active: true, deletedAt: null } });
    await expect(renovarSessao("tok", agora)).resolves.toBeNull();
    const [criado] = prismaMock.refreshToken.create.mock.calls[0];
    const descarte = prismaMock.refreshToken.updateMany.mock.calls.at(-1)![0];
    expect(descarte.where).toEqual({ tokenHash: criado.data.tokenHash });
    expect(descarte.data).toEqual({ revokedAt: agora, expiresAt: agora });
  });

  it("conta desativada no meio da renovação: descarta a sessão nova", async () => {
    prismaMock.refreshToken.findUnique
      .mockResolvedValueOnce(armazenado)
      .mockResolvedValueOnce({ expiresAt: expira, user: { active: false, deletedAt: null } });
    await expect(renovarSessao("tok", agora)).resolves.toBeNull();
  });

  it("token inexistente: não cria nada", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);
    await expect(renovarSessao("tok", agora)).resolves.toBeNull();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });
});
