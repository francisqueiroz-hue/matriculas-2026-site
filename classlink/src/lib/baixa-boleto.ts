import { ErroDeUsuario } from "@/lib/erros";

export type StatusBoleto = "PENDENTE" | "PAGO" | "VENCIDO" | "ERRO" | "CANCELADO";

/**
 * Sem automação do banco nada muda PENDENTE → VENCIDO sozinho; por isso o atraso é
 * calculado pela data: pendente com vencimento anterior a hoje conta como vencido.
 */
export function statusEfetivo(status: StatusBoleto, vencimento: Date, hoje: Date): StatusBoleto {
  if (status !== "PENDENTE") return status;
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  return vencimento.getTime() < inicioHoje ? "VENCIDO" : status;
}

/** "AAAA-MM-DD" → meio-dia local (mesmo padrão do vencimento); lança se inválida ou futura. */
export function dataDePagamento(texto: string | undefined, hoje: Date): Date {
  if (!texto) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) throw new ErroDeUsuario("Data de pagamento inválida.", 400);
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(a, mes - 1, d, 12, 0, 0);
  if (data.getFullYear() !== a || data.getMonth() !== mes - 1 || data.getDate() !== d) {
    throw new ErroDeUsuario("Data de pagamento inválida.", 400);
  }
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59).getTime();
  if (data.getTime() > fimHoje) throw new ErroDeUsuario("A data de pagamento não pode ser futura.", 400);
  return data;
}

export type Acao = "PAGO" | "DESFAZER";

/** Dados a gravar para a baixa manual ou seu desfazimento; lança ErroDeUsuario se a transição não vale. */
export function transicaoBaixa(
  acao: Acao,
  boleto: { status: StatusBoleto; codigoSolicitacao: string | null },
  dataPagamento: Date,
): { status: StatusBoleto; pagoEm: Date | null } {
  if (acao === "PAGO") {
    if (boleto.status === "CANCELADO") throw new ErroDeUsuario("Este boleto está cancelado. Reative-o antes de dar baixa.", 409);
    if (boleto.status === "PAGO") throw new ErroDeUsuario("Este boleto já está marcado como pago.", 409);
    return { status: "PAGO", pagoEm: dataPagamento };
  }
  if (boleto.status !== "PAGO") throw new ErroDeUsuario("Este boleto não está marcado como pago.", 409);
  if (boleto.codigoSolicitacao) {
    throw new ErroDeUsuario("Pagamento confirmado pelo banco não pode ser desfeito aqui.", 409);
  }
  return { status: "PENDENTE", pagoEm: null };
}

/** Teto de sanidade para valores digitados (evita um zero a mais virar cobrança). */
export const VALOR_MAXIMO = 50_000;

/**
 * Valor em reais vindo da tela: aceita número ou texto "1.234,56" / "1234.56".
 * Devolve centavos arredondados; lança ErroDeUsuario se não for positivo ou passar do teto.
 */
export function valorEmReais(entrada: number | string, campo = "Valor"): number {
  let n: number;
  if (typeof entrada === "number") n = entrada;
  else {
    const t = entrada.trim().replace(/^R\$\s*/i, "");
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) {
      throw new ErroDeUsuario(`${campo} inválido.`, 400);
    }
    n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  }
  if (!Number.isFinite(n) || n <= 0) throw new ErroDeUsuario(`${campo} precisa ser maior que zero.`, 400);
  if (n > VALOR_MAXIMO) throw new ErroDeUsuario(`${campo} acima do limite (R$ ${VALOR_MAXIMO.toLocaleString("pt-BR")}).`, 400);
  return Math.round(n * 100) / 100;
}

export interface CorrecaoPedida {
  valor?: number; // valor do boleto (devido)
  valorPago?: number; // valor recebido
  dataPagamento?: Date;
}

export interface BoletoParaCorrigir {
  status: StatusBoleto;
  codigoSolicitacao: string | null;
  valor: number;
  valorPago: number | null;
  pagoEm: Date | null;
}

/**
 * Correção de uma baixa manual já feita (valor do boleto, valor recebido e/ou data).
 * Só vale para boleto marcado como pago à mão; pagamento confirmado pelo banco não se
 * altera aqui. Devolve só os campos que mudam; lança se nada muda.
 */
export function correcaoBaixa(boleto: BoletoParaCorrigir, pedido: CorrecaoPedida): { valor?: number; valorPago?: number; pagoEm?: Date } {
  if (boleto.status !== "PAGO") throw new ErroDeUsuario("Só dá para corrigir boleto marcado como pago.", 409);
  if (boleto.codigoSolicitacao) {
    throw new ErroDeUsuario("Pagamento confirmado pelo banco não pode ser corrigido aqui.", 409);
  }
  const mudancas: { valor?: number; valorPago?: number; pagoEm?: Date } = {};
  if (pedido.valor !== undefined && centavos(pedido.valor) !== centavos(boleto.valor)) mudancas.valor = pedido.valor;
  const pagoAtual = boleto.valorPago ?? boleto.valor;
  if (pedido.valorPago !== undefined && (boleto.valorPago === null || centavos(pedido.valorPago) !== centavos(pagoAtual))) {
    mudancas.valorPago = pedido.valorPago;
  }
  if (pedido.dataPagamento && (!boleto.pagoEm || !mesmoDia(pedido.dataPagamento, boleto.pagoEm))) {
    mudancas.pagoEm = pedido.dataPagamento;
  }
  if (Object.keys(mudancas).length === 0) throw new ErroDeUsuario("Nada foi alterado.", 400);
  return mudancas;
}

function centavos(v: number): number {
  return Math.round(v * 100);
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Cancelar um boleto lançado por engano (ex.: o mesmo aluno cobrado duas vezes no mês) ou
 * reativar um cancelado. O cancelado sai das cobranças, dos lembretes, dos totais e da
 * tela da família, mas continua no banco com o histórico. Boleto emitido no banco precisa
 * ser baixado/cancelado no próprio banco: aqui não se cancela.
 */
export function transicaoCancelamento(
  acao: "CANCELAR" | "REATIVAR",
  boleto: { status: StatusBoleto; codigoSolicitacao: string | null },
): StatusBoleto {
  if (boleto.codigoSolicitacao) {
    throw new ErroDeUsuario("Boleto emitido no banco: cancele no próprio banco, não por aqui.", 409);
  }
  if (acao === "CANCELAR") {
    if (boleto.status === "CANCELADO") throw new ErroDeUsuario("Este boleto já está cancelado.", 409);
    return "CANCELADO";
  }
  if (boleto.status !== "CANCELADO") throw new ErroDeUsuario("Este boleto não está cancelado.", 409);
  return "PENDENTE";
}
