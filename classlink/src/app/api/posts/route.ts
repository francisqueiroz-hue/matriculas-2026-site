import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { ehGestaoDaSessao, exigirPodePublicar, requireRole, requireSession } from "@/lib/session";
import { MENSAGEM_SO_GESTAO_ESCOLA } from "@/lib/equipe";
import { handleApiError } from "@/lib/http";
import { createPostSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";
import { getSignedMediaUrl } from "@/lib/firebase-storage";
import { filtroDeVisibilidade, turmasVisiveisNoMural } from "@/lib/visibilidade-posts";
import { SELECT_PESSOA, pessoaParaQuemVe } from "@/lib/nome-institucional";
import { exigirTurmaPublicavel } from "@/lib/turmas-acesso";
import { exigirArea } from "@/lib/visibilidade-server";
import { validarMidiaDoAviso } from "@/lib/midia-aviso";

/**
 * Troca os caminhos internos dos arquivos (foto/vídeo ou páginas do PDF) por URLs assinadas
 * de leitura (temporárias).
 */
async function withSignedMedia<T extends { mediaUrl: string | null; mediaPaginas?: string[] }>(post: T): Promise<T> {
  if (!post.mediaUrl) return post;
  try {
    const paginas = post.mediaPaginas?.length ? await Promise.all(post.mediaPaginas.map((p) => getSignedMediaUrl(p))) : [];
    return { ...post, mediaUrl: paginas[0] ?? (await getSignedMediaUrl(post.mediaUrl)), mediaPaginas: paginas };
  } catch {
    return { ...post, mediaUrl: null, mediaPaginas: [] };
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await exigirArea(session, "MURAL");
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const classIdFilter = request.nextUrl.searchParams.get("classId") ?? undefined;

    const visibleClassIds = await turmasVisiveisNoMural(session);

    const posts = await prisma.post.findMany({
      where: {
        schoolId: session.schoolId,
        ...(classIdFilter ? { classId: classIdFilter } : {}),
        ...filtroDeVisibilidade(visibleClassIds),
      },
      include: {
        author: { select: SELECT_PESSOA },
        class: { select: { id: true, name: true } },
        _count: { select: { reads: true } },
        reads: { where: { userId: session.sub }, select: { id: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const postsWithMedia = await Promise.all(
      posts.map((p) =>
        withSignedMedia({ ...p, author: pessoaParaQuemVe(p.author, session.role), readByMe: p.reads.length > 0, reads: undefined }),
      ),
    );

    return NextResponse.json({
      posts: postsWithMedia,
      nextCursor: posts.length === 20 ? posts[posts.length - 1].id : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "MURAL");
    await exigirPodePublicar(session);
    const body = createPostSchema.parse(await request.json());

    if (body.audience === "SCHOOL" && !(await ehGestaoDaSessao(session))) {
      return NextResponse.json({ error: MENSAGEM_SO_GESTAO_ESCOLA }, { status: 403 });
    }

    const midia = validarMidiaDoAviso(body, session.schoolId);

    let classId: string | null = null;
    if (body.audience === "CLASS") {
      if (!body.classId) return NextResponse.json({ error: "classId obrigatório" }, { status: 400 });
      await exigirTurmaPublicavel(session, body.classId);
      classId = body.classId;
    }

    const post = await prisma.post.create({
      data: {
        title: body.title,
        body: body.body,
        audience: body.audience,
        classId,
        mediaUrl: midia.mediaUrl,
        mediaType: midia.mediaType,
        mediaPaginas: midia.mediaPaginas,
        mediaNome: midia.mediaNome,
        schoolId: session.schoolId,
        authorId: session.sub,
      },
      include: { author: { select: { id: true, name: true, role: true } }, class: { select: { id: true, name: true } } },
    });

    const recipients = await prisma.user.findMany({
      where: {
        schoolId: session.schoolId,
        role: "GUARDIAN",
        active: true,
        ...(classId
          ? { studentLinks: { some: { student: { classId, deletedAt: null } } } }
          : {}),
      },
      select: { id: true },
    });
    // after: na Vercel, trabalho solto com "void" pode ser cortado ao responder.
    after(() =>
      notifyUsers(
        recipients.map((r) => r.id),
        { title: `Novo aviso: ${post.title}`, body: post.body.slice(0, 120), url: "/dashboard/mural" },
      ).catch((err) => console.error("push notify failed", err)),
    );

    // Mesmo formato da lista (GET): o cartão novo aparece no topo sem recarregar a página.
    return NextResponse.json(
      { post: await withSignedMedia({ ...post, _count: { reads: 0 }, readByMe: false }) },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
