import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { AuthError, requireSession } from "@/lib/session";

/**
 * Ponto de entrada da tela "Saúde e autorizados":
 * - família: os filhos vinculados (para escolher qual ficha abrir);
 * - direção e coordenação: as fichas alteradas pela família que a escola ainda não conferiu
 *   (o aviso no app, que fica até alguém conferir).
 * Professor: 403. Nada financeiro sai daqui.
 */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.role === "GUARDIAN") {
      const links = await prisma.guardianStudent.findMany({
        where: { guardianId: session.sub, student: { schoolId: session.schoolId, deletedAt: null } },
        select: { student: { select: { id: true, name: true, class: { select: { name: true } } } } },
        orderBy: { student: { name: "asc" } },
      });
      return NextResponse.json(
        { papel: "FAMILIA", alunos: links.map((l) => ({ id: l.student.id, name: l.student.name, turma: l.student.class?.name ?? null })) },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (session.role === "STAFF") {
      const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { isCoordenacao: true } });
      if (!user?.isCoordenacao) throw new AuthError("Ficha de saúde restrita à direção e à coordenação", 403);
    } else if (session.role !== "ADMIN") {
      throw new AuthError("Acesso negado para este perfil", 403);
    }
    const pendentes = await prisma.fichaSaude.findMany({
      where: { schoolId: session.schoolId, pendenteConferenciaDesde: { not: null }, student: { deletedAt: null } },
      orderBy: { pendenteConferenciaDesde: "asc" },
      select: {
        pendenteConferenciaDesde: true,
        alteradoPelaFamiliaPor: true,
        student: { select: { id: true, name: true, class: { select: { name: true } } } },
      },
    });
    return NextResponse.json(
      {
        papel: "ESCOLA",
        pendentes: pendentes.map((p) => ({
          alunoId: p.student.id,
          aluno: p.student.name,
          turma: p.student.class?.name ?? null,
          desde: p.pendenteConferenciaDesde,
          por: p.alteradoPelaFamiliaPor,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
