import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createEnqueteSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";
import { ErroDeUsuario } from "@/lib/erros";
import { enqueteAberta, normalizarOpcoesPergunta } from "@/lib/enquetes";
import { filtroDeVisibilidadeEnquetes, publicoDaEnquete } from "@/lib/enquetes-acesso";

export async function GET() {
  try {
    const session = await requireSession();
    const OR = await filtroDeVisibilidadeEnquetes(session);

    const enquetes = await prisma.enquete.findMany({
      where: { schoolId: session.schoolId, ...(OR ? { OR } : {}) },
      select: {
        id: true,
        titulo: true,
        audience: true,
        anonima: true,
        prazo: true,
        encerradaEm: true,
        dataCriacao: true,
        class: { select: { id: true, name: true } },
        aluno: { select: { id: true, name: true } },
        _count: { select: { participacoes: true, perguntas: true } },
      },
      orderBy: { dataCriacao: "desc" },
      take: 100,
    });

    let respondidas = new Set<string>();
    if (session.role === "GUARDIAN") {
      const minhas = await prisma.enqueteParticipacao.findMany({
        where: { userId: session.sub, enqueteId: { in: enquetes.map((e) => e.id) } },
        select: { enqueteId: true },
      });
      respondidas = new Set(minhas.map((m) => m.enqueteId));
    }

    const agora = new Date();
    return NextResponse.json({
      enquetes: enquetes.map(({ _count, ...e }) => ({
        ...e,
        aberta: enqueteAberta(e, agora),
        totalPerguntas: _count.perguntas,
        ...(session.role === "GUARDIAN" ? { respondida: respondidas.has(e.id) } : { totalRespostas: _count.participacoes }),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const body = createEnqueteSchema.parse(await request.json());

    if (body.audience === "SCHOOL" && session.role !== "ADMIN") {
      throw new ErroDeUsuario("Apenas administradores publicam enquetes para toda a escola.", 403);
    }

    let classId: string | null = null;
    let alunoId: string | null = null;

    if (body.audience === "CLASS") {
      if (!body.classId) throw new ErroDeUsuario("Escolha a turma.");
      const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId: session.schoolId } });
      if (!cls) throw new ErroDeUsuario("Turma não encontrada.", 404);
      if (session.role === "STAFF") {
        const leciona = await prisma.classTeacher.findFirst({ where: { classId: body.classId, teacherId: session.sub } });
        if (!leciona) throw new ErroDeUsuario("Você não leciona nesta turma.", 403);
      }
      classId = body.classId;
    }

    if (body.audience === "STUDENT") {
      if (!body.alunoId) throw new ErroDeUsuario("Escolha o aluno.");
      const aluno = await prisma.student.findFirst({
        where: { id: body.alunoId, schoolId: session.schoolId, deletedAt: null },
        select: { id: true, classId: true },
      });
      if (!aluno) throw new ErroDeUsuario("Aluno não encontrado.", 404);
      if (session.role === "STAFF") {
        const leciona = await prisma.classTeacher.findFirst({ where: { classId: aluno.classId, teacherId: session.sub } });
        if (!leciona) throw new ErroDeUsuario("Você não leciona na turma deste aluno.", 403);
      }
      alunoId = aluno.id;
      classId = aluno.classId;
      // Enquete direcionada a uma única família não pode ser anônima: a escola já sabe quem é.
      if (body.anonima) throw new ErroDeUsuario("Enquete para um aluno individual precisa ser identificada.");
    }

    const perguntas = body.perguntas.map((p, i) => ({
      ordem: i,
      tipo: p.tipo,
      texto: p.texto,
      obrigatoria: p.obrigatoria,
      opcoes: normalizarOpcoesPergunta(p.tipo, p.opcoes) ?? undefined,
    }));

    const enquete = await prisma.enquete.create({
      data: {
        titulo: body.titulo,
        descricao: body.descricao || null,
        audience: body.audience,
        anonima: body.anonima,
        prazo: body.prazo ? new Date(body.prazo) : null,
        classId,
        alunoId,
        schoolId: session.schoolId,
        criadoPorId: session.sub,
        perguntas: { create: perguntas as never },
      },
      select: { id: true, titulo: true, schoolId: true, audience: true, classId: true, alunoId: true },
    });

    const publico = await publicoDaEnquete(enquete);
    after(() =>
      notifyUsers(
        publico.map((p) => p.id),
        { title: `Nova enquete: ${enquete.titulo}`, body: "Sua opinião é importante para a escola.", url: `/dashboard/enquetes/${enquete.id}` },
      ).catch((err) => console.error("push notify failed", err)),
    );

    return NextResponse.json({ enquete: { id: enquete.id } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
