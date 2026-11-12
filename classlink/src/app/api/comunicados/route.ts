import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createComunicadoSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";
import { getPublicoAlvo } from "@/lib/comunicados";
import { separarAbertura } from "@/lib/comunicado-leitura";
import { SELECT_PESSOA, pessoaParaQuemVe } from "@/lib/nome-institucional";
import { exigirAlunoPublicavel, exigirTurmaPublicavel } from "@/lib/turmas-acesso";
import { visibilidadePorPublico } from "@/lib/escopo-acesso";

export async function GET() {
  try {
    const session = await requireSession();

    // Família: vínculos com os filhos, para saber quantos filhos cada comunicado alcança.
    // Comunicados individuais (audience STUDENT) só aparecem para o responsável do próprio aluno-alvo.
    const { condicoes, vinculos } = await visibilidadePorPublico(session);

    const comunicados = await prisma.comunicado.findMany({
      where: {
        schoolId: session.schoolId,
        OR: condicoes,
      },
      include: {
        class: { select: { id: true, name: true } },
        aluno: { select: { id: true, name: true } },
        criadoPor: { select: SELECT_PESSOA },
        respostas:
          session.role === "GUARDIAN"
            ? { where: { responsavelId: session.sub }, select: { alunoId: true, resposta: true } }
            : { select: { resposta: true } },
        // Circular é só leitura: o que conta é a abertura (ComunicadoLeitura), não uma resposta.
        leituras:
          session.role === "GUARDIAN"
            ? { where: { userId: session.sub }, select: { userId: true, lidoEm: true } }
            : { select: { userId: true, lidoEm: true } },
      },
      orderBy: { dataCriacao: "desc" },
    });

    const comunicadosComContagem = await Promise.all(
      comunicados.map(async (c) => {
        const { respostas, leituras, ...comNomeReal } = c;
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
          return { ...rest, minhasRespostas: respostas, alunosAlvo, lidoEm: leituras[0]?.lidoEm ?? null };
        }
        const publicoAlvo = await getPublicoAlvo(c.id);
        if (c.tipo === "CIRCULAR") {
          // Uma linha por família (responsável com vários filhos conta uma vez), como no detalhe.
          const { abriram, naoAbriram } = separarAbertura(publicoAlvo, leituras);
          return { ...rest, totalRespostas: abriram.length, totalPublicoAlvo: abriram.length + naoAbriram.length };
        }
        const respondidas = respostas.filter((r) => r.resposta !== "PENDENTE_EXPIRADO").length;
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
      await exigirTurmaPublicavel(session, body.classId);
      classId = body.classId;
    }

    if (body.audience === "STUDENT") {
      if (!body.alunoId) return NextResponse.json({ error: "alunoId obrigatório" }, { status: 400 });
      const aluno = await exigirAlunoPublicavel(session, body.alunoId);
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
