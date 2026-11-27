/** Vencimento das mensalidades: dia 05 de cada mês (o mesmo do contrato). */
export const DIA_VENCIMENTO_PADRAO = 5;

const FUSO_ESCOLA = "America/Sao_Paulo";

/**
 * "Agora", com os componentes de data/hora já no fuso horário do Brasil. Necessário porque
 * o servidor (Vercel) roda em UTC — perto da meia-noite em Brasília (21h–00h, que já é
 * 00h–03h UTC do dia seguinte), um `new Date()` puro reportaria o dia/mês errado via
 * `getDate()`/`getMonth()`. Usado como "hoje" na geração de boletos (dia do mês para
 * disparar a emissão, e mês de referência do boleto).
 */
export function agoraNoFusoDaEscola(): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_ESCOLA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return new Date(valor("year"), valor("month") - 1, valor("day"), valor("hour"), valor("minute"), valor("second"));
}

/** Referência de mês no formato usado pelos boletos, ex: "2026-08". */
export function mesReferenciaAtual(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Data de vencimento a partir de um dia do mês, avançando para o próximo mês se o dia já passou. */
export function calcularVencimento(diaVencimento: number, referencia = new Date()): Date {
  const ano = referencia.getFullYear();
  const mes = referencia.getMonth();
  const ultimoDiaDoMes = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(diaVencimento, ultimoDiaDoMes);
  return new Date(ano, mes, dia, 12, 0, 0);
}

export function formatarDataISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Primeiro mês que o lançamento automático gera adiantado (decisão da direção, 27/11/2026):
 * dezembro/2026 é lançado pelo botão, como novembro; o 1º lançamento automático é em 28/12,
 * para janeiro/2027.
 */
export const PRIMEIRO_MES_LANCADO_ADIANTADO = "2027-01";

/**
 * Mês que o lançamento automático gera hoje. Até o dia do vencimento (05), o próprio mês; depois
 * dele, o mês seguinte (rodando no dia 28, lança o próximo mês com vencimento no dia 05, em vez
 * de um mês já vencido). Mês seguinte anterior a PRIMEIRO_MES_LANCADO_ADIANTADO: null (nada a
 * lançar automaticamente).
 */
export function mesDoLancamentoAutomatico(hoje: Date): string | null {
  if (hoje.getDate() <= DIA_VENCIMENTO_PADRAO) return mesReferenciaAtual(hoje);
  const seguinte = mesReferenciaAtual(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1));
  return seguinte < PRIMEIRO_MES_LANCADO_ADIANTADO ? null : seguinte;
}
