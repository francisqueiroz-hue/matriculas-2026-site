import { prisma } from "@/lib/prisma";
import { escolaEhDemonstracao } from "@/lib/escola-demonstracao";
import { isBancoInterConfigured, emitirCobranca, consultarCobranca, seuNumeroDoBoleto, alunoLiberadoNoInter } from "@/lib/banco-inter";
import { origemPublica } from "@/lib/push";
import { avisarNovoBoleto } from "@/lib/boleto-aviso";
import { executarComLimite } from "@/lib/concorrencia";
import { destinosDosAlunos } from "@/lib/contratos-server";

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
 * registro em vez de duplicá-lo. Boletos que já existiam só com o valor (Inter ligado no meio
 * do mês, ou família que completou CPF/endereço depois) são emitidos por
 * `emitirPendentesNoInter`, pelo botão da direção em Financeiro.
 */
export async function gerarBoletosDoMes(
  escola: { id: string; diaVencimentoPadrao: number | null },
  mesReferencia: string,
  hoje: Date,
): Promise<ResultadoGeracaoBoletos> {
  const resultado: ResultadoGeracaoBoletos = { criados: 0, emitidos: 0, erros: 0, ignorados: 0 };
  // Escola de demonstração: nada de boleto gerado, aviso enviado ou chamada ao Banco Inter.
  if (await escolaEhDemonstracao(escola.id)) return resultado;
  const interConfigurado = isBancoInterConfigured();
  // Os avisos são rede lenta: ficam para depois do loop e saem em paralelo limitado.
  const avisos: Array<() => Promise<unknown>> = [];

  const alunos = await prisma.student.findMany({
    where: { schoolId: escola.id, deletedAt: null, bolsista: false, mensalidadeValor: { not: null } },
    include: {
      guardians: {
        orderBy: { createdAt: "asc" },
        include: { guardian: { select: { id: true, name: true, cpf: true, enderecoCobranca: true, active: true, phone: true, whatsappUltimaMensagemEm: true } } },
      },
    },
  });

  // Regra do responsável financeiro: o boleto (e o aviso) vai só para ele. Calculado só para
  // quem ainda não tem o boleto do mês.
  const jaGerados = (
    await prisma.boleto.findMany({
      where: { studentId: { in: alunos.map((a) => a.id) }, mesReferencia },
      select: { studentId: true },
    })
  ).map((b) => b.studentId);
  const comBoleto = new Set(jaGerados);
  const destinos = await destinosDosAlunos(alunos.filter((a) => !comBoleto.has(a.id)).map((a) => a.id));

  for (const aluno of alunos) {
    const jaExiste = await prisma.boleto.findUnique({
      where: { studentId_mesReferencia: { studentId: aluno.id, mesReferencia } },
    });
    if (jaExiste) {
      resultado.ignorados++;
      continue;
    }

    // Vencimento sempre no dia 05, para todos os alunos (decisão da direção, out/2026).
    const vencimento = calcularVencimento(DIA_VENCIMENTO_PADRAO, hoje);

    // Sem ninguém que conste como responsável financeiro (dois ou mais responsáveis, nenhum
    // indicado): o boleto é criado, mas sem destinatário e sem aviso; a tela Contratos pede a
    // indicação e, ao indicar, o boleto em aberto passa para ele.
    const destinatarioId = destinos.get(aluno.id)?.ids[0] ?? null;
    const boleto = await prisma.boleto.create({
      data: {
        studentId: aluno.id,
        schoolId: escola.id,
        mesReferencia,
        valor: aluno.mensalidadeValor!,
        vencimento,
        status: "PENDENTE",
        porResponsavelFinanceiro: true,
        destinatarioId,
      },
    });
    resultado.criados++;

    const responsavel = aluno.guardians.find((g) => g.guardianId === destinatarioId)?.guardian;

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

    if (!interConfigurado || !alunoLiberadoNoInter(aluno.id)) {
      avisar(); // valor já visível; emissão real fica para quando o Inter for configurado (ou o aluno entrar no piloto)
      continue;
    }

    if (!responsavel || !responsavel.active) {
      await prisma.boleto.update({
        where: { id: boleto.id },
        data: {
          status: "ERRO",
          erroDetalhe: destinatarioId
            ? "Aluno sem responsável financeiro ativo vinculado"
            : "Aluno com mais de um responsável: indique o responsável financeiro na tela Contratos",
        },
      });
      resultado.erros++;
      continue;
    }

    const emissao = await emitirBoletoNoInter(boleto, aluno.name, responsavel);
    if (emissao.ok) {
      avisar();
      resultado.emitidos++;
    } else {
      resultado.erros++;
    }
  }

  await executarComLimite(avisos, AVISOS_SIMULTANEOS);
  return resultado;
}

