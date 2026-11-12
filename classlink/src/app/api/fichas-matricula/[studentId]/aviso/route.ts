import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { notifyUsers } from "@/lib/push";
import { alunoDaEscola, etapasDoContrato, exigirEquipe } from "@/lib/ficha-matricula-acesso";
import { anoLetivoSchema, documentosFaltantes, etapaDaFicha, mensagemDocumentosFaltantes } from "@/lib/ficha-matricula";

const corpoSchema = z.object({ anoLetivo: anoLetivoSchema, enviar: z.boolean().optional() });

/**
 * Aviso à família dos documentos que faltam. Sem `enviar`, só devolve o texto (prévia e cópia
 * para o WhatsApp). Com `enviar: true`, manda a notificação no app para os responsáveis do aluno.
 * Sempre disparado pela equipe, aluno a aluno: nada sai automaticamente.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/fichas-matricula/[studentId]/aviso">) {
  try {
    const session = await exigirEquipe();
    const { studentId } = await ctx.params;
    const { anoLetivo, enviar } = corpoSchema.parse(await request.json());

    const aluno = await alunoDaEscola(studentId, session.schoolId);
    if (!aluno) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    const etapa = etapaDaFicha(aluno.class?.name, (await etapasDoContrato(session.schoolId, anoLetivo, [studentId])).get(studentId));
    const registros = await prisma.matriculaDocumento.findMany({
      where: { studentId, anoLetivo },
      select: { tipo: true, recebido: true },
    });
    const faltantes = documentosFaltantes(registros, etapa);
    if (faltantes.length === 0) {
      return NextResponse.json({ error: "Todos os documentos exigidos já foram entregues." }, { status: 400 });
    }
    const mensagem = mensagemDocumentosFaltantes(aluno.name, anoLetivo, faltantes);
    const responsaveis = aluno.guardians.map((g) => g.guardian.id);

    if (!enviar) return NextResponse.json({ mensagem, responsaveis: responsaveis.length });

    const resultado = await notifyUsers(responsaveis, { title: mensagem.titulo, body: mensagem.texto, url: "/dashboard" });
    const comApp = await prisma.pushToken.findMany({
      where: { userId: { in: responsaveis } },
      distinct: ["userId"],
      select: { userId: true },
    });
    return NextResponse.json({ mensagem, responsaveis: responsaveis.length, responsaveisComApp: comApp.length, enviados: resultado.enviados });
  } catch (error) {
    return handleApiError(error);
  }
}
