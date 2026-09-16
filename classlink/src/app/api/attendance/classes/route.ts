import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/**
 * Turmas em que o usuário logado pode marcar/consultar frequência: ADMIN (direção) vê
 * todas as turmas da escola; STAFF (professor) vê apenas as turmas em que leciona.
 */
export async function GET() {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const classes = await prisma.class.findMany({
      where: {
        schoolId: session.schoolId,
        ...(session.role === "STAFF" ? { teachers: { some: { teacherId: session.sub } } } : {}),
      },
      select: { id: true, name: true, year: true },
      orderBy: [{ year: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ classes });
  } catch (error) {
    return handleApiError(error);
  }
}
