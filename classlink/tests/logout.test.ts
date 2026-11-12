import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  refreshToken: { updateMany: vi.fn(), findUnique: vi.fn() },
  pushToken: { deleteMany: vi.fn() },
}));
const verifyAccessToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const registrarErroServidor = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor }));
vi.mock("@/lib/auth", () => ({
  ACCESS_COOKIE: "classlink_access",
  REFRESH_COOKIE: "classlink_refresh",
  hashRefreshToken: (t: string) => `hash-${t}`,
  verifyAccessToken,
  accessCookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 900 },
  refreshCookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth", maxAge: 2592000 },
}));

import { POST } from "@/app/api/auth/logout/route";
import { lerTokenPushDoLogout, TAMANHO_MAXIMO_CORPO_LOGOUT } from "@/lib/logout-corpo";
import { situacaoRefresh, type RefreshArmazenado } from "@/lib/renovacao-sessao";

function req(corpo?: string, cookies = "classlink_access=acc; classlink_refresh=ref") {
  return new NextRequest("http://t/api/auth/logout", {
    method: "POST",
    headers: { cookie: cookies, ...(corpo !== undefined && { "content-type": "application/json" }) },
    body: corpo,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.pushToken.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.refreshToken.findUnique.mockResolvedValue(null);
  verifyAccessToken.mockResolvedValue({ sub: "u1" });
});

describe("lerTokenPushDoLogout", () => {
  it("aceita só { pushToken: string } de tamanho razoável", () => {
    expect(lerTokenPushDoLogout(JSON.stringify({ pushToken: "tok-1" }))).toBe("tok-1");
    expect(lerTokenPushDoLogout("")).toBeNull();
    expect(lerTokenPushDoLogout("não é json")).toBeNull();
    expect(lerTokenPushDoLogout("null")).toBeNull();
    expect(lerTokenPushDoLogout(JSON.stringify({ pushToken: 123 }))).toBeNull();
    expect(lerTokenPushDoLogout(JSON.stringify({ pushToken: "   " }))).toBeNull();
    expect(lerTokenPushDoLogout(JSON.stringify({ pushToken: ["a"] }))).toBeNull();
    expect(lerTokenPushDoLogout(JSON.stringify({ pushToken: "x".repeat(4097) }))).toBeNull();
    expect(lerTokenPushDoLogout(JSON.stringify({ pushToken: "a", extra: "x".repeat(TAMANHO_MAXIMO_CORPO_LOGOUT) }))).toBeNull();
  });
});

describe("POST /api/auth/logout", () => {
  it("sem corpo: revoga e vence o refresh, e não mexe em push", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: "hash-ref", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // Sem exigir revokedAt null: também mata um token já rotacionado há pouco.
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: "hash-ref", expiresAt: { gt: expect.any(Date) } },
      data: { expiresAt: expect.any(Date) },
    });
    expect(prismaMock.pushToken.deleteMany).not.toHaveBeenCalled();
  });

  it("apaga os cookies com os mesmos atributos da criação (refresh em /api/auth, access em /)", async () => {
    const res = await POST(req());
    const cookies = res.headers.getSetCookie();
    const refresh = cookies.find((c) => c.startsWith("classlink_refresh="));
    const access = cookies.find((c) => c.startsWith("classlink_access="));
    expect(refresh).toMatch(/^classlink_refresh=;/);
    expect(refresh).toMatch(/Path=\/api\/auth(;|$)/);
    expect(refresh).toMatch(/Max-Age=0/);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Secure/i);
    expect(refresh).toMatch(/SameSite=lax/i);
    expect(access).toMatch(/^classlink_access=;/);
    expect(access).toMatch(/Path=\/(;|$)/);
    expect(access).toMatch(/Max-Age=0/);
    expect(access).toMatch(/HttpOnly/i);
  });

  it("depois do logout o refresh não renova mais, nem dentro da janela de reuso", async () => {
    // Aplica as escritas do logout num registro em memória, como o banco faria.
    const registro: RefreshArmazenado = {
      revokedAt: null,
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      user: { active: true, deletedAt: null },
    };
    prismaMock.refreshToken.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.revokedAt === null && registro.revokedAt !== null) return { count: 0 };
      if (where.expiresAt?.gt && !(registro.expiresAt > where.expiresAt.gt)) return { count: 0 };
      Object.assign(registro, data);
      return { count: 1 };
    });
    await POST(req());
    const umSegundoDepois = new Date(Date.now() + 1_000);
    expect(situacaoRefresh(registro, umSegundoDepois)).toBe("invalido");
  });

  it("token já rotacionado há poucos segundos também morre no logout", async () => {
    const registro: RefreshArmazenado = {
      revokedAt: new Date(Date.now() - 3_000),
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      user: { active: true, deletedAt: null },
    };
    expect(situacaoRefresh(registro, new Date())).toBe("reuso_recente");
    prismaMock.refreshToken.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.revokedAt === null && registro.revokedAt !== null) return { count: 0 };
      Object.assign(registro, data);
      return { count: 1 };
    });
    await POST(req());
    expect(situacaoRefresh(registro, new Date(Date.now() + 1_000))).toBe("invalido");
  });

  it("rotação normal (sem logout) continua aceitando reuso recente", () => {
    const rotacionado: RefreshArmazenado = {
      revokedAt: new Date(Date.now() - 1_000),
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      user: { active: true, deletedAt: null },
    };
    expect(situacaoRefresh(rotacionado, new Date())).toBe("reuso_recente");
  });

  it("com token: apaga só o token deste aparelho, filtrado pelo usuário da sessão", async () => {
    const res = await POST(req(JSON.stringify({ pushToken: "tok-aparelho" })));
    expect(res.status).toBe(200);
    expect(prismaMock.pushToken.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.pushToken.deleteMany).toHaveBeenCalledWith({ where: { token: "tok-aparelho", userId: "u1" } });
  });

  it("access vencido: usa o usuário do refresh token válido", async () => {
    verifyAccessToken.mockResolvedValue(null);
    prismaMock.refreshToken.findUnique.mockResolvedValue({ userId: "u2", revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    await POST(req(JSON.stringify({ pushToken: "tok" })));
    expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: "hash-ref" } }));
    expect(prismaMock.pushToken.deleteMany).toHaveBeenCalledWith({ where: { token: "tok", userId: "u2" } });
  });

  it("sem sessão válida (refresh revogado, vencido ou ausente): não apaga token nenhum", async () => {
    verifyAccessToken.mockResolvedValue(null);
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({ userId: "u2", revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    expect((await POST(req(JSON.stringify({ pushToken: "tok" })))).status).toBe(200);
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({ userId: "u2", revokedAt: null, expiresAt: new Date(Date.now() - 1) });
    expect((await POST(req(JSON.stringify({ pushToken: "tok" })))).status).toBe(200);
    expect((await POST(req(JSON.stringify({ pushToken: "tok" }), ""))).status).toBe(200);
    expect(prismaMock.pushToken.deleteMany).not.toHaveBeenCalled();
  });

  it("corpo inválido ou grande demais: logout segue sem apagar token", async () => {
    expect((await POST(req("{quebrado"))).status).toBe(200);
    expect((await POST(req(JSON.stringify({ pushToken: 42 })))).status).toBe(200);
    expect((await POST(req(JSON.stringify({ pushToken: "x".repeat(10_000) })))).status).toBe(200);
    expect(prismaMock.pushToken.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledTimes(6);
  });

  it("falha ao apagar o token: registra o erro e o logout termina com sucesso", async () => {
    prismaMock.pushToken.deleteMany.mockRejectedValue(new Error("banco fora"));
    const res = await POST(req(JSON.stringify({ pushToken: "tok" })));
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalled();
  });
});

describe("POST /api/auth/logout: falhas e corridas (casos 1 e 3 do PR #79)", () => {
  it("banco fora do ar: apaga os cookies mesmo assim e avisa que a sessão não foi revogada", async () => {
    prismaMock.refreshToken.findUnique.mockRejectedValue(new Error("banco indisponível"));
    prismaMock.refreshToken.updateMany.mockRejectedValue(new Error("banco indisponível"));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sessaoEncerrada: false });
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toMatch(/classlink_access=;.*Max-Age=0/);
    expect(cookies).toMatch(/classlink_refresh=;.*Max-Age=0/);
    expect(registrarErroServidor).toHaveBeenCalled();
  });

  it("caminho normal responde sessaoEncerrada true e sem cache", async () => {
    const res = await POST(req());
    expect(await res.json()).toEqual({ ok: true, sessaoEncerrada: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("token já trocado por uma renovação: vence também o substituto emitido naquela troca", async () => {
    const revogadoEm = new Date(Date.now() - 3_000);
    prismaMock.refreshToken.findUnique.mockResolvedValue({ userId: "u1", revokedAt: revogadoEm, expiresAt: new Date(Date.now() + 1e9) });
    await POST(req());
    const chamada = prismaMock.refreshToken.updateMany.mock.calls.find(([arg]) => arg.where.userId === "u1");
    expect(chamada).toBeDefined();
    const { where, data } = chamada![0];
    expect(where.createdAt.gte.getTime()).toBeLessThanOrEqual(revogadoEm.getTime());
    expect(where.createdAt.lte.getTime()).toBeGreaterThan(revogadoEm.getTime() + 15_000);
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.revokedAt).toBeInstanceOf(Date);
  });

  it("token ainda não trocado: não mexe em outras sessões do usuário", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({ userId: "u1", revokedAt: null, expiresAt: new Date(Date.now() + 1e9) });
    await POST(req());
    const outras = prismaMock.refreshToken.updateMany.mock.calls.filter(([arg]) => arg.where.userId !== undefined);
    expect(outras).toHaveLength(0);
  });
});
