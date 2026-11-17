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
const armazenado = { id: "rt1", userId: "u1", revokedAt: null, expiresAt: expira, user: usuario };

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

  it("reuso de token já trocado há muito tempo: nega e encerra só a sessão daquele aparelho (família)", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
      ...armazenado,
      familia: "fam-celular",
      revokedAt: new Date("2026-10-21T10:00:00Z"),
    });
    await expect(renovarSessao("tok", agora)).resolves.toBeNull();
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familia: "fam-celular", expiresAt: { gt: agora } },
      data: { revokedAt: agora, expiresAt: agora },
    });
    // Nada filtrado só pelo usuário: o computador (outra família) continua conectado.
    const porUsuario = prismaMock.refreshToken.updateMany.mock.calls.filter(([a]) => a.where.userId !== undefined);
    expect(porUsuario).toHaveLength(0);
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it("reuso de token antigo (sem família): encerra os filhos dele e as sessões antigas, poupando as novas", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({ ...armazenado, familia: null, revokedAt: new Date("2026-10-21T10:00:00Z") });
    await expect(renovarSessao("tok", agora)).resolves.toBeNull();
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { expiresAt: { gt: agora }, OR: [{ familia: "rt1" }, { userId: "u1", familia: null }] },
      data: { revokedAt: agora, expiresAt: agora },
    });
  });

  it("renovação: o token novo herda a família do aparelho", async () => {
    prismaMock.refreshToken.findUnique
      .mockResolvedValueOnce({ ...armazenado, familia: "fam-computador" })
      .mockResolvedValueOnce({ expiresAt: expira, user: { active: true, deletedAt: null } });
    await renovarSessao("tok", agora);
    expect(prismaMock.refreshToken.create.mock.calls[0][0].data.familia).toBe("fam-computador");
  });

  it("renovação de token antigo (sem família): a família passa a ser o id dele", async () => {
    prismaMock.refreshToken.findUnique
      .mockResolvedValueOnce({ ...armazenado, familia: null })
      .mockResolvedValueOnce({ expiresAt: expira, user: { active: true, deletedAt: null } });
    await renovarSessao("tok", agora);
    expect(prismaMock.refreshToken.create.mock.calls[0][0].data.familia).toBe("rt1");
  });

  it("dois aparelhos: o reuso suspeito no celular não derruba o computador", async () => {
    // Banco em memória com uma família por aparelho.
    const futuro = expira;
    const tokens = [
      { id: "c1", tokenHash: "h-cel-velho", userId: "u1", familia: "cel", revokedAt: new Date("2026-10-21T10:00:00Z"), expiresAt: futuro },
      { id: "c2", tokenHash: "h-cel-novo", userId: "u1", familia: "cel", revokedAt: null as Date | null, expiresAt: futuro },
      { id: "p1", tokenHash: "h-pc", userId: "u1", familia: "pc", revokedAt: null as Date | null, expiresAt: futuro },
    ];
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({ ...tokens[0], user: usuario });
    prismaMock.refreshToken.updateMany.mockImplementation(async ({ where, data }) => {
      const alvo = tokens.filter((t) => t.familia === where.familia && t.expiresAt > where.expiresAt.gt);
      alvo.forEach((t) => Object.assign(t, data));
      return { count: alvo.length };
    });
    await expect(renovarSessao("velho", agora)).resolves.toBeNull();
    expect(tokens.find((t) => t.id === "c2")!.expiresAt).toEqual(agora);
    expect(tokens.find((t) => t.id === "p1")).toMatchObject({ revokedAt: null, expiresAt: futuro });
  });

  it("token vencido pelo logout: nega sem revogar as outras sessões", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
      ...armazenado,
      revokedAt: new Date("2026-10-21T10:00:00Z"),
      expiresAt: new Date("2026-10-21T10:00:00Z"),
    });
    await expect(renovarSessao("tok", agora)).resolves.toBeNull();
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