type EnderecoGuardado = { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string };

/** Marca que um boleto está sendo emitido agora: impede duas emissões do mesmo boleto no Inter. */
const MARCA_EMITINDO = "Emitindo no Banco Inter…";

/** Campos do endereço vazios ou com "null"/"undefined" escrito, que sairiam impressos no boleto. */
export function camposFaltandoNoEndereco(e: Partial<Record<"cep" | "logradouro" | "numero" | "bairro" | "cidade" | "uf", unknown>>): string[] {
  const invalido = (v: unknown) => typeof v !== "string" || v.trim() === "" || /^(null|undefined|nan)$/i.test(v.trim());
  return (["cep", "logradouro", "numero", "bairro", "cidade", "uf"] as const).filter((c) => invalido(e[c]));
}

/**
 * Emite no Inter um boleto que já existe no ClassLink (só valor e vencimento) e grava o
 * `codigoSolicitacao`. Em falha, o boleto fica em ERRO com o motivo; pode ser tentado de novo.
 * A emissão é assíncrona no Inter: linha digitável e Pix podem chegar só pelo webhook.
 */
export async function emitirBoletoNoInter(
  boleto: { id: string; mesReferencia: string; valor: unknown; vencimento: Date },
  alunoNome: string,
  responsavel: { name: string; cpf: string | null; enderecoCobranca: unknown },
): Promise<{ ok: boolean; erro?: string }> {
  const endereco = responsavel.enderecoCobranca as EnderecoGuardado | null;
  const faltando = endereco ? camposFaltandoNoEndereco(endereco) : [];
  if (!responsavel.cpf || !endereco || faltando.length > 0) {
    const erro =
      faltando.length > 0 && responsavel.cpf && endereco
        ? `Endereço de cobrança incompleto (${faltando.join(", ")}). A família deve corrigir em Faturas › Editar dados de cobrança.`
        : "Responsável financeiro sem CPF/endereço de cobrança cadastrado";
    await prisma.boleto.update({ where: { id: boleto.id }, data: { status: "ERRO", erroDetalhe: erro } });
    return { ok: false, erro };
  }

  // Reserva o boleto: só segue quem conseguir marcar um boleto ainda sem emissão.
  const { count } = await prisma.boleto.updateMany({
    where: {
      id: boleto.id,
      codigoSolicitacao: null,
      status: { in: ["PENDENTE", "ERRO"] },
      // Marca de mais de 5 minutos é de uma tentativa interrompida no meio: pode tentar de novo.
      OR: [{ erroDetalhe: null }, { erroDetalhe: { not: MARCA_EMITINDO } }, { updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }],
    },
    data: { erroDetalhe: MARCA_EMITINDO },
  });
  if (count === 0) return { ok: false, erro: "Boleto já emitido ou em emissão" };

  try {
    const emissao = await emitirCobranca({
      seuNumero: seuNumeroDoBoleto(boleto.id, boleto.mesReferencia),
      valorNominal: Number(boleto.valor),
      dataVencimento: formatarDataISO(boleto.vencimento),
      pagador: { cpfCnpj: responsavel.cpf, nome: responsavel.name, endereco },
      mensagem: `Mensalidade ${boleto.mesReferencia} - ${alunoNome}`,
    });

    // Grava o código antes de qualquer outra coisa: é ele que liga o webhook a este boleto.
    await prisma.boleto.update({
      where: { id: boleto.id },
      data: { codigoSolicitacao: emissao.codigoSolicitacao, status: "PENDENTE", erroDetalhe: null },
    });

    try {
      const detalhes = await consultarCobranca(emissao.codigoSolicitacao);
      await prisma.boleto.update({
        where: { id: boleto.id },
        data: {
          nossoNumero: detalhes.nossoNumero,
          linhaDigitavel: detalhes.linhaDigitavel,
          pixCopiaCola: detalhes.pixCopiaECola,
        },
      });
    } catch {
      // Ainda em processamento no Inter: os dados chegam pelo webhook ou pela próxima consulta.
    }
    return { ok: true };
  } catch (err) {
    const erro = err instanceof Error ? err.message : "Falha desconhecida na emissão";
    await prisma.boleto.update({ where: { id: boleto.id }, data: { status: "ERRO", erroDetalhe: erro } });
    return { ok: false, erro };
  }
}

