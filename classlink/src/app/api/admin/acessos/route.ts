import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getAccessTemplate, isWhatsAppConfigured } from "@/lib/whatsapp";
import { NUMERO_WHATSAPP_ESCOLA, linkPedirAcesso, linkWhatsAppManual, mensagemConvite } from "@/lib/acesso";

/**
 * Responsáveis da escola e se já entraram no app. "Nunca entrou" = nenhuma sessão criada
 * (todo login gera um RefreshToken, que nunca é apagado, só revogado).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const somentePendentes = request.nextUrl.searchParams.get("todos") !== "1";

    const responsaveis = await prisma.user.findMany({
      where: {
        schoolId: session.schoolId,
        role: "GUARDIAN",
        deletedAt: null,
        active: true,
        ...(somentePendentes && { refreshTokens: { none: {} } }),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        createdAt: true,
        _count: { select: { refreshTokens: true } },
        studentLinks: {
          where: { student: { deletedAt: null } },
          select: { student: { select: { name: true, class: { select: { name: true } } } } },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      numeroEscola: NUMERO_WHATSAPP_ESCOLA,
      linkPedirAcesso: linkPedirAcesso(),
      envioAutomaticoDisponivel: isWhatsAppConfigured() && getAccessTemplate() !== null,
      responsaveis: responsaveis.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        createdAt: r.createdAt,
        jaEntrou: r._count.refreshTokens > 0,
        alunos: r.studentLinks.map((l) => (l.student.class ? `${l.student.name} (${l.student.class.name})` : l.student.name)),
        linkConvite: linkWhatsAppManual(r.phone, mensagemConvite(r.name.split(" ")[0])),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
