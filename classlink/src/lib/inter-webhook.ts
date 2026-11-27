import type { BoletoStatus } from "@prisma/client";

/**
 * Callback da API Cobrança v3 do Inter (um item do array enviado ao webhook).
 * Referência: https://developers.inter.co/references/cobranca-bolepix (Webhook).
 */
export interface CallbackInter {
  codigoSolicitacao?: string;
  seuNumero?: string;
  situacao?: string;
  dataHoraSituacao?: string;
  valorTotalRecebido?: string | number;
  origemRecebimento?: string;
  nossoNumero?: string;
  codigoBarras?: string;
  linhaDigitavel?: string;
  txid?: string;
  pixCopiaECola?: string;
}

/** Situações v3 que significam dinheiro recebido pelo banco. */
const SITUACOES_PAGO = new Set(["RECEBIDO", "MARCADO_RECEBIDO"]);

export interface MudancaBoleto {
  dados: {
    status?: BoletoStatus;
    pagoEm?: Date;
    valorPago?: number;
    erroDetalhe?: string | null;
    nossoNumero?: string;
    linhaDigitavel?: string;
    pixCopiaCola?: string;
  };
  pagamentoConfirmado: boolean;
}

function dataValida(texto: string | undefined): Date | null {
  if (!texto) return null;
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

function valorValido(v: string | number | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Decide o que um callback muda no boleto. Puro, para teste. Regras:
 * - linha digitável, nosso número e Pix são guardados sempre que vierem (emissão assíncrona);
 * - RECEBIDO/MARCADO_RECEBIDO: PAGO, com a data e o valor recebido informados pelo banco;
 * - FALHA_EMISSAO: ERRO (a direção pode tentar emitir de novo);
 * - CANCELADO: CANCELADO (cancelado no internet banking do Inter);
 * - pagamento já gravado não é desfeito por callback posterior.
 * Devolve null quando não há nada a mudar (callback repetido).
 */
export function interpretarCallbackInter(
  evento: CallbackInter,
  boleto: { status: BoletoStatus; nossoNumero: string | null; linhaDigitavel: string | null; pixCopiaCola: string | null },
): MudancaBoleto | null {
  const dados: MudancaBoleto["dados"] = {};
  if (evento.nossoNumero && evento.nossoNumero !== boleto.nossoNumero) dados.nossoNumero = evento.nossoNumero;
  if (evento.linhaDigitavel && evento.linhaDigitavel !== boleto.linhaDigitavel) dados.linhaDigitavel = evento.linhaDigitavel;
  if (evento.pixCopiaECola && evento.pixCopiaECola !== boleto.pixCopiaCola) dados.pixCopiaCola = evento.pixCopiaECola;

  let pagamentoConfirmado = false;
  const situacao = evento.situacao ?? "";
  if (boleto.status !== "PAGO") {
    if (SITUACOES_PAGO.has(situacao)) {
      dados.status = "PAGO";
      dados.pagoEm = dataValida(evento.dataHoraSituacao) ?? new Date();
      const valor = valorValido(evento.valorTotalRecebido);
      if (valor !== null) dados.valorPago = valor;
      dados.erroDetalhe = null;
      pagamentoConfirmado = true;
    } else if (situacao === "FALHA_EMISSAO") {
      dados.status = "ERRO";
      dados.erroDetalhe = "O Banco Inter informou falha na emissão. Confira CPF e endereço e tente emitir de novo.";
    } else if (situacao === "CANCELADO" && boleto.status !== "CANCELADO") {
      dados.status = "CANCELADO";
    }
  }

  if (Object.keys(dados).length === 0) return null;
  return { dados, pagamentoConfirmado };
}
