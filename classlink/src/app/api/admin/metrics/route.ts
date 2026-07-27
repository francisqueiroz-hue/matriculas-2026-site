import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/** Painel de engajamento: quem leu cada aviso e taxa de resposta às mensagens. */
export async function GET() {
  try {
    const session = await requireRole("ADMIN");
    const schoolId = session.schoolId;

    const [totalStudents, totalGuardians, totalStaff, recentPosts] = await Promise.all([
      prisma.student.count({ where: { schoolId, deletedAt: null } }),
      prisma.user.count({ where: { schoolId, role: "GUARDIAN", deletedAt: null } }),
      prisma.user.count({ where: { schoolId, role: "STAFF", deletedAt: null } }),
      prisma.post.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          _count: { select: { reads: true } },
          class: { select: { id: true, name: true } },
        },
      }),
    ]);

    const guardiansBySchool = await prisma.user.count({
      where: { schoolId, role: "GUARDIAN", deletedAt: null, active: true },
    });

    const postMetrics = await Promise.all(
      recentPosts.map(async (post) => {
        const audienceSize =
          post.audience === "SCHOOL"
            ? guardiansBySchool
            : await prisma.guardianStudent.count({
                where: { student: { classId: post.classId ?? undefined, deletedAt: null } },
              });
        return {
          id: post.id,
          title: post.title,
          audience: post.audience,
          className: post.class?.name ?? null,
          createdAt: post.createdAt,
          readCount: post._count.reads,
          audienceSize,
          readRate: audienceSize > 0 ? Math.round((post._count.reads / audienceSize) * 100) : 0,
        };
      }),
    );

    const [staffMessages, guardianReplies] = await Promise.all([
      prisma.message.count({
        where: { conversation: { staff: { schoolId } }, sender: { role: "STAFF" } },
      }),
      prisma.message.count({
        where: { conversation: { staff: { schoolId } }, sender: { role: "GUARDIAN" } },
      }),
    ]);

    return NextResponse.json({
      totals: { totalStudents, totalGuardians, totalStaff },
      posts: postMetrics,
      messaging: {
        staffMessages,
        guardianReplies,
        responseRate: staffMessages > 0 ? Math.round((guardianReplies / staffMessages) * 100) : 0,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
