// Boletos do ano emitidos pela própria família (regra pura, sem servidor): a partir do contrato
// assinado, as parcelas do ano letivo, uma por mês, com vencimento no dia 05. Decide o que pode
// ser emitido agora e o que fica de fora, sempre com o motivo. Nunca inventa valor: sem contrato
// com valor de parcela (ou com desconto de pontualidade, que o boleto ainda não leva), a família
// não emite e a escola segue como hoje.
import { DIA_VENCIMENTO_MENSALIDADE } from "./contrato-modelo/tipos";

/** Menor valor que o Banco Inter aceita num boleto. */
export const VALOR_MINIMO_INTER = 2.5;

export interface ContratoDoAno {
  anoLetivo: number;
  /** Condições lidas do contrato (ver valoresDoContrato); null = contrato sem valores. */
  valores: { parcelas: number; vencimentoDia: number; parcelaBruta: number; parcelaLiquida: number; bolsista: boolean } | null;
  /** "Primeiro e último vencimento" escrito no contrato, ex.: "05/01/2027 a 05/12/2027". */
  primeiroUltimo: string | null;
}

export interface BoletoExistente {
  mesReferencia: string;
  valor: number;
  /** BoletoStatus: PENDENTE, PAGO, VENCIDO, ERRO, CANCELADO. */
  status: string;
  codigoSolicitacao: string | null;
  /** Regra do responsável financeiro: para quem é o boleto (null = sem destinatário gravado). */
  porResponsavelFinanceiro: boolean;
  destinatarioId: string | null;
}

export type SituacaoMes =
  /** Pode ser emitido agora no Banco Inter. */
  | "A_EMITIR"
  /** Já emitido no Banco Inter (tem Pix/linha digitável ou está sendo gerado). */
  | "EMITIDO"
  | "PAGO"
  /** O vencimento já passou: o Inter não emite boleto vencido. */
  | "VENCIDO"
  /** Existe um lançamento da escola que a família não pode mexer (valor diferente, cancelado...). */
  | "COM_A_ESCOLA";

export interface MesDoAno {
  mesReferencia: string; // "AAAA-MM"
  /** "AAAA-MM-DD" */
  vencimento: string;
  valor: number;
  situacao: SituacaoMes;
  motivo?: string;
}

