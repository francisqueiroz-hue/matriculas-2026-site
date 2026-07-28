import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createComunicadoSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";
import { getPublicoAlvo } from "@/lib/comunicados";

export async function GET() {
  try {
    const session = await requireSession();

    let visibleClassIds: string[] | null = null;
    if (session.role === "GUARDIAN") {
      const links = await prisma.guardianStudent.findMany({
        where: { guardianId: session.sub, student: { deletedAt: null } },
        select: { student: { select: { classId: true } } },
      });
      visibleClassIds = [...new Set(links.map((l) => l.student.classId))];
    } else if (session.role === "STAFF") {
      const teaching = await prisma.classTeacher.findMany({
        where: { teacherId: session.sub },
        select: { classId: true },
      });
      visibleClassIds = [...new Set(teaching.map((t) => t.classId))];
    }

    const comunicados = await prisma.comunicado.findMany({
      where: {
        schoolId: session.schoolId,
        OR: visibleClassIds === null ? undefined : [{ audience: "SCHOOL" }, { audience: "CLASS", classId: { in: visibleClassIds } }],
      },
      include: {
        class: { select: { id: true, name: true } },
        criadoPor: { select: { id: true, name: true } },
        respostas:
          session.role === "GUARDIAN"
            ? { where: { responsavelId: session.sub }, select: { alunoId: true, resposta: true } }
            : { select: { resposta: true } },
      },
      orderBy: { dataCriacao: "desc" },
    });

    const comunicadosComContagem = await Promise.all(
      comunicados.map(async (c) => {
        const { respostas, ...rest } = c;
        if (session.role === "GUARDIAN") {
          return { ...rest, minhasRespostas: respostas };
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

    const comunicado = await prisma.comunicado.create({
      data: {
        tipo: body.tipo,
        titulo: body.titulo,
        descricao: body.descricao,
        audience: body.audience,
        classId,
        prazoResposta: body.prazoResposta ? new Date(body.prazoResposta) : null,
        schoolId: session.schoolId,
        criadoPorId: session.sub,
      },
      include: { class: { select: { id: true, name: true } } },
    });

    const publicoAlvo = await getPublicoAlvo(comunicado.id);
    void notifyUsers(
      [...new Set(publicoAlvo.map((p) => p.guardianId))],
      {
        title: `Novo comunicado: ${comunicado.titulo}`,
        body: comunicado.descricao.slice(0, 120),
        url: `/dashboard/comunicados/${comunicado.id}`,
      },
    ).catch((err) => console.error("push notify failed", err));

    return NextResponse.json({ comunicado }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
