import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getClientIp } from "@/lib/solicitacoes-matricula";
import { ContratoErro, proximoStatus } from "@/lib/contratos";
import { carregarContratoComAcesso, sha256Hex } from "@/lib/contratos-server";
import { gerarContrato2027 } from "@/lib/contrato-modelo/gerar";
import { dadosFamiliaSchema } from "@/lib/contrato-modelo/validacao";
import { resolverResponsavelLegal, sugestaoDadosFamilia } from "@/lib/contrato-modelo/servidor";
import { calcularValores, MODELO_CONTRATO_2027, type CondicoesContrato, type DadosFamilia } from "@/lib/contrato-modelo/tipos";

async function carregar(id: string, session: Awaited<ReturnType<typeof requireRole>>) {
  const contrato = await carregarContratoComAcesso(id, session);
  if (!contrato || contrato.modelo !== MODELO_CONTRATO_2027 || !contrato.condicoes) return null;
  return { contrato, condicoes: contrato.condicoes as unknown as CondicoesContrato };
}

/** Resumo das condições + sugestão de preenchimento para o formulário da família. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/contratos/[id]/dados">) {
  try {
    const session = await requireRole("GUARDIAN");
    const { id } = await ctx.params;
    const achado = await carregar(id, session);
    if (!achado) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
    const { contrato, condicoes: c } = achado;
    const periodo = c.periodo ? c.config.periodos.find((p) => p.chave === c.periodo) : undefined;
    const aluno = await prisma.student.findUnique({ where: { id: contrato.studentId }, select: { name: true } });
    const temValores = c.parcelaBruta > 0;
    return NextResponse.json({
      resumo: {
        aluno: aluno?.name ?? "",
        turma: c.turma,
        etapa: c.etapa,
        periodo: periodo ? `${periodo.nome} (${periodo.horario})` : null,
        temValores,
        parcelas: c.config.parcelas.quantidade,
        vencimentoDia: c.config.parcelas.vencimentoDia,
        parcelaBruta: c.parcelaBruta,
        parcelaLiquida: c.parcelaLiquida,
        ...calcularValores({ parcelaBruta: c.parcelaBruta, parcelaLiquida: c.parcelaLiquida, quantidade: c.config.parcelas.quantidade }),
      },
      dados: await sugestaoDadosFamilia(session.sub, contrato.studentId, contrato.dadosFamilia),
      jaPreenchido: Boolean(contrato.dadosFamilia),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Opcional: a família preenche os dados no app e o app gera o contrato já preenchido. O
 * contrato em branco enviado pela escola continua valendo para quem preferir assinar direto.
 * Correções antes do envio do assinado geram um PDF novo; o anterior fica no histórico.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/contratos/[id]/dados">) {
  try {
    const session = await requireRole("GUARDIAN");
    const { id } = await ctx.params;
    const achado = await carregar(id, session);
    if (!achado) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
    const { contrato, condicoes } = achado;

    // Só antes de enviar o assinado. Não muda a situação: se estava devolvido, continua
    // devolvido (com o motivo) até a família reenviar.
    try {
      proximoStatus(contrato.status, "PREENCHER_DADOS");
    } catch (e) {
      if (e instanceof ContratoErro) return NextResponse.json({ error: e.message }, { status: 409 });
      throw e;
    }

    const lido = dadosFamiliaSchema.parse(await request.json()) as DadosFamilia;
    const familia: DadosFamilia = { ...lido, pedagogico: lido.pedagogicoMesmo ? null : lido.pedagogico, responsavelLegal: resolverResponsavelLegal(lido) };
    const aluno = await prisma.student.findUniqueOrThrow({ where: { id: contrato.studentId }, select: { name: true } });

    const agora = new Date();
    const pdf = await gerarContrato2027({ condicoes, familia, aluno: { nome: aluno.name }, data: agora });
    const sha256 = sha256Hex(pdf);
    const ipOrigem = getClientIp(request);
    const nomeArquivo = `Contrato ${condicoes.anoLetivo} - ${aluno.name} (preenchido).pdf`;

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.contrato.updateMany({
        where: { id, status: contrato.status },
        data: { dadosFamilia: JSON.parse(JSON.stringify(familia)) },
      });
      if (count === 0) throw new ContratoErro("Este contrato acabou de ser atualizado. Recarregue a página.");
      await tx.contratoArquivo.create({
        data: {
          contratoId: id,
          tipo: "MODELO",
          nomeArquivo,
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
          contratoId: id,
          tipo: "DADOS_PREENCHIDOS",
          usuarioId: session.sub,
          ipOrigem,
          arquivoSha256: sha256,
          detalhe: contrato.dadosFamilia ? "Dados corrigidos; contrato gerado novamente" : "Família preencheu os dados no app; contrato gerado preenchido",
          createdAt: agora,
        },
      });
    });

    return NextResponse.json({ ok: true, status: contrato.status, sha256 }, { status: 201 });
  } catch (error) {
    if (error instanceof ContratoErro) return NextResponse.json({ error: error.message }, { status: 409 });
    return handleApiError(error);
  }
}