export interface ResultadoEmissaoPendentes {
  emitidos: number;
  erros: number;
  /** Vencimento já passou: o Inter não aceita emitir com vencimento no passado. */
  vencidos: number;
}

/**
 * Emite no Inter os boletos em aberto (PENDENTE ou ERRO, sem emissão) desta escola com
 * vencimento de hoje em diante. Serve para quando o Inter é ligado com o mês já gerado, e
 * para tentar de novo depois que a família completa CPF e endereço.
 */
export async function emitirPendentesNoInter(schoolId: string, hoje: Date): Promise<ResultadoEmissaoPendentes> {
  const resultado: ResultadoEmissaoPendentes = { emitidos: 0, erros: 0, vencidos: 0 };
  if (await escolaEhDemonstracao(schoolId)) return resultado;
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const boletos = await prisma.boleto.findMany({
    where: { schoolId, codigoSolicitacao: null, status: { in: ["PENDENTE", "ERRO"] }, student: { deletedAt: null } },
    include: { student: { select: { name: true } } },
    orderBy: { vencimento: "asc" },
  });
  if (boletos.length === 0) return resultado;

  const destinos = await destinosDosAlunos([...new Set(boletos.map((b) => b.studentId))]);
  const vinculos = await prisma.guardianStudent.findMany({
    where: { studentId: { in: boletos.map((b) => b.studentId) } },
    orderBy: { createdAt: "asc" },
    include: { guardian: { select: { id: true, name: true, cpf: true, enderecoCobranca: true, active: true } } },
  });

  for (const boleto of boletos) {
    if (!alunoLiberadoNoInter(boleto.studentId)) continue;
    if (boleto.vencimento < inicioHoje) {
      resultado.vencidos++;
      continue;
    }
    // Regra nova: o destinatário gravado (ou o financeiro atual, se ainda não gravado); boleto
    // anterior à regra: o primeiro responsável vinculado, como era.
    const destinatarioId = boleto.porResponsavelFinanceiro
      ? (boleto.destinatarioId ?? destinos.get(boleto.studentId)?.ids[0] ?? null)
      : (vinculos.find((v) => v.studentId === boleto.studentId)?.guardianId ?? null);
    const responsavel = vinculos.find((v) => v.studentId === boleto.studentId && v.guardianId === destinatarioId)?.guardian;
    if (!responsavel || !responsavel.active) {
      await prisma.boleto.update({
        where: { id: boleto.id },
        data: {
          status: "ERRO",
          erroDetalhe: destinatarioId
            ? "Aluno sem responsável financeiro ativo vinculado"
            : "Aluno com mais de um responsável: indique o responsável financeiro na tela Contratos",
        },
      });
      resultado.erros++;
      continue;
    }
    const r = await emitirBoletoNoInter(boleto, boleto.student.name, responsavel);
    if (r.ok) resultado.emitidos++;
    else resultado.erros++;
  }
  return resultado;
}
