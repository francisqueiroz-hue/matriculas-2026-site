import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getClientIp } from "@/lib/solicitacoes-matricula";
import { notifyUsers } from "@/lib/push";
import { responsaveisDoAluno, sha256Hex } from "@/lib/contratos-server";
import { gerarContrato2027 } from "@/lib/contrato-modelo/gerar";
import {
  DIA_VENCIMENTO_MENSALIDADE,
  MODELO_CONTRATO_2027,
  comVencimentoFixo,
  diaDoMes,
  type CondicoesContrato,
  type DadosFamilia,
} from "@/lib/contrato-modelo/tipos";

// Um PDF por contrato (~0,3 s cada).
export const maxDuration = 60;

/**
 * Corrige o vencimento (sempre dia 05) nos contratos do modelo do app que a família ainda não
 * assinou: grava a condição corrigida, gera o PDF de novo (já preenchido, se a família tinha
 * preenchido os dados) e avisa a família. O PDF anterior fica no histórico.
 * Contratos com assinatura enviada (em conferência, devolvidos, completos) não são tocados:
 * o que foi assinado vale como foi assinado.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const pendentes = await prisma.contrato.findMany({
      where: {
        schoolId: session.schoolId,
        modelo: MODELO_CONTRATO_2027,
        status: "AGUARDANDO_ASSINATURA",
        arquivos: { none: { tipo: "ASSINADO" } },
        student: { deletedAt: null },
      },
      select: { id: true, studentId: true, condicoes: true, dadosFamilia: true, student: { select: { name: true } } },
    });
    const ipOrigem = getClientIp(request);
    const dia = diaDoMes(DIA_VENCIMENTO_MENSALIDADE);

    const corrigidos: { id: string; nome: string }[] = [];
    for (const c of pendentes) {
      const antes = c.condicoes as unknown as CondicoesContrato | null;
      if (!antes?.config?.parcelas) continue;
      const condicoes: CondicoesContrato = { ...antes, config: comVencimentoFixo(antes.config) };
      if (JSON.stringify(condicoes.config.parcelas) === JSON.stringify(antes.config.parcelas)) continue;

      const familia = (c.dadosFamilia as DadosFamilia | null) ?? null;
      const agora = new Date();
      const pdf = await gerarContrato2027({ condicoes, familia, aluno: { nome: c.student.name }, data: familia ? agora : null });
      const sha256 = sha256Hex(pdf);
      const atualizado = await prisma.$transaction(async (tx) => {
        // Só se ainda estiver aguardando assinatura (a família pode ter enviado nesse meio-tempo).
        const { count } = await tx.contrato.updateMany({
          where: { id: c.id, status: "AGUARDANDO_ASSINATURA" },
          data: { condicoes: JSON.parse(JSON.stringify(condicoes)) },
        });
        if (count === 0) return false;
        await tx.contratoArquivo.create({
          data: {
            contratoId: c.id,
            tipo: "MODELO",
            nomeArquivo: `Contrato ${condicoes.anoLetivo} - ${c.student.name}${familia ? " (preenchido)" : ""}.pdf`,
            mimeType: "application/pdf",
            tamanhoBytes: pdf.byteLength,
            sha256,
            conteudo: Uint8Array.from(pdf),
            enviadoPorId: session.sub,
            ipOrigem,
            createdAt: agora,
          },
        });
        await tx.contratoEvento.create({
          data: {
            contratoId: c.id,
            tipo: "CONDICOES_ATUALIZADAS",
            usuarioId: session.sub,
            ipOrigem,
            arquivoSha256: sha256,
            detalhe: `Vencimento corrigido: dia ${diaDoMes(antes.config.parcelas.vencimentoDia)} → dia ${dia} de cada mês`,
            createdAt: agora,
          },
        });
        return true;
      });
      if (!atualizado) continue;
      corrigidos.push({ id: c.id, nome: c.student.name });
      await notifyUsers(await responsaveisDoAluno(c.studentId), {
        title: "Contrato atualizado",
        body: `O contrato de ${c.student.name.split(" ")[0]} foi atualizado: as mensalidades vencem no dia ${dia} de cada mês. Assine a versão nova no app.`,
        url: "/dashboard/contratos",
      }).catch((err) => console.error("push notify failed", err));
    }

    return NextResponse.json({ corrigidos, total: corrigidos.length });
  } catch (error) {
    return handleApiError(error);
  }
}
