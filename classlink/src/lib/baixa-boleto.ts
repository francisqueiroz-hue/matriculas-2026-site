import { ErroDeUsuario } from "@/lib/erros";

export type StatusBoleto = "PENDENTE" | "PAGO" | "VENCIDO" | "ERRO";

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
    if (boleto.status === "PAGO") throw new ErroDeUsuario("Este boleto já está marcado como pago.", 409);
    return { status: "PAGO", pagoEm: dataPagamento };
  }
  if (boleto.status !== "PAGO") throw new ErroDeUsuario("Este boleto não está marcado como pago.", 409);
  if (boleto.codigoSolicitacao) {
    throw new ErroDeUsuario("Pagamento confirmado pelo banco não pode ser desfeito aqui.", 409);
  }
  return { status: "PENDENTE", pagoEm: null };
}
