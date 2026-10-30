import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getClientIp } from "@/lib/solicitacoes-matricula";
import { notifyUsers } from "@/lib/push";
import { responsaveisDoAluno, sha256Hex } from "@/lib/contratos-server";
import { carregarConfig } from "@/lib/contrato-modelo/servidor";
import { gerarContrato2027 } from "@/lib/contrato-modelo/gerar";
import { envioLoteSchema } from "@/lib/contrato-modelo/validacao";
import {
  MODELO_CONTRATO_2027,
  formatarDinheiro,
  percentualEfetivo,
  valoresComReajuste,
  type CondicoesContrato,
  type ReajusteContrato,
} from "@/lib/contrato-modelo/tipos";

// Um PDF por aluno (~0,3 s cada): folga para a turma inteira de uma vez.
export const maxDuration = 60;

/**
 * Envia o contrato guardado no app para vários alunos de uma vez, já pronto para assinar.
 * O PDF sai com o nome e a turma do aluno; o resto (dados da família, e os valores se a
 * escola não os configurou) fica em branco para preencher à mão. Se quiser, a família
 * preenche os dados no app e recebe o contrato já preenchido.
 * Cada contrato guarda uma cópia das condições do momento do envio.
 * Na renovação, o valor de cada contrato pode sair da mensalidade atual do aluno corrigida
 * pelo critério que a direção informou (calculado aqui, com o valor do banco).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = envioLoteSchema.parse(await request.json());
    if (body.anoLetivo !== 2027) {
      return NextResponse.json({ error: "O modelo de contrato guardado no app é o de 2027." }, { status: 400 });
    }

    const { config } = await carregarConfig(session.schoolId, body.anoLetivo);
    const ids = [...new Set(body.itens.map((i) => i.studentId))];
    const [alunos, existentes] = await Promise.all([
      prisma.student.findMany({
        where: { id: { in: ids }, schoolId: session.schoolId, deletedAt: null },
        select: { id: true, name: true, mensalidadeValor: true, bolsista: true, class: { select: { name: true } } },
      }),
      prisma.contrato.findMany({
        where: { schoolId: session.schoolId, anoLetivo: body.anoLetivo, modelo: MODELO_CONTRATO_2027, studentId: { in: ids } },
        select: { studentId: true },
      }),
    ]);
    const porId = new Map(alunos.map((a) => [a.id, a]));
    const jaTem = new Set(existentes.map((e) => e.studentId));
    const ipOrigem = getClientIp(request);

    const criados: { id: string; studentId: string; nome: string }[] = [];
    const ignorados: { studentId: string; nome: string; motivo: string }[] = [];

    for (const item of body.itens) {
      const aluno = porId.get(item.studentId);
      if (!aluno) {
        ignorados.push({ studentId: item.studentId, nome: "—", motivo: "Aluno não encontrado" });
        continue;
      }
      if (jaTem.has(aluno.id)) {
        ignorados.push({ studentId: aluno.id, nome: aluno.name, motivo: `Já tem contrato ${body.anoLetivo} do modelo do app` });
        continue;
      }
      // Renovação com correção exige a mensalidade no cadastro (ou a isenção de bolsista):
      // nada de valor da tabela no lugar.
      if (body.reajuste && !aluno.bolsista && !(Number(aluno.mensalidadeValor ?? 0) > 0)) {
        ignorados.push({ studentId: aluno.id, nome: aluno.name, motivo: "Mensalidade não cadastrada — preencha no cadastro do aluno antes de enviar" });
        continue;
      }
      // Ordem: ajuste individual > mensalidade atual corrigida > tabela do período. Valores só
      // entram se fizerem sentido; senão saem em branco para preencher à mão.
      const periodo = item.periodo ? config.periodos.find((p) => p.chave === item.periodo) : undefined;
      const valorAnterior = aluno.mensalidadeValor ? Number(aluno.mensalidadeValor) : 0;
      const corrigido = body.reajuste ? valoresComReajuste(valorAnterior, body.reajuste) : null;
      const parcelaBruta = item.parcelaBruta ?? corrigido?.parcelaBruta ?? periodo?.parcelaBruta ?? 0;
      const parcelaLiquida = item.parcelaLiquida ?? corrigido?.parcelaLiquida ?? periodo?.parcelaLiquida ?? 0;
      // Bolsista: contrato sem parcelas, com a isenção escrita no quadro de valores.
      const valoresOk = !aluno.bolsista && parcelaBruta > 0 && parcelaLiquida > 0 && parcelaLiquida <= parcelaBruta;
      const reajuste: ReajusteContrato | null =
        valoresOk && body.reajuste && valorAnterior > 0 && (corrigido || item.parcelaBruta !== undefined)
          ? {
              valorAnterior,
              base: body.reajuste.base,
              percentual: percentualEfetivo(valorAnterior, body.reajuste.base === "LIQUIDA" ? parcelaLiquida : parcelaBruta),
            }
          : null;
      const condicoes: CondicoesContrato = {
        modelo: MODELO_CONTRATO_2027,
        anoLetivo: body.anoLetivo,
        etapa: item.etapa,
        turma: aluno.class.name,
        periodo: item.periodo ?? null,
        parcelaBruta: valoresOk ? parcelaBruta : 0,
        parcelaLiquida: valoresOk ? parcelaLiquida : 0,
        config,
        reajuste,
        bolsista: aluno.bolsista,
      };
      const pdf = await gerarContrato2027({ condicoes, familia: null, aluno: { nome: aluno.name }, data: null });
      const sha256 = sha256Hex(pdf);
      const contrato = await prisma.$transaction(async (tx) => {
        const c = await tx.contrato.create({
          data: {
            schoolId: session.schoolId,
            studentId: aluno.id,
            anoLetivo: body.anoLetivo,
            titulo: body.titulo,
            status: "AGUARDANDO_ASSINATURA",
            modelo: MODELO_CONTRATO_2027,
            condicoes: JSON.parse(JSON.stringify(condicoes)),
            criadoPorId: session.sub,
          },
          select: { id: true },
        });
        await tx.contratoArquivo.create({
          data: {
            contratoId: c.id,
            tipo: "MODELO",
            nomeArquivo: `Contrato ${body.anoLetivo} - ${aluno.name}.pdf`,
            mimeType: "application/pdf",
            tamanhoBytes: pdf.byteLength,
            sha256,
            conteudo: Uint8Array.from(pdf),
            enviadoPorId: session.sub,
            ipOrigem,
          },
        });
        await tx.contratoEvento.create({
          data: {
            contratoId: c.id,
            tipo: "CRIADO",
            usuarioId: session.sub,
            ipOrigem,
            arquivoSha256: sha256,
            detalhe: [
              "Modelo do app",
              periodo?.nome,
              aluno.bolsista && "Bolsista (isento de mensalidade)",
              reajuste &&
                `Renovação: R$ ${formatarDinheiro(reajuste.valorAnterior)} → R$ ${formatarDinheiro(reajuste.base === "LIQUIDA" ? parcelaLiquida : parcelaBruta)} (${reajuste.percentual.toLocaleString("pt-BR")}%)`,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        });
        return c;
      });
      jaTem.add(aluno.id);
      criados.push({ id: contrato.id, studentId: aluno.id, nome: aluno.name });
      await notifyUsers(await responsaveisDoAluno(aluno.id), {
        title: "Contrato de matrícula 2027",
        body: `O contrato de ${aluno.name.split(" ")[0]} está no app para assinar — grátis pelo gov.br ou à mão.`,
        url: "/dashboard/contratos",
      }).catch((err) => console.error("push notify failed", err));
    }

    return NextResponse.json({ criados, ignorados }, { status: criados.length > 0 ? 201 : 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
