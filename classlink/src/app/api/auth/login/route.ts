import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from "@/lib/auth";
import { handleApiError } from "@/lib/http";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await request.json());

    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !user.active || user.deletedAt) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    const validPassword = await verifyPassword(body.password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      role: user.role,
      schoolId: user.schoolId,
      name: user.name,
    });

    const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();
    await prisma.refreshToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        avatarUrl: user.avatarUrl,
      },
    });
    response.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions);
    response.cookies.set(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
