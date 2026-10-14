import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  loginTentativa: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  refreshToken: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({
  verifyPassword: vi.fn(),
  signAccessToken: vi.fn(async () => "access"),
  generateRefreshToken: vi.fn(() => ({ token: "r", tokenHash: "h", expiresAt: new Date() })),
  ACCESS_COOKIE: "a",
  REFRESH_COOKIE: "r",
  accessCookieOptions: {},
  refreshCookieOptions: {},
}));

import { POST } from "@/app/api/auth/login/route";
import { verifyPassword } from "@/lib/auth";

function req(identifier = "pai@escola.com", password = "x") {
  return new Request("http://t/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  }) as never;
}

const usuario = { id: "u1", name: "Pai", email: "pai@escola.com", role: "GUARDIAN", schoolId: "s1", avatarUrl: null, active: true, deletedAt: null, passwordHash: "h" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_ACCESS_SECRET = "segredo-de-teste";
  prismaMock.loginTentativa.findUnique.mockResolvedValue(null);
  prismaMock.user.findUnique.mockResolvedValue(usuario);
});

describe("POST /api/auth/login com limite de tentativas", () => {
  it("senha errada: 401 e grava 1 falha, sem guardar o e-mail em texto", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const res = await POST(req());
    expect(res.status).toBe(401);
    const arg = prismaMock.loginTentativa.upsert.mock.calls[0][0];
    expect(arg.create.falhas).toBe(1);
    expect(JSON.stringify(arg)).not.toContain("pai@escola.com");
    expect(arg.where.chave).toMatch(/^[0-9a-f]{64}$/);
  });

  it("usuário inexistente também conta falha (não revela se o login existe)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await POST(req("ninguem@escola.com"));
    expect(res.status).toBe(401);
    expect(prismaMock.loginTentativa.upsert).toHaveBeenCalledTimes(1);
  });

  it("bloqueado: 429 com Retry-After, sem checar a senha", async () => {
    prismaMock.loginTentativa.findUnique.mockResolvedValue({
      falhas: 5,
      primeiraFalhaEm: new Date(),
      bloqueadoAte: new Date(Date.now() + 10 * 60_000),
    });
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await res.json()).error).toMatch(/Muitas tentativas/);
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("login correto: 200 e zera o contador existente", async () => {
    prismaMock.loginTentativa.findUnique.mockResolvedValue({ falhas: 3, primeiraFalhaEm: new Date(), bloqueadoAte: null });
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(prismaMock.loginTentativa.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.loginTentativa.upsert).not.toHaveBeenCalled();
  });

  it("login correto sem falhas anteriores não mexe na tabela", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await POST(req());
    expect(prismaMock.loginTentativa.deleteMany).not.toHaveBeenCalled();
  });
});
