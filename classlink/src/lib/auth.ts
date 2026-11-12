import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { randomBytes, createHash } from "crypto";
import type { Role } from "@prisma/client";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutos
export const REFRESH_TOKEN_TTL_DAYS = 30;

let avisouSegredoCurto = false;

function getAccessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET não configurado");
  if (secret.length < 32 && !avisouSegredoCurto) {
    // Só avisa (não derruba o login): trocar o segredo desloga todo mundo, então é decisão do dono.
    avisouSegredoCurto = true;
    console.warn("JWT_ACCESS_SECRET tem menos de 32 caracteres; use um segredo aleatório maior.");
  }
  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  role: Role;
  schoolId: string;
  name: string;
}

const CUSTO_BCRYPT = 12;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, CUSTO_BCRYPT);
}

/** True se o hash foi gerado com custo menor que o atual (ou não é um bcrypt legível). */
export function precisaRehash(hash: string) {
  try {
    return bcrypt.getRounds(hash) < CUSTO_BCRYPT;
  } catch {
    return false;
  }
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signAccessToken(payload: AccessTokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getAccessSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret(), { algorithms: ["HS256"] });
    return payload as AccessTokenPayload;
  } catch {
    return null;
  }
}

/** Gera um refresh token opaco. Apenas o hash é persistido no banco. */
export function generateRefreshToken() {
  const token = randomBytes(48).toString("hex");
  const tokenHash = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, tokenHash, expiresAt };
}

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const ACCESS_COOKIE = "classlink_access";
export const REFRESH_COOKIE = "classlink_refresh";

export const accessCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: ACCESS_TOKEN_TTL_SECONDS,
};

export const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
  maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
};
