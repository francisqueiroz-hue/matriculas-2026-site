import { prisma } from "@/lib/prisma";
import { isBancoInterConfigured, emitirCobranca, consultarCobranca } from "@/lib/banco-inter";
import { notifyUsers } from "@/lib/push";
import { DIA_VENCIMENTO_PADRAO, calcularVencimento, formatarDataISO } from "@/lib/billing";

export interface ResultadoGeracaoBoletos {
  /** Registros de valor (valor + vencimento) criados agora, com ou sem emissão real. */
  criados: number;
  /** Desses criados, quantos também foram emitidos de verdade no Banco Inter (boleto/PIX pagável). */
  emitidos: number;
  erros: number;
  /** Alunos que já tinham um boleto para este mês de referência. */
  ignorados: number;
}

/**
 * Garante que exista um registro de boleto — com valor e vencimento já visíveis ao
 * responsável em "Financeiro" — para cada aluno com mensalidade configurada nesta escola,
 * no mês de referência informado.
 *
 * O valor é sempre criado primeiro, mesmo sem o Banco Inter configurado: mostrar quanto e
 * quando vencer não depende de emissão real. A emissão de verdade (boleto/PIX pagável) é
 * uma etapa separada, tentada só quando o Inter está configurado, e atualiza o mesmo
 * registro em vez de duplicá-lo — então "ligar" o Inter depois não recria nada, só
 * completa os boletos do mês corrente que ainda estavam só com o valor.
 */
export async function gerarBoletosDoMes(
  escola: { id: string; diaVencimentoPadrao: number | null },
  mesReferencia: string,
  hoje: Date,
): Promise<ResultadoGeracaoBoletos> {
  const resultado: ResultadoGeracaoBoletos = { criados: 0, emitidos: 0, erros: 0, ignorados: 0 };
  const interConfigurado = isBancoInterConfigured();

  const alunos = await prisma.student.findMany({
    where: { schoolId: escola.id, deletedAt: null, mensalidadeValor: { not: null } },
    include: {
      guardians: {
        orderBy: { createdAt: "asc" },
        take: 1,
        include: { guardian: { select: { id: true, name: true, cpf: true, enderecoCobranca: true, active: true } } },
      },
    },
  });

  for (const aluno of alunos) {
    const jaExiste = await prisma.boleto.findUnique({
      where: { studentId_mesReferencia: { studentId: aluno.id, mesReferencia } },
    });
    if (jaExiste) {
      resultado.ignorados++;
      continue;
    }

    const diaVencimento = aluno.diaVencimento ?? escola.diaVencimentoPadrao ?? DIA_VENCIMENTO_PADRAO;
    const vencimento = calcularVencimento(diaVencimento, hoje);

    const boleto = await prisma.boleto.create({
      data: {
        studentId: aluno.id,
        schoolId: escola.id,
        mesReferencia,
        valor: aluno.mensalidadeValor!,
        vencimento,
        status: "PENDENTE",
      },
    });
    resultado.criados++;

    if (!interConfigurado) continue; // valor já visível; emissão real fica para quando o Inter for configurado

    const responsavel = aluno.guardians[0]?.guardian;
    if (!responsavel || !responsavel.active) {
      await prisma.boleto.update({
        where: { id: boleto.id },
        data: { status: "ERRO", erroDetalhe: "Aluno sem responsável financeiro ativo vinculado" },
      });
      resultado.erros++;
      continue;
    }

    const endereco = responsavel.enderecoCobranca as
      | { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string }
      | null;

    if (!responsavel.cpf || !endereco) {
      await prisma.boleto.update({
        where: { id: boleto.id },
        data: { status: "ERRO", erroDetalhe: "Responsável financeiro sem CPF/endereço de cobrança cadastrado" },
      });
      resultado.erros++;
      continue;
    }

    try {
      const emissao = await emitirCobranca({
        seuNumero: `${aluno.id}-${mesReferencia}`,
        valorNominal: Number(aluno.mensalidadeValor),
        dataVencimento: formatarDataISO(vencimento),
        pagador: { cpfCnpj: responsavel.cpf, nome: responsavel.name, endereco },
        mensagem: `Mensalidade ${mesReferencia} — ${aluno.name}`,
      });

      let detalhes: Awaited<ReturnType<typeof consultarCobranca>> | null = null;
      try {
        detalhes = await consultarCobranca(emissao.codigoSolicitacao);
      } catch {
        // detalhes ficam disponíveis via webhook/consulta posterior; emissão em si já foi confirmada
      }

      await prisma.boleto.update({
        where: { id: boleto.id },
        data: {
          codigoSolicitacao: emissao.codigoSolicitacao,
          nossoNumero: detalhes?.nossoNumero,
          linhaDigitavel: detalhes?.linhaDigitavel,
          pixCopiaCola: detalhes?.pixCopiaECola,
        },
      });

      void notifyUsers([responsavel.id], {
        title: "Novo boleto disponível",
        body: `Mensalidade de ${aluno.name} — vencimento em ${vencimento.toLocaleDateString("pt-BR")}`,
        url: "/dashboard/financeiro",
      }).catch((err) => console.error("push notify failed", err));

      resultado.emitidos++;
    } catch (err) {
      await prisma.boleto.update({
        where: { id: boleto.id },
        data: { status: "ERRO", erroDetalhe: err instanceof Error ? err.message : "Falha desconhecida na emissão" },
      });
      resultado.erros++;
    }
  }

  return resultado;
}
