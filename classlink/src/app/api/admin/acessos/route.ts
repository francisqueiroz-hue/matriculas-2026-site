import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { NUMERO_WHATSAPP_ESCOLA, linkPedirAcesso } from "@/lib/acesso";
import { modeloDisponivel } from "@/lib/whatsapp-modelos";
import { FUNCAO_LABEL, funcaoDoUsuario } from "@/lib/equipe";
import { idsComNomeRepetido } from "@/lib/nomes-semelhantes";

/**
 * Responsáveis da escola e se já entraram no app. "Nunca entrou" = nenhuma sessão criada
 * (todo login gera um RefreshToken, que nunca é apagado, só revogado).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    // Filtros: padrão = nunca entraram; ?todos=1 = todos; ?filtro=sem-notificacao = sem push no celular.
    const semNotificacao = request.nextUrl.searchParams.get("filtro") === "sem-notificacao";
    const somentePendentes = !semNotificacao && request.nextUrl.searchParams.get("todos") !== "1";
    // Famílias (padrão) ou equipe — o mesmo fluxo de acesso vale para os dois.
    const equipe = request.nextUrl.searchParams.get("publico") === "equipe";

    const responsaveis = await prisma.user.findMany({
      where: {
        schoolId: session.schoolId,
        role: equipe ? { in: ["ADMIN", "STAFF"] } : "GUARDIAN",
        deletedAt: null,
        active: true,
        ...(somentePendentes && { refreshTokens: { none: {} } }),
        ...(semNotificacao && { pushTokens: { none: {} } }),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        createdAt: true,
        _count: { select: { refreshTokens: true } },
        role: true,
        isCoordenacao: true,
        funcao: true,
        classesTeaching: { select: { class: { select: { name: true } } } },
        studentLinks: {
          where: { student: { deletedAt: null } },
          select: { student: { select: { name: true, class: { select: { name: true } } } } },
        },
      },
      orderBy: { name: "asc" },
    });

    // Quando entrou (1ª sessão), último uso (cada uso renova a sessão) e se ativou notificações.
    const ids = responsaveis.map((r) => r.id);
    const [sessoes, pushes] = await Promise.all([
      prisma.refreshToken.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _min: { createdAt: true }, _max: { createdAt: true } }),
      prisma.pushToken.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }),
    ]);
    const sessaoPor = new Map(sessoes.map((x) => [x.userId, x]));
    const pushPor = new Map(pushes.map((x) => [x.userId, x._count._all]));

    // Possíveis cadastros duplicados: outro responsável (ou colega) com nome parecido.
    const todos = await prisma.user.findMany({
      where: { schoolId: session.schoolId, role: equipe ? { in: ["ADMIN", "STAFF"] } : "GUARDIAN", deletedAt: null, active: true },
      select: { id: true, name: true },
    });
    const repetidos = idsComNomeRepetido(todos);

    return NextResponse.json({
      numeroEscola: NUMERO_WHATSAPP_ESCOLA,
      linkPedirAcesso: linkPedirAcesso(),
      whatsappConfigurado: isWhatsAppConfigured(),
      // Convite (modelo aprovado) disponível: dá para enviar a quem não escreveu nas últimas 24h.
      conviteAprovado: (await modeloDisponivel("convite")) !== null,
      responsaveis: responsaveis.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        createdAt: r.createdAt,
        jaEntrou: r._count.refreshTokens > 0,
        alunos: r.studentLinks.map((l) => (l.student.class ? `${l.student.name} (${l.student.class.name})` : l.student.name)),
        funcao: equipe ? FUNCAO_LABEL[funcaoDoUsuario(r) ?? "PROFESSOR"] : null,
        turmas: r.classesTeaching.map((c) => c.class.name),
        nomeRepetido: repetidos.has(r.id),
        primeiroAcesso: sessaoPor.get(r.id)?._min.createdAt ?? null,
        ultimoUso: sessaoPor.get(r.id)?._max.createdAt ?? null,
        notificacoesAtivas: (pushPor.get(r.id) ?? 0) > 0,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
