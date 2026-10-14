import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  loginTentativa: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  refreshToken: { create: vi.fn(), count: vi.fn() },
  message: { findUnique: vi.fn(), create: vi.fn() },
  conversation: { findUnique: vi.fn() },
}));
const conversaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/permissoes-mensagens", () => ({ conversaDaFamiliaComGestao: conversaMock }));
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
  prismaMock.loginTentativa.upsert.mockResolvedValue({});
  prismaMock.loginTentativa.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.refreshToken.create.mockResolvedValue({});
  prismaMock.refreshToken.count.mockResolvedValue(1);
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

  it("se a tabela do limitador falhar, o login continua funcionando", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.loginTentativa.findUnique.mockRejectedValue(new Error("relation does not exist"));
    prismaMock.loginTentativa.upsert.mockRejectedValue(new Error("relation does not exist"));
    vi.mocked(verifyPassword).mockResolvedValue(true);
    expect((await POST(req())).status).toBe(200);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    expect((await POST(req())).status).toBe(401);
    log.mockRestore();
  });

  it("login correto sem falhas anteriores não mexe na tabela", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await POST(req());
    expect(prismaMock.loginTentativa.deleteMany).not.toHaveBeenCalled();
  });
});

describe("boas-vindas no primeiro login do responsável", () => {
  it("login correto de quem nunca entrou grava a mensagem de boas-vindas", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    prismaMock.refreshToken.count.mockResolvedValue(0);
    prismaMock.message.findUnique.mockResolvedValue(null);
    prismaMock.conversation.findUnique.mockResolvedValue({ staffId: "adm1" });
    conversaMock.mockResolvedValue("c1");
    prismaMock.message.create.mockResolvedValue({});

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
  });

  it("quem já tinha sessão entra sem receber boas-vindas", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    prismaMock.refreshToken.count.mockResolvedValue(2);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });
});
