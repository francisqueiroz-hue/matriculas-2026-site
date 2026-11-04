/**
 * Conferência dos boletos marcados como pagos: aponta o que merece um segundo olhar antes
 * de a direção fechar o mês. Puro (sem banco) para ser testado com casos fixos.
 *
 * Nenhum alerta afirma que há erro: cada um diz o que comparar. Ex.: o valor do boleto
 * diferente da mensalidade do cadastro pode ser um reajuste legítimo.
 */

export type CodigoAlerta =
  | "PAGO_DIFERENTE"
  | "DIFERENTE_MENSALIDADE"
  | "SEM_MENSALIDADE"
  | "VALOR_ZERADO"
  | "SEM_DATA"
  | "DATA_FUTURA"
  | "DATA_DISTANTE"
  | "BOLSISTA"
  | "BAIXA_REFEITA"
  | "ALUNO_EXCLUIDO";

export interface Alerta {
  codigo: CodigoAlerta;
  texto: string;
}

export interface BoletoPagoConferencia {
  valor: number;
  valorPago: number | null;
  vencimento: Date;
  pagoEm: Date | null;
  mensalidadeCadastro: number | null;
  bolsista: boolean;
  alunoExcluido: boolean;
  /** Quantas vezes este boleto recebeu baixa "PAGO" no histórico. */
  baixasPago: number;
}

/** Pagamento a mais de 90 dias do vencimento costuma ser data digitada errada (ano/mês). */
export const DIAS_DATA_DISTANTE = 90;
const DIA_MS = 24 * 60 * 60 * 1000;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cent = (v: number) => Math.round(v * 100);

export function alertasBaixa(b: BoletoPagoConferencia, hoje: Date): Alerta[] {
  const alertas: Alerta[] = [];
  if (cent(b.valor) <= 0 || (b.valorPago !== null && cent(b.valorPago) <= 0)) {
    alertas.push({ codigo: "VALOR_ZERADO", texto: "Valor zerado" });
  }
  if (b.valorPago !== null && cent(b.valorPago) !== cent(b.valor)) {
    const dif = b.valorPago - b.valor;
    alertas.push({
      codigo: "PAGO_DIFERENTE",
      texto: `Recebido ${dif > 0 ? "a mais" : "a menos"}: ${brl(Math.abs(dif))}`,
    });
  }
  if (b.mensalidadeCadastro === null) {
    if (!b.bolsista) alertas.push({ codigo: "SEM_MENSALIDADE", texto: "Aluno sem mensalidade no cadastro" });
  } else if (cent(b.mensalidadeCadastro) !== cent(b.valor)) {
    alertas.push({
      codigo: "DIFERENTE_MENSALIDADE",
      texto: `Boleto diferente da mensalidade do cadastro (${brl(b.mensalidadeCadastro)})`,
    });
  }
  if (!b.pagoEm) {
    alertas.push({ codigo: "SEM_DATA", texto: "Pago sem data de pagamento" });
  } else {
    const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59).getTime();
    if (b.pagoEm.getTime() > fimHoje) {
      alertas.push({ codigo: "DATA_FUTURA", texto: "Data de pagamento no futuro" });
    } else if (Math.abs(b.pagoEm.getTime() - b.vencimento.getTime()) > DIAS_DATA_DISTANTE * DIA_MS) {
      alertas.push({ codigo: "DATA_DISTANTE", texto: `Pago a mais de ${DIAS_DATA_DISTANTE} dias do vencimento` });
    }
  }
  if (b.bolsista) alertas.push({ codigo: "BOLSISTA", texto: "Aluno marcado como bolsista (isento)" });
  if (b.baixasPago > 1) {
    alertas.push({ codigo: "BAIXA_REFEITA", texto: `Baixa lançada ${b.baixasPago} vezes (desfeita e refeita)` });
  }
  if (b.alunoExcluido) alertas.push({ codigo: "ALUNO_EXCLUIDO", texto: "Aluno excluído do cadastro" });

  return alertas;
}

/** "AAAA-MM" válido (mês 01–12)? */
export function mesValido(texto: string | null | undefined): texto is string {
  return !!texto && /^\d{4}-(0[1-9]|1[0-2])$/.test(texto);
}

/**
 * Célula de CSV segura: entre aspas, aspas dobradas, e prefixo ' quando começa com
 * = + - @ num texto (evita que a planilha execute fórmula vinda de um nome digitado).
 * Número negativo simples ("-5,00") passa sem prefixo.
 */
export function celulaCsv(valor: string | number | null | undefined): string {
  let t = valor === null || valor === undefined ? "" : String(valor);
  if (typeof valor === "string" && /^[=+\-@\t\r]/.test(t) && !/^-?\d+(,\d+)?$/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}
