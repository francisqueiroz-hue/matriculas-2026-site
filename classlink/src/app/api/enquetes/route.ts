import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { ehGestaoDaSessao, exigirDirecaoOuCoordenacao, exigirPodePublicar, perfilDaSessao, requireRole, requireSession } from "@/lib/session";
import { MENSAGEM_SO_DIRECAO_COORDENACAO_ENQUETE_INTERNA, MENSAGEM_SO_GESTAO_ESCOLA, ehGestao, respondeEnqueteInterna } from "@/lib/equipe";
import { handleApiError } from "@/lib/http";
import { createEnqueteSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";
import { ErroDeUsuario } from "@/lib/erros";
import { enqueteAberta, normalizarOpcoesPergunta } from "@/lib/enquetes";
import { filtroDeVisibilidadeEnquetes, publicoDaEnquete } from "@/lib/enquetes-acesso";
import { exigirAlunoPublicavel, exigirTurmaPublicavel } from "@/lib/turmas-acesso";
import { exigirArea } from "@/lib/visibilidade-server";

export async function GET() {
  try {
    const session = await requireSession();
    await exigirArea(session, "ENQUETES");
    const filtro = await filtroDeVisibilidadeEnquetes(session);

    const enquetes = await prisma.enquete.findMany({
      where: { AND: [{ schoolId: session.schoolId }, filtro] },
      select: {
        id: true,
        titulo: true,
        audience: true,
        interna: true,
        anonima: true,
        prazo: true,
        encerradaEm: true,
        dataCriacao: true,
        criadoPorId: true,
        class: { select: { id: true, name: true } },
        aluno: { select: { id: true, name: true } },
        _count: { select: { participacoes: true, perguntas: true } },
      },
      orderBy: { dataCriacao: "desc" },
      take: 100,
    });

    // Quem responde (família; equipe nas internas) vê "respondida" em cada enquete que responde;
    // a gestão (direção, secretaria e coordenação) vê o total de respostas. Secretaria e
    // coordenação podem ter os dois numa enquete interna.
    const perfil = session.role === "GUARDIAN" ? null : await perfilDaSessao(session);
    const gestao = perfil !== null && ehGestao(perfil);
    const respondeInternas = perfil !== null && respondeEnqueteInterna(perfil);
    const responde = new Map(
      enquetes.map((e) => [e.id, perfil === null ? !e.interna : e.interna && e.criadoPorId !== session.sub && respondeInternas]),
    );
    const idsQueResponde = enquetes.filter((e) => responde.get(e.id)).map((e) => e.id);
    const respondidas = new Set(
      idsQueResponde.length
        ? (
            await prisma.enqueteParticipacao.findMany({
              where: { userId: session.sub, enqueteId: { in: idsQueResponde } },
              select: { enqueteId: true },
            })
          ).map((m) => m.enqueteId)
        : [],
    );

    const agora = new Date();
    return NextResponse.json({
      enquetes: enquetes.map(({ _count, criadoPorId: _autor, ...e }) => {
        void _autor;
        return {
          ...e,
          aberta: enqueteAberta(e, agora),
          totalPerguntas: _count.perguntas,
          ...(responde.get(e.id) ? { respondida: respondidas.has(e.id) } : {}),
          ...(gestao ? { totalRespostas: _count.participacoes } : {}),
        };
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "ENQUETES");
    await exigirPodePublicar(session);
    const body = createEnqueteSchema.parse(await request.json());

    // Enquete interna: da direção ou da coordenação para a equipe (professores e auxiliares).
    if (body.interna) {
      await exigirDirecaoOuCoordenacao(session, MENSAGEM_SO_DIRECAO_COORDENACAO_ENQUETE_INTERNA);
      return await criarEnqueteInterna(session, body); // await: erros de validação caem no catch (400, não 500)
    }

    if (body.audience === "SCHOOL" && !(await ehGestaoDaSessao(session))) {
      throw new ErroDeUsuario(MENSAGEM_SO_GESTAO_ESCOLA, 403);
    }

    let classId: string | null = null;
    let alunoId: string | null = null;

    if (body.audience === "CLASS") {
      if (!body.classId) throw new ErroDeUsuario("Escolha a turma.");
      await exigirTurmaPublicavel(session, body.classId);
      classId = body.classId;
    }

    if (body.audience === "STUDENT") {
      if (!body.alunoId) throw new ErroDeUsuario("Escolha o aluno.");
      const aluno = await exigirAlunoPublicavel(session, body.alunoId);
      alunoId = aluno.id;
      classId = aluno.classId;
      // Enquete direcionada a uma única família não pode ser anônima: a escola já sabe quem é.
      if (body.anonima) throw new ErroDeUsuario("Enquete para um aluno individual precisa ser identificada.");
    }

    const perguntas = perguntasParaGravar(body);

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

    const publico = await publicoDaEnquete({ ...enquete, interna: false });
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

type CorpoEnquete = ReturnType<typeof createEnqueteSchema.parse>;

function perguntasParaGravar(body: CorpoEnquete) {
  return body.perguntas.map((p, i) => ({
    ordem: i,
    tipo: p.tipo,
    texto: p.texto,
    obrigatoria: p.obrigatoria,
    opcoes: normalizarOpcoesPergunta(p.tipo, p.opcoes) ?? undefined,
  }));
}

/** Enquete interna: sempre para a equipe toda (sem turma nem aluno), nunca visível às famílias. */
async function criarEnqueteInterna(session: { sub: string; schoolId: string }, body: CorpoEnquete) {
  const enquete = await prisma.enquete.create({
    data: {
      titulo: body.titulo,
      descricao: body.descricao || null,
      audience: "SCHOOL",
      interna: true,
      anonima: body.anonima,
      prazo: body.prazo ? new Date(body.prazo) : null,
      classId: null,
      alunoId: null,
      schoolId: session.schoolId,
      criadoPorId: session.sub,
      perguntas: { create: perguntasParaGravar(body) as never },
    },
    select: { id: true, titulo: true, schoolId: true, audience: true, classId: true, alunoId: true, criadoPorId: true },
  });

  const publico = await publicoDaEnquete({ ...enquete, interna: true });
  after(() =>
    notifyUsers(
      publico.map((p) => p.id),
      { title: `Enquete da equipe: ${enquete.titulo}`, body: "A direção e a coordenação querem ouvir você.", url: `/dashboard/enquetes/${enquete.id}` },
    ).catch((err) => console.error("push notify failed", err)),
  );

  return NextResponse.json({ enquete: { id: enquete.id } }, { status: 201 });
}
