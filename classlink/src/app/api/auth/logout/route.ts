import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACCESS_COOKIE, REFRESH_COOKIE, hashRefreshToken } from "@/lib/auth";
import { handleApiError } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
