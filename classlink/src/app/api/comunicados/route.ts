import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createComunicadoSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";
import { getPublicoAlvo } from "@/lib/comunicados";
import { SELECT_PESSOA, pessoaParaQuemVe } from "@/lib/nome-institucional";

export async function GET() {
  try {
    const session = await requireSession();

    let visibilidadeOR: Array<Record<string, unknown>> | undefined;
    // Responsável: alunos vinculados, para saber quantos filhos cada comunicado alcança.
    let vinculos: { studentId: string; classId: string }[] = [];
    if (session.role === "GUARDIAN") {
      const links = await prisma.guardianStudent.findMany({
        where: { guardianId: session.sub, student: { deletedAt: null } },
        select: { studentId: true, student: { select: { classId: true } } },
      });
      vinculos = links.map((l) => ({ studentId: l.studentId, classId: l.student.classId }));
      const classIds = [...new Set(links.map((l) => l.student.classId))];
      const studentIds = links.map((l) => l.studentId);
      // Comunicados individuais (audience STUDENT) só aparecem para o responsável do próprio aluno-alvo,
      // nunca para os outros responsáveis da mesma turma.
      visibilidadeOR = [
        { audience: "SCHOOL" },
        { audience: "CLASS", classId: { in: classIds } },
        { audience: "STUDENT", alunoId: { in: studentIds } },
      ];
    } else if (session.role === "STAFF") {
      const teaching = await prisma.classTeacher.findMany({
        where: { teacherId: session.sub },
        select: { classId: true },
      });
      const classIds = [...new Set(teaching.map((t) => t.classId))];
      visibilidadeOR = [
        { audience: "SCHOOL" },
        { audience: "CLASS", classId: { in: classIds } },
        { audience: "STUDENT", classId: { in: classIds } },
      ];
    }

    const comunicados = await prisma.comunicado.findMany({
      where: {
        schoolId: session.schoolId,
        OR: visibilidadeOR,
      },
      include: {
        class: { select: { id: true, name: true } },
        aluno: { select: { id: true, name: true } },
        criadoPor: { select: SELECT_PESSOA },
        respostas:
          session.role === "GUARDIAN"
            ? { where: { responsavelId: session.sub }, select: { alunoId: true, resposta: true } }
            : { select: { resposta: true } },
      },
      orderBy: { dataCriacao: "desc" },
    });

    const comunicadosComContagem = await Promise.all(
      comunicados.map(async (c) => {
        const { respostas, ...comNomeReal } = c;
        // Família vê quem publicou pelo cargo/nome institucional.
        const rest = { ...comNomeReal, criadoPor: pessoaParaQuemVe(c.criadoPor, session.role) };
        if (session.role === "GUARDIAN") {
          // Irmãos na escola respondem um a um: "respondido" só quando todos têm resposta.
          const alunosAlvo =
            c.audience === "SCHOOL"
              ? vinculos.length
              : c.audience === "CLASS"
                ? vinculos.filter((v) => v.classId === c.classId).length
                : vinculos.some((v) => v.studentId === c.alunoId)
                  ? 1
                  : 0;
          return { ...rest, minhasRespostas: respostas, alunosAlvo };
        }
        const respondidas = respostas.filter((r) => r.resposta !== "PENDENTE_EXPIRADO").length;
        const publicoAlvo = await getPublicoAlvo(c.id);
        return { ...rest, totalRespostas: respondidas, totalPublicoAlvo: publicoAlvo.length };
      }),
    );

    return NextResponse.json({ comunicados: comunicadosComContagem });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const body = createComunicadoSchema.parse(await request.json());

    if (body.audience === "SCHOOL" && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Apenas administradores publicam para toda a escola" }, { status: 403 });
    }

    let classId: string | null = null;
    let alunoId: string | null = null;

    if (body.audience === "CLASS") {
      if (!body.classId) return NextResponse.json({ error: "classId obrigatório" }, { status: 400 });
      const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId: session.schoolId } });
      if (!cls) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
      if (session.role === "STAFF") {
        const teaches = await prisma.classTeacher.findFirst({
          where: { classId: body.classId, teacherId: session.sub },
        });
        if (!teaches) return NextResponse.json({ error: "Você não leciona nesta turma" }, { status: 403 });
      }
      classId = body.classId;
    }

    if (body.audience === "STUDENT") {
      if (!body.alunoId) return NextResponse.json({ error: "alunoId obrigatório" }, { status: 400 });
      const aluno = await prisma.student.findFirst({
        where: { id: body.alunoId, schoolId: session.schoolId, deletedAt: null },
        select: { id: true, classId: true },
      });
      if (!aluno) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
      if (session.role === "STAFF") {
        const teaches = await prisma.classTeacher.findFirst({
          where: { classId: aluno.classId, teacherId: session.sub },
        });
        if (!teaches) return NextResponse.json({ error: "Você não leciona na turma deste aluno" }, { status: 403 });
      }
      alunoId = aluno.id;
      classId = aluno.classId; // mantém a mesma filtragem de visibilidade por turma usada nos demais casos
    }

    const comunicado = await prisma.comunicado.create({
      data: {
        tipo: body.tipo,
        titulo: body.titulo,
        descricao: body.descricao,
        audience: body.audience,
        classId,
        alunoId,
        prazoResposta: body.prazoResposta ? new Date(body.prazoResposta) : null,
        schoolId: session.schoolId,
        criadoPorId: session.sub,
      },
      include: { class: { select: { id: true, name: true } }, aluno: { select: { id: true, name: true } } },
    });

    const publicoAlvo = await getPublicoAlvo(comunicado.id);
    // after: na Vercel, trabalho solto com "void" pode ser cortado ao responder.
    after(() =>
      notifyUsers(
        [...new Set(publicoAlvo.map((p) => p.guardianId))],
        {
          title: `Novo comunicado: ${comunicado.titulo}`,
          body: comunicado.descricao.slice(0, 120),
          url: `/dashboard/comunicados/${comunicado.id}`,
        },
      ).catch((err) => console.error("push notify failed", err)),
    );

    return NextResponse.json({ comunicado }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
