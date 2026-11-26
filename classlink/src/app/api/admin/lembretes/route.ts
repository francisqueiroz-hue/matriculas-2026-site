import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDirecao } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { configLembretesSchema } from "@/lib/validators";
import { planejarDaEscola, pendenciasDaEscola } from "@/lib/lembretes-server";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { ehDomingo } from "@/lib/lembretes";
import { resumoFalhasRecentes } from "@/lib/whatsapp-falhas";
import { situacaoEntrega } from "@/lib/lembrete-entrega";
import { ultimoEnvioPorFamilia } from "@/lib/lembretes";
import {
  avaliarAvisoTurmas,
  LIMITE_TEXTO_AVISO_TURMAS,
  LIMITE_TITULO_AVISO_TURMAS,
  TEXTO_PADRAO_AVISO_TURMAS,
  TITULO_PADRAO_AVISO_TURMAS,
} from "@/lib/aviso-turmas";
import { ANO_AVISO_TURMAS, carregarAvisoTurmas, responsaveisJaAvisados, ultimosAvisosTurmas } from "@/lib/aviso-turmas-server";

/**
 * Resumo para a direção: configuração, pendências das famílias (com quantos lembretes já
 * saíram e quando sai o próximo) e o que depende da própria escola. Só leitura: a prévia
 * nunca envia nada.
 */
export async function GET() {
  try {
    const session = await requireDirecao();
    const agora = new Date();
    const { config, registros: registrosPlano, plano } = await planejarDaEscola(session.schoolId, agora);

    const ids = [...new Set(plano.avaliadas.map((a) => a.responsavelId))];
    const pessoas = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, phone: true, _count: { select: { pushTokens: true } } },
    });
    const porId = new Map(pessoas.map((p) => [p.id, p]));
    // Situação de entrega do último lembrete pelo WhatsApp (gravada pelo webhook da Meta).
    const registros = await prisma.lembretePendencia.findMany({
      where: { schoolId: session.schoolId, resolvidoEm: null, ultimoEnvioStatus: { not: null } },
      select: { tipo: true, referenciaId: true, responsavelId: true, ultimoEnvioStatus: true, ultimoEnvioStatusEm: true, ultimoEnvioFalha: true },
    });
    const chave = (r: { tipo: string; referenciaId: string; responsavelId: string }) => `${r.tipo}|${r.referenciaId}|${r.responsavelId}`;
    const entregaPor = new Map(registros.map((r) => [chave(r), r]));
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
        entrega: situacaoEntrega(entregaPor.get(chave(a)), agora),
      });
      familias.set(a.responsavelId, familia);
    }

    const [escola, entregas, aviso, jaAvisados, ultimosAvisos] = await Promise.all([
      pendenciasDaEscola(session.schoolId, config.diasInicio, agora),
      resumoFalhasRecentes(session.schoolId, agora),
      carregarAvisoTurmas(session.schoolId),
      responsaveisJaAvisados(session.schoolId),
      ultimosAvisosTurmas(session.schoolId, ids),
    ]);
    // Aviso único de definição das turmas: quem chegou ao limite de lembretes de matrícula.
    const avisoFamilias = avaliarAvisoTurmas(
      plano.avaliadas,
      ultimoEnvioPorFamilia(registrosPlano),
      jaAvisados,
      new Set(plano.envios.map((e) => e.responsavelId)),
      config,
      agora,
    ).map((f) => ({ ...f, nome: porId.get(f.responsavelId)?.name ?? "Responsável" }));

    return NextResponse.json({
      config,
      domingo: ehDomingo(agora),
      totalPendencias: plano.avaliadas.length,
      familiasNoProximoEnvio: plano.envios.length,
      familias: [...familias.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      escola,
      entregas,
      avisoTurmas: {
        ativo: aviso.ativo,
        titulo: aviso.salvo.titulo,
        texto: aviso.salvo.texto,
        padrao: { titulo: TITULO_PADRAO_AVISO_TURMAS, texto: TEXTO_PADRAO_AVISO_TURMAS },
        limites: { titulo: LIMITE_TITULO_AVISO_TURMAS, texto: LIMITE_TEXTO_AVISO_TURMAS },
        ano: ANO_AVISO_TURMAS,
        familias: avisoFamilias.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        // Último aviso de cada família listada (automático ou manual), para mostrar na tela.
        ultimos: Object.fromEntries(ultimosAvisos),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireDirecao();
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
