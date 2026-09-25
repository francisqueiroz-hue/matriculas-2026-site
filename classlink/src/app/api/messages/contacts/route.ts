import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ONDE_GESTAO, cargoParaExibir, perfilDoUsuario } from "@/lib/permissoes-mensagens";

/**
 * Pessoas com quem o usuário atual pode iniciar uma conversa família ↔ escola (regras em
 * lib/permissoes-mensagens): a família vê só a direção e a coordenação; a gestão vê todas
 * as famílias com aluno ativo; professores e auxiliares não conversam com famílias.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const perfil = await perfilDoUsuario(session.sub);

    if (perfil === "familia") {
      const gestao = await prisma.user.findMany({
        where: { schoolId: session.schoolId, active: true, deletedAt: null, ...ONDE_GESTAO },
        select: { id: true, name: true, role: true, isCoordenacao: true, funcao: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({
        perfil,
        contacts: gestao.map((u) => ({ id: u.id, name: u.name, role: u.role, cargo: cargoParaExibir(u) })),
      });
    }

    if (perfil === "professor") return NextResponse.json({ perfil, contacts: [] });

    const guardianLinks = await prisma.guardianStudent.findMany({
      where: { guardian: { schoolId: session.schoolId, active: true, deletedAt: null }, student: { deletedAt: null } },
      select: { guardian: { select: { id: true, name: true, role: true } } },
      distinct: ["guardianId"],
    });

    return NextResponse.json({
      perfil,
      contacts: guardianLinks
        .map((l) => ({ ...l.guardian, cargo: "Responsável" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
