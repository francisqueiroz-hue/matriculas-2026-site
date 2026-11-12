import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  refreshToken: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
process.env.JWT_ACCESS_SECRET = "test-secret-key-not-for-production";

import { renovarSessao } from "@/lib/renovar-sessao-servidor";

const agora = new Date("2026-11-12T12:00:00Z");
const user = { id: "u1", role: "GUARDIAN", schoolId: "s1", name: "Pai", active: true, deletedAt: null };
const armazenado = (extra = {}) => ({
  id: "t1",
  userId: "u1",
  revokedAt: null,
  expiresAt: new Date("2026-12-01T00:00:00Z"),
  user,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.refreshToken.create.mockResolvedValue({});
});

describe("renovarSessao", () => {
  it("token válido: rotaciona e devolve novo par", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(armazenado());
    const r = await renovarSessao("tok", agora);
    expect(r?.accessToken).toBeTruthy();
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it("reuso de token já trocado há muito tempo: nega e revoga todas as sessões da pessoa", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(armazenado({ revokedAt: new Date("2026-11-12T10:00:00Z") }));
    expect(await renovarSessao("tok", agora)).toBeNull();
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: agora },
    });
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it("token desconhecido ou vencido (logout): nega sem revogar nada", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    expect(await renovarSessao("x", agora)).toBeNull();
    prismaMock.refreshToken.findUnique.mockResolvedValue(
      armazenado({ revokedAt: new Date("2026-11-12T10:00:00Z"), expiresAt: new Date("2026-11-12T10:00:00Z") }),
    );
    expect(await renovarSessao("x", agora)).toBeNull();
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
