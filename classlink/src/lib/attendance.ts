import type { AttendanceStatus } from "@prisma/client";

/**
 * Percentual mínimo de frequência exigido para aprovação na educação básica no Brasil
 * (LDB — Lei nº 9.394/1996, art. 24, VI): mínimo de 75% de frequência do total de horas
 * letivas, para todos os níveis (não há exceção geral por "falta justificada" na letra
 * da lei — a justificativa pode fundamentar reposição de conteúdo/atividades ou um
 * tratamento excepcional previsto no regimento da escola ou em norma estadual, mas não
 * altera o cálculo do percentual em si). Por isso, para fins deste cálculo:
 *   - PRESENT e LATE contam como presença;
 *   - ABSENT e JUSTIFIED contam como ausência no percentual (JUSTIFIED é contabilizado
 *     à parte para a escola avaliar reposição/abono conforme seu regimento).
 * Esta é uma interpretação razoável da norma geral, não uma opinião jurídica definitiva —
 * regimentos internos e normas estaduais/municipais podem prever regras específicas
 * adicionais; confirme com a assessoria jurídica da escola antes de usar o percentual
 * isoladamente para decidir uma retenção.
 */
export const PERCENTUAL_FREQUENCIA_MINIMO = 75;

export interface ResumoFrequencia {
  total: number;
  presentes: number;
  atrasos: number;
  faltas: number;
  justificadas: number;
  /** Percentual de presença (PRESENT + LATE sobre o total). null quando não há registros no período. */
  percentual: number | null;
}

export function calcResumoFrequencia(statuses: AttendanceStatus[]): ResumoFrequencia {
  const total = statuses.length;
  const presentes = statuses.filter((s) => s === "PRESENT").length;
  const atrasos = statuses.filter((s) => s === "LATE").length;
  const faltas = statuses.filter((s) => s === "ABSENT").length;
  const justificadas = statuses.filter((s) => s === "JUSTIFIED").length;
  const percentual = total === 0 ? null : Math.round(((presentes + atrasos) / total) * 10000) / 100;
  return { total, presentes, atrasos, faltas, justificadas, percentual };
}

/** true quando o percentual está abaixo do mínimo legal (art. 24, VI, LDB). null (sem registros) nunca é "abaixo". */
export function abaixoDoMinimoLegal(percentual: number | null): boolean {
  return percentual !== null && percentual < PERCENTUAL_FREQUENCIA_MINIMO;
}

const MES_REGEX = /^(\d{4})-(\d{2})$/;

/** Intervalo [início, fim) em UTC do mês "AAAA-MM", usado para consultar Attendance.date. */
export function mesReferenciaParaIntervalo(mesReferencia: string): { inicio: Date; fim: Date } {
  const match = MES_REGEX.exec(mesReferencia);
  if (!match) throw new Error("Mês de referência inválido (use AAAA-MM)");
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  if (mes < 1 || mes > 12) throw new Error("Mês de referência inválido (use AAAA-MM)");
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 1));
  return { inicio, fim };
}

// Servidores rodam em UTC (ex: Vercel), mas a escola opera no horário de Brasília
// (UTC-3) — calcular o "mês corrente" em UTC erraria por um mês inteiro nas primeiras
// horas de cada dia 1º (ex: 31/08 22h em Brasília já é 01/09 em UTC).
const FUSO_ESCOLA = "America/Sao_Paulo";

/** Mês corrente no formato "AAAA-MM", no fuso horário da escola. Usado como padrão quando o cliente não informa `mes`. */
export function mesAtualReferencia(): string {
  // "en-CA" formata como AAAA-MM-DD, o que facilita extrair o mês de forma robusta entre localidades.
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_ESCOLA }).format(new Date());
  return hoje.slice(0, 7);
}

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza uma data "AAAA-MM-DD" para meia-noite UTC (chave usada em Attendance.date). Lança erro se o formato for inválido. */
export function dataParaMeiaNoiteUtc(data: string): Date {
  if (!DATA_REGEX.test(data)) throw new Error("Data inválida (use AAAA-MM-DD)");
  const date = new Date(`${data}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Data inválida (use AAAA-MM-DD)");
  return date;
}
