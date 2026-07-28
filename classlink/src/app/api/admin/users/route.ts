import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createUserSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const role = request.nextUrl.searchParams.get("role") ?? undefined;

    const users = await prisma.user.findMany({
      where: {
        schoolId: session.schoolId,
        deletedAt: null,
        ...(role ? { role: role as "ADMIN" | "STAFF" | "GUARDIAN" } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        active: true,
        isCoordenacao: true,
        classesTeaching: { select: { class: { select: { id: true, name: true } } } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = createUserSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        role: body.role,
        schoolId: session.schoolId,
        passwordHash: await hashPassword(body.password),
        ...(body.role === "STAFF" && body.classIds?.length
          ? { classesTeaching: { create: body.classIds.map((classId) => ({ classId })) } }
          : {}),
      },
    });

    return NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
