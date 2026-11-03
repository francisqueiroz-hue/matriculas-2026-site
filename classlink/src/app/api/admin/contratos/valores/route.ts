import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getClientIp } from "@/lib/solicitacoes-matricula";
import { notifyUsers } from "@/lib/push";
import { responsaveisDoAluno, sha256Hex } from "@/lib/contratos-server";
import { gerarContrato2027 } from "@/lib/contrato-modelo/gerar";
import { CRITERIO_RENOVACAO_2027, ROTULO_SITUACAO, conferirValor, precisaAtualizar } from "@/lib/contrato-modelo/conferencia";
import {
  MODELO_CONTRATO_2027,
  comVencimentoFixo,
  formatarDinheiro,
  valoresComReajuste,
  type CondicoesContrato,
  type DadosFamilia,
} from "@/lib/contrato-modelo/tipos";

// Um PDF por contrato (~0,3 s cada).
export const maxDuration = 60;

const ANO = 2027;

async function contratosDoAno(schoolId: string) {
  return prisma.contrato.findMany({
    where: { schoolId, anoLetivo: ANO, modelo: MODELO_CONTRATO_2027, student: { deletedAt: null } },
    select: {
      id: true,
      status: true,
      createdAt: true,
      condicoes: true,
      dadosFamilia: true,
      studentId: true,
      student: { select: { name: true, mensalidadeValor: true, bolsista: true, class: { select: { name: true } } } },
      arquivos: { where: { tipo: "ASSINADO" }, select: { id: true }, take: 1 },
    },
    orderBy: [{ student: { name: "asc" } }],
  });
}

type Contrato = Awaited<ReturnType<typeof contratosDoAno>>[number];

function conferir(c: Contrato) {
  const conf = conferirValor(c.condicoes, {
    mensalidade: c.student.mensalidadeValor === null ? null : Number(c.student.mensalidadeValor),
    bolsista: c.student.bolsista,
  });
  const assinado = c.arquivos.length > 0 || c.status !== "AGUARDANDO_ASSINATURA";
  return { conf, assinado };
}

/**
 * Conferência dos contratos 2027 já enviados: para cada aluno, o valor que saiu no contrato,
 * o valor corrigido esperado (mensalidade cadastrada + 9,2%) e se a família já assinou.
 * Só leitura.
 */
export async function GET() {
  try {
    const session = await requireRole("ADMIN");
    const contratos = await contratosDoAno(session.schoolId);
    const linhas = contratos.map((c) => {
      const { conf, assinado } = conferir(c);
      return {
        id: c.id,
        aluno: c.student.name,
        turma: c.student.class.name,
        enviadoEm: c.createdAt,
        status: c.status,
        assinado,
        dadosPreenchidos: c.dadosFamilia !== null,
        ...conf,
        rotulo: ROTULO_SITUACAO[conf.situacao],
        atualizavel: !assinado && precisaAtualizar(conf.situacao),
      };
    });
    return NextResponse.json({ linhas });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Atualiza para o valor corrigido os contratos que saíram sem ele (em branco ou com outro valor)
 * e que a família ainda não assinou: grava as condições novas, gera o PDF de novo (preenchido,
 * se a família já tinha preenchido os dados) e avisa a família. O PDF anterior fica no histórico.
 * Contratos assinados não mudam: o que foi assinado vale como foi assinado.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const contratos = await contratosDoAno(session.schoolId);
    const ipOrigem = getClientIp(request);
    const atualizados: { id: string; nome: string }[] = [];

    for (const c of contratos) {
      const { conf, assinado } = conferir(c);
      if (assinado || !precisaAtualizar(conf.situacao)) continue;
      const antes = c.condicoes as unknown as CondicoesContrato | null;
      if (!antes?.config?.parcelas) continue;

      const bolsista = c.student.bolsista;
      const valorAnterior = Number(c.student.mensalidadeValor ?? 0);
      const corrigido = bolsista ? null : valoresComReajuste(valorAnterior, CRITERIO_RENOVACAO_2027);
      if (!bolsista && !corrigido) continue;
      const condicoes: CondicoesContrato = {
        ...antes,
        config: comVencimentoFixo(antes.config),
        parcelaBruta: corrigido?.parcelaBruta ?? 0,
        parcelaLiquida: corrigido?.parcelaLiquida ?? 0,
        reajuste: corrigido ? { valorAnterior, percentual: CRITERIO_RENOVACAO_2027.percentual, base: "BRUTA" } : null,
        bolsista,
      };

      const familia = (c.dadosFamilia as DadosFamilia | null) ?? null;
      const agora = new Date();
      const pdf = await gerarContrato2027({ condicoes, familia, aluno: { nome: c.student.name }, data: familia ? agora : null });
      const sha256 = sha256Hex(pdf);
      const antesTexto = conf.valorContrato > 0 ? `R$ ${formatarDinheiro(conf.valorContrato)}` : "em branco";
      const depoisTexto = bolsista ? "isento (bolsista)" : `R$ ${formatarDinheiro(condicoes.parcelaBruta)}`;
      const ok = await prisma.$transaction(async (tx) => {
        // Só se ainda estiver aguardando assinatura (a família pode ter enviado nesse meio-tempo).
        const { count } = await tx.contrato.updateMany({
          where: { id: c.id, status: "AGUARDANDO_ASSINATURA", arquivos: { none: { tipo: "ASSINADO" } } },
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
            detalhe: `Valor da parcela atualizado: ${antesTexto} → ${depoisTexto}`,
            createdAt: agora,
          },
        });
        return true;
      });
      if (!ok) continue;
      atualizados.push({ id: c.id, nome: c.student.name });
      await notifyUsers(await responsaveisDoAluno(c.studentId), {
        title: "Contrato 2027 atualizado",
        body: `O contrato de ${c.student.name.split(" ")[0]} foi atualizado com os valores de 2027. Confira e assine a versão nova no app.`,
        url: "/dashboard/contratos",
      }).catch((err) => console.error("push notify failed", err));
    }

    return NextResponse.json({ atualizados, total: atualizados.length });
  } catch (error) {
    return handleApiError(error);
  }
}
