import { prisma } from "@/lib/prisma";
import { isBancoInterConfigured, emitirCobranca, consultarCobranca } from "@/lib/banco-inter";
import { origemPublica } from "@/lib/push";
import { avisarNovoBoleto } from "@/lib/boleto-aviso";
import { executarComLimite } from "@/lib/concorrencia";

/** Avisos (push + WhatsApp) simultâneos: acelera o lote sem estourar limites dos provedores. */
const AVISOS_SIMULTANEOS = 5;
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
  // Os avisos são rede lenta: ficam para depois do loop e saem em paralelo limitado.
  const avisos: Array<() => Promise<unknown>> = [];

  const alunos = await prisma.student.findMany({
    where: { schoolId: escola.id, deletedAt: null, bolsista: false, mensalidadeValor: { not: null } },
    include: {
      guardians: {
        orderBy: { createdAt: "asc" },
        take: 1,
        include: { guardian: { select: { id: true, name: true, cpf: true, enderecoCobranca: true, active: true, phone: true, whatsappUltimaMensagemEm: true } } },
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

    const responsavel = aluno.guardians[0]?.guardian;

    // O responsável é avisado quando o boleto é gerado pelo ClassLink (a cobrança hoje é manual,
    // sem automação do banco); o aviso não depende da emissão real no Inter.
    const avisar = () => {
      if (!responsavel?.active) return;
      const dados = {
        responsavel,
        alunoNome: aluno.name,
        valor: Number(aluno.mensalidadeValor),
        vencimento,
        origem: origemPublica(),
      };
      avisos.push(() => avisarNovoBoleto(dados));
    };

    if (!interConfigurado) {
      avisar(); // valor já visível; emissão real fica para quando o Inter for configurado
      continue;
    }

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

      avisar();

      resultado.emitidos++;
    } catch (err) {
      await prisma.boleto.update({
        where: { id: boleto.id },
        data: { status: "ERRO", erroDetalhe: err instanceof Error ? err.message : "Falha desconhecida na emissão" },
      });
      resultado.erros++;
    }
  }

  await executarComLimite(avisos, AVISOS_SIMULTANEOS);
  return resultado;
}
