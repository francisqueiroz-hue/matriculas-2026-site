import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "@/lib/auth";

describe("hash de senha", () => {
  it("gera hash diferente do texto original e valida corretamente", async () => {
    const hash = await hashPassword("senha-super-secreta");
    expect(hash).not.toBe("senha-super-secreta");
    expect(await verifyPassword("senha-super-secreta", hash)).toBe(true);
  });

  it("rejeita senha incorreta", async () => {
    const hash = await hashPassword("senha-correta");
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
  });
});

process.env.JWT_ACCESS_SECRET = "test-secret-key-not-for-production";

describe("access token (JWT)", () => {
  it("assina e verifica um token válido", async () => {
    const token = await signAccessToken({
      sub: "user-1",
      role: "ADMIN",
      schoolId: "school-1",
      name: "Diretora Ana",
    });

    const payload = await verifyAccessToken(token);
    expect(payload?.sub).toBe("user-1");
    expect(payload?.role).toBe("ADMIN");
    expect(payload?.schoolId).toBe("school-1");
  });

  it("rejeita token adulterado", async () => {
    const token = await signAccessToken({
      sub: "user-1",
      role: "GUARDIAN",
      schoolId: "school-1",
      name: "Responsável",
    });
    const tampered = token.slice(0, -2) + "xx";
    expect(await verifyAccessToken(tampered)).toBeNull();
  });

  it("rejeita token vazio/mal formado", async () => {
    expect(await verifyAccessToken("not-a-jwt")).toBeNull();
  });
});

describe("refresh token", () => {
  it("gera token opaco cujo hash é determinístico e não reversível", () => {
    const { token, tokenHash, expiresAt } = generateRefreshToken();
    expect(token.length).toBeGreaterThan(32);
    expect(tokenHash).toBe(hashRefreshToken(token));
    expect(tokenHash).not.toBe(token);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("gera tokens únicos a cada chamada", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
  });
});
