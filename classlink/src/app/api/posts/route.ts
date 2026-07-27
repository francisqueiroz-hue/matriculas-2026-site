import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createPostSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const classIdFilter = request.nextUrl.searchParams.get("classId") ?? undefined;

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
    } // ADMIN vê tudo da escola

    const posts = await prisma.post.findMany({
      where: {
        schoolId: session.schoolId,
        ...(classIdFilter ? { classId: classIdFilter } : {}),
        OR:
          visibleClassIds === null
            ? undefined
            : [{ audience: "SCHOOL" }, { audience: "CLASS", classId: { in: visibleClassIds } }],
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        class: { select: { id: true, name: true } },
        _count: { select: { reads: true } },
        reads: { where: { userId: session.sub }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    return NextResponse.json({
      posts: posts.map((p) => ({ ...p, readByMe: p.reads.length > 0, reads: undefined })),
      nextCursor: posts.length === 20 ? posts[posts.length - 1].id : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const body = createPostSchema.parse(await request.json());

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

    const post = await prisma.post.create({
      data: {
        title: body.title,
        body: body.body,
        audience: body.audience,
        classId,
        mediaUrl: body.mediaUrl,
        mediaType: body.mediaType,
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
    void notifyUsers(
      recipients.map((r) => r.id),
      { title: `Novo aviso: ${post.title}`, body: post.body.slice(0, 120), url: "/dashboard/mural" },
    ).catch((err) => console.error("push notify failed", err));

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
