import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ONDE_GESTAO, cargoParaExibir, perfilDoUsuario } from "@/lib/permissoes-mensagens";

/**
 * Colegas com quem o usuário pode iniciar uma conversa interna (regras em
 * lib/permissoes-mensagens): a direção e a coordenação falam com toda a equipe;
 * professores e auxiliares, só com a direção e a coordenação.
 */
export async function GET() {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const perfil = await perfilDoUsuario(session.sub);
    const contatos = await prisma.user.findMany({
      where: {
        schoolId: session.schoolId,
        active: true,
        deletedAt: null,
        role: { in: ["ADMIN", "STAFF"] },
        id: { not: session.sub },
        ...(perfil === "gestao" ? {} : ONDE_GESTAO),
      },
      select: { id: true, name: true, role: true, isCoordenacao: true, funcao: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      contacts: contatos.map((u) => ({ id: u.id, name: u.name, role: u.role, cargo: cargoParaExibir(u) })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
