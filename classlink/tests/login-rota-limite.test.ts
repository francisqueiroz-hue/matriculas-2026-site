import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  loginTentativa: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  refreshToken: { create: vi.fn(), count: vi.fn() },
  message: { findUnique: vi.fn(), create: vi.fn() },
  conversation: { findUnique: vi.fn() },
}));
const conversaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/permissoes-mensagens", () => ({ conversaDaFamiliaComGestao: conversaMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(async () => "hash-novo"),
  precisaRehash: vi.fn(() => false),
  signAccessToken: vi.fn(async () => "access"),
  generateRefreshToken: vi.fn(() => ({ token: "r", tokenHash: "h", expiresAt: new Date() })),
  ACCESS_COOKIE: "a",
  REFRESH_COOKIE: "r",
  accessCookieOptions: {},
  refreshCookieOptions: {},
}));

import { POST } from "@/app/api/auth/login/route";
import { verifyPassword, precisaRehash } from "@/lib/auth";

function req(identifier = "pai@escola.com", password = "x", ip?: string, extra: Record<string, string> = {}) {
  return new Request("http://t/api/auth/login", {
    method: "POST",
    headers: { ...(ip ? { "x-real-ip": ip } : {}), ...extra },
    body: JSON.stringify({ identifier, password }),
  }) as never;
}

const usuario = { id: "u1", name: "Pai", email: "pai@escola.com", role: "GUARDIAN", schoolId: "s1", avatarUrl: null, active: true, deletedAt: null, passwordHash: "h" };

/** Simula o contador do banco: cada upsert devolve a próxima contagem, por chave. */
function contadorDoBanco() {
  const contagens = new Map<string, number>();
  prismaMock.loginTentativa.upsert.mockImplementation(async ({ where }: { where: { chave: string } }) => {
    const n = (contagens.get(where.chave) ?? 0) + 1;
    contagens.set(where.chave, n);
    return { falhas: n, bloqueadoAte: null };
  });
  return contagens;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_ACCESS_SECRET = "segredo-de-teste";
  prismaMock.loginTentativa.findUnique.mockResolvedValue(null);
  prismaMock.loginTentativa.upsert.mockResolvedValue({ falhas: 1, bloqueadoAte: null });
  prismaMock.loginTentativa.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.loginTentativa.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.refreshToken.create.mockResolvedValue({});
  prismaMock.refreshToken.count.mockResolvedValue(1);
  prismaMock.user.findUnique.mockResolvedValue(usuario);
});

