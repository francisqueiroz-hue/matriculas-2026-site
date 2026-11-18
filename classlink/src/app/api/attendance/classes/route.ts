import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { exigirArea } from "@/lib/visibilidade-server";
import { ehCoordenacaoNoBanco } from "@/lib/turmas-acesso";

/**
 * Turmas em que o usuário logado pode marcar/consultar frequência: ADMIN (direção e secretaria)
 * e a coordenação veem todas as turmas da escola; professores, apenas as turmas em que lecionam.
 */
export async function GET() {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "FREQUENCIA");
    const soAsDele = session.role === "STAFF" && !(await ehCoordenacaoNoBanco(session.sub));
    const classes = await prisma.class.findMany({
      where: {
        schoolId: session.schoolId,
        ...(soAsDele ? { teachers: { some: { teacherId: session.sub } } } : {}),
      },
      select: { id: true, name: true, year: true },
      orderBy: [{ year: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ classes });
  } catch (error) {
    return handleApiError(error);
  }
}
