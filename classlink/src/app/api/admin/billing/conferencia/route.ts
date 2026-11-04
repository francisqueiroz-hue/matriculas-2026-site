import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { agoraNoFusoDaEscola, mesReferenciaAtual } from "@/lib/billing";
import { alertasBaixa, mesValido } from "@/lib/conferencia-baixas";

/** Limite de linhas por consulta: um ano inteiro de uma escola pequena cabe com folga. */
const MAX_LINHAS = 3000;

/**
 * Conferência dos boletos marcados como pagos num intervalo de competências (AAAA-MM):
 * valor do boleto, valor recebido, mensalidade do cadastro, data, quem deu a baixa e os
 * alertas de cada um. Só a direção (ADMIN), como o resto do Financeiro.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const hoje = agoraNoFusoDaEscola();
    const params = request.nextUrl.searchParams;
    const ano = hoje.getFullYear();
    const de = params.get("de") ?? `${ano}-01`;
    const ate = params.get("ate") ?? mesReferenciaAtual(hoje);
    if (!mesValido(de) || !mesValido(ate)) throw new ErroDeUsuario("Competência inválida (use AAAA-MM).", 400);
    if (de > ate) throw new ErroDeUsuario("A competência inicial é depois da final.", 400);

    const boletos = await prisma.boleto.findMany({
      where: { schoolId: session.schoolId, status: "PAGO", mesReferencia: { gte: de, lte: ate } },
      orderBy: [{ mesReferencia: "desc" }, { student: { name: "asc" } }],
      take: MAX_LINHAS + 1,
      include: {
        student: {
          select: {
            name: true,
            deletedAt: true,
            bolsista: true,
            mensalidadeValor: true,
            class: { select: { name: true } },
            guardians: { orderBy: { createdAt: "asc" }, take: 1, select: { guardian: { select: { name: true } } } },
          },
        },
        baixas: {
          orderBy: { criadoEm: "asc" },
          select: { acao: true, porNome: true, criadoEm: true, motivo: true },
        },
      },
    });

    const truncado = boletos.length > MAX_LINHAS;
    const itens = boletos.slice(0, MAX_LINHAS).map((b) => {
      const valor = Number(b.valor);
      const valorPago = b.valorPago === null ? null : Number(b.valorPago);
      const mensalidade = b.student.mensalidadeValor === null ? null : Number(b.student.mensalidadeValor);
      const pagas = b.baixas.filter((x) => x.acao === "PAGO");
      const ultimaBaixa = pagas[pagas.length - 1] ?? null;
      const correcoes = b.baixas.filter((x) => x.acao === "CORRIGIR");
      const ultimaCorrecao = correcoes[correcoes.length - 1] ?? null;
      return {
        id: b.id,
        aluno: b.student.name,
        turma: b.student.class.name,
        responsavel: b.student.guardians[0]?.guardian.name ?? null,
        mesReferencia: b.mesReferencia,
        vencimento: b.vencimento.toISOString(),
        valor,
        valorPago,
        mensalidadeCadastro: mensalidade,
        diferenca: valorPago === null ? 0 : Math.round((valorPago - valor) * 100) / 100,
        pagoEm: b.pagoEm ? b.pagoEm.toISOString() : null,
        // Confirmado pelo banco (boleto emitido no Inter): não se corrige nem desfaz aqui.
        manual: !b.codigoSolicitacao,
        baixaPor: ultimaBaixa?.porNome ?? (b.codigoSolicitacao ? "Banco Inter" : null),
        baixaEm: ultimaBaixa?.criadoEm.toISOString() ?? null,
        correcoes: correcoes.length,
        ultimaCorrecao: ultimaCorrecao
          ? { por: ultimaCorrecao.porNome, em: ultimaCorrecao.criadoEm.toISOString(), motivo: ultimaCorrecao.motivo }
          : null,
        alertas: alertasBaixa(
          {
            valor,
            valorPago,
            vencimento: b.vencimento,
            pagoEm: b.pagoEm,
            mensalidadeCadastro: mensalidade,
            bolsista: b.student.bolsista,
            alunoExcluido: !!b.student.deletedAt,
            baixasPago: pagas.length,
          },
          hoje,
        ),
      };
    });

    const totais = itens.reduce(
      (t, i) => {
        t.quantidade += 1;
        t.valorBoletos += i.valor;
        t.valorRecebido += i.valorPago ?? i.valor;
        if (i.alertas.length > 0) t.comAlerta += 1;
        if (i.valorPago === null) t.semValorInformado += 1;
        return t;
      },
      { quantidade: 0, valorBoletos: 0, valorRecebido: 0, comAlerta: 0, semValorInformado: 0 },
    );
    totais.valorBoletos = Math.round(totais.valorBoletos * 100) / 100;
    totais.valorRecebido = Math.round(totais.valorRecebido * 100) / 100;

    return NextResponse.json({ de, ate, itens, totais, truncado });
  } catch (error) {
    return handleApiError(error);
  }
}