describe("POST /api/auth/login com limite de tentativas", () => {
  it("senha errada: 401, e a conta é contada antes da senha sem guardar o e-mail em texto", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const res = await POST(req());
    expect(res.status).toBe(401);
    const arg = prismaMock.loginTentativa.upsert.mock.calls[0][0];
    expect(arg.update).toEqual({ falhas: { increment: 1 } });
    expect(JSON.stringify(arg)).not.toContain("pai@escola.com");
    expect(arg.where.chave).toMatch(/^[0-9a-f]{64}$/);
  });

  it("usuário inexistente também conta (não revela se o login existe) e gasta o mesmo tempo de bcrypt", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const res = await POST(req("ninguem@escola.com"));
    expect(res.status).toBe(401);
    expect(prismaMock.loginTentativa.upsert).toHaveBeenCalledTimes(1);
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifyPassword).mock.calls[0][1]).toMatch(/^\$2[aby]\$12\$/);
  });

  it("conta bloqueada: 429 com Retry-After, sem checar a senha nem buscar o usuário", async () => {
    prismaMock.loginTentativa.upsert.mockResolvedValue({ falhas: 6, bloqueadoAte: new Date(Date.now() + 10 * 60_000) });
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await res.json()).error).toMatch(/Muitas tentativas/);
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("IP bloqueado: 429 antes de contar a conta ou olhar a senha", async () => {
    prismaMock.loginTentativa.findUnique.mockResolvedValue({ bloqueadoAte: new Date(Date.now() + 5 * 60_000) });
    const res = await POST(req("pai@escola.com", "x", "203.0.113.7"));
    expect(res.status).toBe(429);
    expect(prismaMock.loginTentativa.upsert).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("senha errada conta também no IP; sem IP na requisição, o limite por IP é pulado", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await POST(req("pai@escola.com", "x", "203.0.113.7"));
    expect(prismaMock.loginTentativa.upsert).toHaveBeenCalledTimes(2); // conta + IP
    prismaMock.loginTentativa.upsert.mockClear();
    prismaMock.loginTentativa.findUnique.mockClear();
    await POST(req());
    expect(prismaMock.loginTentativa.upsert).toHaveBeenCalledTimes(1); // só a conta
    expect(prismaMock.loginTentativa.findUnique).not.toHaveBeenCalled();
  });

  it("login correto: 200, zera o contador da conta e não conta falha no IP", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const res = await POST(req("pai@escola.com", "x", "203.0.113.7"));
    expect(res.status).toBe(200);
    expect(prismaMock.loginTentativa.deleteMany).toHaveBeenLastCalledWith({ where: { chave: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(prismaMock.loginTentativa.upsert).toHaveBeenCalledTimes(1); // só a contagem da própria conta, antes da senha
  });

  it("se a tabela do limitador falhar, o login continua funcionando", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.loginTentativa.findUnique.mockRejectedValue(new Error("relation does not exist"));
    prismaMock.loginTentativa.deleteMany.mockRejectedValue(new Error("relation does not exist"));
    prismaMock.loginTentativa.upsert.mockRejectedValue(new Error("relation does not exist"));
    vi.mocked(verifyPassword).mockResolvedValue(true);
    expect((await POST(req("pai@escola.com", "x", "203.0.113.7"))).status).toBe(200);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    expect((await POST(req("pai@escola.com", "x", "203.0.113.7"))).status).toBe(401);
    log.mockRestore();
  });

  it("rajada paralela de 25 tentativas na mesma conta: só 5 chegam a testar uma senha", async () => {
    contadorDoBanco();
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const respostas = await Promise.all(Array.from({ length: 25 }, (_, i) => POST(req("pai@escola.com", `senha${i}`))));
    const status = respostas.map((r) => r.status);
    expect(status.filter((s) => s === 401)).toHaveLength(5);
    expect(status.filter((s) => s === 429)).toHaveLength(20);
    expect(verifyPassword).toHaveBeenCalledTimes(5);
  });

  it("uma senha em várias contas, do mesmo IP: o IP trava depois de 30 erros", async () => {
    const contagens = contadorDoBanco();
    prismaMock.loginTentativa.findUnique.mockImplementation(async ({ where }: { where: { chave: string } }) => {
      const n = contagens.get(where.chave) ?? 0;
      return n > 30 ? { bloqueadoAte: new Date(Date.now() + 60_000) } : null;
    });
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const status: number[] = [];
    for (let i = 0; i < 40; i++) status.push((await POST(req(`aluno${i}@escola.com`, "Senha123", "203.0.113.7"))).status);
    expect(status.slice(0, 31).every((s) => s === 401)).toBe(true);
    expect(status.slice(31).every((s) => s === 429)).toBe(true);
  });
});

describe("proteções extras do login", () => {
  it("Origin de outro site: 403, sem contar tentativa nem olhar a senha", async () => {
    const res = await POST(req("pai@escola.com", "x", undefined, { origin: "https://evil.example", host: "t" }));
    expect(res.status).toBe(403);
    expect(prismaMock.loginTentativa.upsert).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("Origin do próprio site passa", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const res = await POST(req("pai@escola.com", "x", undefined, { origin: "https://app.escola.com", host: "app.escola.com" }));
    expect(res.status).toBe(200);
  });

  it("senha gigante: 400 antes de gastar bcrypt", async () => {
    const res = await POST(req("pai@escola.com", "a".repeat(129)));
    expect(res.status).toBe(400);
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("hash com custo antigo é trocado após login correto", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(precisaRehash).mockReturnValueOnce(true);
    prismaMock.user.update.mockResolvedValue({});
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordHash: "hash-novo" } });
  });

  it("falha no rehash não derruba o login", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(precisaRehash).mockReturnValueOnce(true);
    prismaMock.user.update.mockRejectedValue(new Error("db"));
    expect((await POST(req())).status).toBe(200);
    log.mockRestore();
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
