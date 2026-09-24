import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ANO_LETIVO_MATRICULAS } from "@/lib/solicitacoes-matricula";

/**
 * Responsável logado confirma a rematrícula pelo aviso do painel. Registra uma
 * solicitação com os filhos vinculados (idempotente: uma por responsável e ano letivo).
 */
export async function POST() {
  try {
    const session = await requireRole("GUARDIAN");

    const existente = await prisma.solicitacaoMatricula.findFirst({
      where: { responsavelId: session.sub, tipo: "REMATRICULA", anoLetivo: ANO_LETIVO_MATRICULAS },
      select: { id: true },
    });
    if (existente) return NextResponse.json({ ok: true, id: existente.id, jaRegistrada: true });

    const responsavel = await prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        name: true,
        phone: true,
        schoolId: true,
        studentLinks: {
          where: { student: { deletedAt: null } },
          select: { student: { select: { name: true, class: { select: { name: true } } } } },
          orderBy: { student: { name: "asc" } },
        },
      },
    });
    if (!responsavel) return NextResponse.json({ error: "Responsável não encontrado" }, { status: 404 });

    const alunos = responsavel.studentLinks.map((l) => l.student);
    const solicitacao = await prisma.solicitacaoMatricula.create({
      data: {
        schoolId: responsavel.schoolId,
        tipo: "REMATRICULA",
        origem: "CLASSLINK",
        anoLetivo: ANO_LETIVO_MATRICULAS,
        responsavelId: session.sub,
        responsavelNome: responsavel.name,
        telefone: (responsavel.phone ?? "").replace(/\D/g, ""),
        alunoNome: alunos.map((a) => a.name).join(", ") || "(sem aluno vinculado)",
        serie: alunos.length > 0 ? `Turma atual: ${alunos.map((a) => a.class?.name ?? "—").join(", ")}` : null,
        consentimentoEm: new Date(),
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: solicitacao.id, jaRegistrada: false }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
