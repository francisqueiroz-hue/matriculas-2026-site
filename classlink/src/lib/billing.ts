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
