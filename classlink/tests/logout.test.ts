import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  refreshToken: { updateMany: vi.fn(), findUnique: vi.fn() },
  pushToken: { deleteMany: vi.fn() },
}));
const verifyAccessToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({
  ACCESS_COOKIE: "classlink_access",
  REFRESH_COOKIE: "classlink_refresh",
  hashRefreshToken: (t: string) => `hash-${t}`,
  verifyAccessToken,
}));

import { POST } from "@/app/api/auth/logout/route";
import { lerTokenPushDoLogout, TAMANHO_MAXIMO_CORPO_LOGOUT } from "@/lib/logout-corpo";

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
  it("sem corpo: revoga a sessão, apaga cookies e não mexe em push", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: "hash-ref", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prismaMock.pushToken.deleteMany).not.toHaveBeenCalled();
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("classlink_access=;");
    expect(setCookie).toContain("classlink_refresh=;");
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
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledTimes(3);
  });

  it("falha ao apagar o token: registra o erro e o logout termina com sucesso", async () => {
    prismaMock.pushToken.deleteMany.mockRejectedValue(new Error("banco fora"));
    const res = await POST(req(JSON.stringify({ pushToken: "tok" })));
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalled();
  });
});
