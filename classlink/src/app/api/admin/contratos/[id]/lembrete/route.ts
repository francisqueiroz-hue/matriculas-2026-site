import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDirecao } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { notifyUsers } from "@/lib/push";
import { exigirPodeConversar } from "@/lib/permissoes-mensagens";
import { aguardaFamilia, jaLembradoHoje, textoLembreteContrato } from "@/lib/lembrete-contrato";

const corpoSchema = z.object({ responsavelId: z.string().min(1) });

/**
 * A direção lembra o responsável, dentro do ClassLink, de assinar (ou reenviar) o contrato: grava
 * a mensagem na conversa da escola com a família (fica no histórico de Mensagens) e manda a
 * notificação do app. Conta como o lembrete do dia: o lembrete automático do contrato respeita o
 * intervalo a partir daqui, e um segundo clique no mesmo dia não manda de novo.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/contratos/[id]/lembrete">) {
  try {
    const session = await requireDirecao();
    const { id } = await ctx.params;
    const { responsavelId } = corpoSchema.parse(await request.json());

    const contrato = await prisma.contrato.findFirst({
      where: { id, schoolId: session.schoolId, student: { deletedAt: null } },
      select: {
        id: true,
        status: true,
        anoLetivo: true,
        updatedAt: true,
        student: {
          select: {
            name: true,
            guardians: {
              where: { guardianId: responsavelId, guardian: { active: true, deletedAt: null, role: "GUARDIAN" } },
              select: { guardian: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
    if (!aguardaFamilia(contrato.status)) {
      return NextResponse.json({ error: "Este contrato não está aguardando a família. Recarregue a página." }, { status: 409 });
    }
    const responsavel = contrato.student.guardians[0]?.guardian;
    if (!responsavel) return NextResponse.json({ error: "Responsável não encontrado neste aluno" }, { status: 404 });

    const agora = new Date();
    const chave = { tipo: "CONTRATO" as const, referenciaId: contrato.id, responsavelId: responsavel.id };
    const registro = await prisma.lembretePendencia.findUnique({
      where: { tipo_referenciaId_responsavelId: chave },
      select: { ultimoEnvioEm: true },
    });
    if (jaLembradoHoje(registro?.ultimoEnvioEm, agora)) {
      return NextResponse.json(
        { error: `${responsavel.name.split(" ")[0]} já recebeu o lembrete deste contrato hoje. Amanhã dá para lembrar de novo.` },
        { status: 409 },
      );
    }

    // Família ↔ direção: mesma regra das Mensagens.
    await exigirPodeConversar(session.sub, responsavel.id);
    const conversa = await prisma.conversation.upsert({
      where: { staffId_guardianId: { staffId: session.sub, guardianId: responsavel.id } },
      update: {},
      create: { staffId: session.sub, guardianId: responsavel.id },
      select: { id: true },
    });

    const texto = textoLembreteContrato(responsavel.name, contrato.student.name, contrato.anoLetivo, contrato.status);
    await prisma.message.create({ data: { conversationId: conversa.id, senderId: session.sub, body: texto, channel: "APP" } });

    // Marca o lembrete do dia (sem gastar um dos envios automáticos): o automático espera o intervalo.
    await prisma.lembretePendencia.upsert({
      where: { tipo_referenciaId_responsavelId: chave },
      update: { ultimoEnvioEm: agora, ultimoEnvioMensagemId: null },
      create: { schoolId: session.schoolId, ...chave, pendenteDesde: contrato.updatedAt, ultimoEnvioEm: agora },
    });

    after(async () => {
      await notifyUsers([responsavel.id], {
        title: contrato.status === "DEVOLVIDO" ? "Contrato voltou para correção" : "Contrato aguardando sua assinatura",
        body: texto.slice(0, 120),
        url: "/dashboard/contratos",
      }).catch((err) => console.error("lembrete de contrato: falha no push", err));
    });

    return NextResponse.json({ ok: true, conversaId: conversa.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
