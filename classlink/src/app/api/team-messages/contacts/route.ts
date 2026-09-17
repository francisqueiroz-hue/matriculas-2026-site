import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/**
 * Colegas de equipe com quem o usuário atual pode iniciar uma conversa interna:
 * qualquer ADMIN/STAFF ativo da mesma escola, exceto ele mesmo. Sem restrição de
 * "atende a mesma turma" (diferente da mensageria com responsáveis) — é comunicação
 * interna entre a equipe da escola.
 */
export async function GET() {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const contacts = await prisma.user.findMany({
      where: {
        schoolId: session.schoolId,
        active: true,
        role: { in: ["ADMIN", "STAFF"] },
        id: { not: session.sub },
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ contacts });
  } catch (error) {
    return handleApiError(error);
  }
}
