import type { BoletoStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { consultarCobranca, isBancoInterConfigured, type CobrancaDetalhada } from "@/lib/banco-inter";

/** Campos do boleto que a consulta pode completar. */
export interface BoletoACompletar {
  id: string;
  status: BoletoStatus;
  codigoSolicitacao: string | null;
  nossoNumero: string | null;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  updatedAt: Date;
}

export type DadosCompletados = Partial<Pick<BoletoACompletar, "status" | "nossoNumero" | "linhaDigitavel" | "pixCopiaCola">> & {
  erroDetalhe?: string;
};

/** Consultas ao Inter por chamada: a tela não pode ficar esperando o banco. */
const MAX_CONSULTAS = 5;

/** Emitido no Inter (tem código), em aberto, mas ainda sem Pix ou linha digitável gravados. */
export function precisaCompletar(b: BoletoACompletar): boolean {
  return Boolean(b.codigoSolicitacao) && b.status === "PENDENTE" && (!b.linhaDigitavel || !b.pixCopiaCola);
}

/**
 * O que a consulta muda no boleto. Puro, para teste. Só completa os dados de pagamento e marca
 * falha de emissão; pagamento continua vindo só pelo webhook, que traz data e valor recebidos.
 */
export function mudancaDaConsulta(b: BoletoACompletar, c: CobrancaDetalhada): DadosCompletados | null {
  const dados: DadosCompletados = {};
  if (c.nossoNumero && c.nossoNumero !== b.nossoNumero) dados.nossoNumero = c.nossoNumero;
  if (c.linhaDigitavel && c.linhaDigitavel !== b.linhaDigitavel) dados.linhaDigitavel = c.linhaDigitavel;
  if (c.pixCopiaECola && c.pixCopiaECola !== b.pixCopiaCola) dados.pixCopiaCola = c.pixCopiaECola;
  if (c.situacao === "FALHA_EMISSAO") {
    dados.status = "ERRO";
    dados.erroDetalhe = "O Banco Inter informou falha na emissão. Confira CPF e endereço e tente emitir de novo.";
  }
  return Object.keys(dados).length > 0 ? dados : null;
}

/**
 * A emissão no Inter é assíncrona: logo depois de emitir, a consulta ainda não traz Pix nem
 * linha digitável, e o aviso (webhook) pode atrasar ou se perder. Aqui, quem abre a tela busca
 * no banco o que falta e grava. Falha de consulta não quebra a tela: tenta de novo na próxima.
 * Devolve, por id, o que mudou.
 */
export async function completarDadosDoInter(boletos: BoletoACompletar[]): Promise<Map<string, DadosCompletados>> {
  const mudancas = new Map<string, DadosCompletados>();
  if (!isBancoInterConfigured()) return mudancas;
  const alvos = boletos.filter(precisaCompletar).slice(0, MAX_CONSULTAS);

  await Promise.all(
    alvos.map(async (b) => {
      try {
        const consulta = await consultarCobranca(b.codigoSolicitacao!);
        const dados = mudancaDaConsulta(b, consulta);
        if (!dados) return;
        // Só grava se ninguém (webhook) mexeu no boleto entre a leitura e agora.
        const { count } = await prisma.boleto.updateMany({ where: { id: b.id, updatedAt: b.updatedAt }, data: dados });
        if (count > 0) mudancas.set(b.id, dados);
      } catch (err) {
        console.warn("inter: consulta para completar boleto falhou", b.id, err instanceof Error ? err.message : err);
      }
    }),
  );
  return mudancas;
}