export interface PlanoDoAno {
  /** Motivo de a família não poder emitir nada (null = há o que conferir mês a mês). */
  bloqueio: string | null;
  parcela: number | null;
  meses: MesDoAno[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Primeiro mês das parcelas a partir de "05/01/2027 a 05/12/2027" (índice 0–11); null se ilegível. */
export function primeiroMesDasParcelas(primeiroUltimo: string | null, anoLetivo: number): number | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(primeiroUltimo ?? "");
  if (!m) return null;
  const mes = Number(m[2]);
  if (Number(m[3]) !== anoLetivo || mes < 1 || mes > 12) return null;
  return mes - 1;
}

/**
 * O que a família pode emitir do ano do contrato. `hoje` no fuso da escola. `guardianId` é
 * quem está pedindo (já conferido como responsável financeiro pelo servidor).
 */
export function planoDoAno(contrato: ContratoDoAno, existentes: BoletoExistente[], hoje: Date, guardianId: string): PlanoDoAno {
  const v = contrato.valores;
  if (!v) return { bloqueio: "O contrato não tem o valor da parcela. Fale com a secretaria.", parcela: null, meses: [] };
  if (v.bolsista) return { bloqueio: "Aluno isento de mensalidade: não há boletos a emitir.", parcela: null, meses: [] };
  if (!(v.parcelaBruta > 0)) return { bloqueio: "O contrato não tem o valor da parcela. Fale com a secretaria.", parcela: null, meses: [] };
  if (v.parcelaLiquida > 0 && v.parcelaLiquida < v.parcelaBruta) {
    // O boleto do Inter ainda sai sem o desconto de pontualidade: emitir o valor cheio cobraria
    // a mais de quem paga em dia. Até isso existir, a escola emite esses.
    return { bloqueio: "O contrato tem desconto de pontualidade: estes boletos são emitidos pela escola.", parcela: v.parcelaBruta, meses: [] };
  }
  if (v.parcelaBruta < VALOR_MINIMO_INTER) {
    return { bloqueio: `Parcela abaixo do mínimo do banco (${brl(VALOR_MINIMO_INTER)}). Fale com a secretaria.`, parcela: v.parcelaBruta, meses: [] };
  }
  if (v.vencimentoDia !== DIA_VENCIMENTO_MENSALIDADE) {
    return { bloqueio: "O vencimento do contrato é diferente do dia 05. Fale com a secretaria.", parcela: v.parcelaBruta, meses: [] };
  }
  const inicio = primeiroMesDasParcelas(contrato.primeiroUltimo, contrato.anoLetivo);
  if (inicio === null || !(v.parcelas >= 1) || inicio + v.parcelas > 12) {
    return { bloqueio: "As parcelas do contrato estão fora do padrão (janeiro a dezembro). Fale com a secretaria.", parcela: v.parcelaBruta, meses: [] };
  }

  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const porMes = new Map(existentes.map((b) => [b.mesReferencia, b]));
  const meses: MesDoAno[] = [];
  for (let i = 0; i < v.parcelas; i++) {
    const mes = inicio + i;
    const mesReferencia = `${contrato.anoLetivo}-${doisDigitos(mes + 1)}`;
    const vencimento = `${mesReferencia}-${doisDigitos(DIA_VENCIMENTO_MENSALIDADE)}`;
    const venceEm = new Date(contrato.anoLetivo, mes, DIA_VENCIMENTO_MENSALIDADE);
    const base = { mesReferencia, vencimento, valor: v.parcelaBruta };
    const b = porMes.get(mesReferencia);

    if (b?.status === "PAGO") {
      meses.push({ ...base, valor: b.valor, situacao: "PAGO" });
      continue;
    }
    if (b?.codigoSolicitacao) {
      meses.push({ ...base, valor: b.valor, situacao: "EMITIDO" });
      continue;
    }
    if (venceEm < inicioHoje) {
      meses.push({ ...base, situacao: "VENCIDO", motivo: "Vencimento já passou: fale com a secretaria." });
      continue;
    }
    if (b) {
      if (b.status !== "PENDENTE" && b.status !== "ERRO") {
        const motivo = b.status === "CANCELADO" ? "Cancelado pela escola." : "Lançamento em andamento na escola: fale com a secretaria.";
        meses.push({ ...base, valor: b.valor, situacao: "COM_A_ESCOLA", motivo });
        continue;
      }
      if (b.porResponsavelFinanceiro && b.destinatarioId && b.destinatarioId !== guardianId) {
        meses.push({ ...base, valor: b.valor, situacao: "COM_A_ESCOLA", motivo: "Lançado para outro responsável." });
        continue;
      }
      if (Math.round(b.valor * 100) !== Math.round(v.parcelaBruta * 100)) {
        meses.push({ ...base, valor: b.valor, situacao: "COM_A_ESCOLA", motivo: `Lançado pela escola com ${brl(b.valor)}: fale com a secretaria.` });
        continue;
      }
    }
    meses.push({ ...base, situacao: "A_EMITIR" });
  }
  return { bloqueio: null, parcela: v.parcelaBruta, meses };
}

/** A partir deste ano letivo, o valor da mensalidade lançada sai do contrato do ano, não do cadastro. */
export const ANO_VALOR_PELO_CONTRATO = 2027;

export interface ContratoParaValor extends ContratoDoAno {
  status: string;
  /** Para desempatar contratos do mesmo ano (o mais recente vale). */
  atualizadoEm: Date;
}

export type ValorDoMes =
  | { tipo: "VALOR"; valor: number; origem: "CONTRATO_ASSINADO" | "CONTRATO_ENVIADO" }
  | { tipo: "ISENTO" }
  /** Sem valor confiável: o mês não é lançado automaticamente (a direção resolve). */
  | { tipo: "SEM_VALOR"; motivo: string };

/**
 * Valor de um mês de `ANO_VALOR_PELO_CONTRATO` em diante, pelo contrato daquele ano letivo:
 * vale o contrato assinado (COMPLETO); sem assinado, o contrato enviado mais recente que tenha
 * valor (é o valor que a escola propôs; DEVOLVIDO conta, porque o valor não muda na devolução).
 * Mês fora das parcelas do contrato, contrato sem valor ou ausente: SEM_VALOR, nunca o cadastro
 * (que guarda a mensalidade do ano anterior, sem o reajuste). Com desconto de pontualidade, lança
 * a parcela com desconto: o boleto ainda não leva o desconto e cobrar o cheio de quem paga em
 * dia seria cobrar a mais.
 */
export function valorDoMesPeloContrato(contratos: ContratoParaValor[], mesReferencia: string): ValorDoMes {
  const ano = Number(mesReferencia.slice(0, 4));
  const mes = Number(mesReferencia.slice(5, 7)) - 1;
  const doAno = contratos.filter((c) => c.anoLetivo === ano).sort((a, b) => b.atualizadoEm.getTime() - a.atualizadoEm.getTime());
  if (doAno.length === 0) return { tipo: "SEM_VALOR", motivo: `sem contrato de ${ano}` };
  const assinado = doAno.find((c) => c.status === "COMPLETO");
  const escolhido = assinado ?? doAno.find((c) => c.valores && (c.valores.bolsista || c.valores.parcelaBruta > 0));
  if (!escolhido?.valores) return { tipo: "SEM_VALOR", motivo: `contrato de ${ano} sem valor de parcela` };
  const v = escolhido.valores;
  if (v.bolsista) return { tipo: "ISENTO" };
  if (!(v.parcelaBruta > 0)) return { tipo: "SEM_VALOR", motivo: `contrato de ${ano} sem valor de parcela` };
  const inicio = primeiroMesDasParcelas(escolhido.primeiroUltimo, ano) ?? 0;
  if (mes < inicio || mes >= inicio + v.parcelas) return { tipo: "SEM_VALOR", motivo: `${mesReferencia} fora das parcelas do contrato` };
  const valor = v.parcelaLiquida > 0 && v.parcelaLiquida < v.parcelaBruta ? v.parcelaLiquida : v.parcelaBruta;
  return { tipo: "VALOR", valor, origem: assinado ? "CONTRATO_ASSINADO" : "CONTRATO_ENVIADO" };
}
