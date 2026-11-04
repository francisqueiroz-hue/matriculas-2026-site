import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { configLembretesSchema } from "@/lib/validators";
import { planejarDaEscola, pendenciasDaEscola } from "@/lib/lembretes-server";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { ehDomingo } from "@/lib/lembretes";

/**
 * Resumo para a direção: configuração, pendências das famílias (com quantos lembretes já
 * saíram e quando sai o próximo) e o que depende da própria escola. Só leitura: a prévia
 * nunca envia nada.
 */
export async function GET() {
  try {
    const session = await requireRole("ADMIN");
    const agora = new Date();
    const { config, plano } = await planejarDaEscola(session.schoolId, agora);

    const ids = [...new Set(plano.avaliadas.map((a) => a.responsavelId))];
    const pessoas = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, phone: true, _count: { select: { pushTokens: true } } },
    });
    const porId = new Map(pessoas.map((p) => [p.id, p]));
    const whatsapp = isWhatsAppConfigured();

    const familias = new Map<
      string,
      { id: string; nome: string; canal: "push" | "whatsapp" | "nenhum"; pendencias: unknown[] }
    >();
    for (const a of plano.avaliadas) {
      const pessoa = porId.get(a.responsavelId);
      const canal = pessoa?._count.pushTokens ? "push" : whatsapp && pessoa?.phone ? "whatsapp" : "nenhum";
      const familia = familias.get(a.responsavelId) ?? { id: a.responsavelId, nome: pessoa?.name ?? "Responsável", canal, pendencias: [] };
      familia.pendencias.push({
        tipo: a.tipo,
        aluno: a.aluno,
        descricao: a.descricao,
        diasPendente: a.diasPendente,
        envios: a.envios,
        ultimoEnvioEm: a.ultimoEnvioEm,
        situacao: a.situacao,
        proximoEm: a.proximoEm,
      });
      familias.set(a.responsavelId, familia);
    }

    const escola = await pendenciasDaEscola(session.schoolId, config.diasInicio, agora);

    return NextResponse.json({
      config,
      domingo: ehDomingo(agora),
      totalPendencias: plano.avaliadas.length,
      familiasNoProximoEnvio: plano.envios.length,
      familias: [...familias.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      escola,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = configLembretesSchema.parse(await request.json());
    const escola = await prisma.school.update({
      where: { id: session.schoolId },
      data: {
        lembretesAtivos: body.ativos,
        lembretesTipos: [...new Set(body.tipos)],
        lembretesDiasInicio: body.diasInicio,
        lembretesIntervaloDias: body.intervaloDias,
        lembretesMaxEnvios: body.maxEnvios,
      },
      select: { lembretesAtivos: true },
    });
    return NextResponse.json({ ok: true, ativos: escola.lembretesAtivos });
  } catch (error) {
    return handleApiError(error);
  }
}
