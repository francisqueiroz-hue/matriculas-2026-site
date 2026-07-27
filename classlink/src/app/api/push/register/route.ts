import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";

const registerSchema = z.object({ token: z.string().min(1) });

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const { token } = registerSchema.parse(await request.json());

    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: session.sub },
      create: { token, userId: session.sub },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
