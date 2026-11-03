// Conferência dos valores dos contratos de renovação já enviados: compara o valor gravado em
// cada contrato com a mensalidade cadastrada corrigida. Sem dependências de servidor.
import { REAJUSTE_RENOVACAO_2027, valoresComReajuste, type CondicoesContrato, type CriterioReajuste } from "./tipos";

export const CRITERIO_RENOVACAO_2027: CriterioReajuste = {
  percentual: REAJUSTE_RENOVACAO_2027,
  base: "BRUTA",
  descontoPct: 0,
  arredondamento: "CENTAVOS",
};

export type SituacaoValor =
  | "OK" // contrato com o valor corrigido (ou isenção de bolsista)
  | "SEM_VALOR" // contrato saiu com os valores em branco
  | "VALOR_DIFERENTE" // contrato com outro valor (ex.: tabela do período, sem a correção)
  | "AJUSTADO" // enviado na renovação com valor ajustado à mão (bolsa parcial, acordo): intencional
  | "SEM_MENSALIDADE"; // aluno sem mensalidade cadastrada nem isenção: não dá para calcular

export const ROTULO_SITUACAO: Record<SituacaoValor, string> = {
  OK: "Valor corrigido",
  SEM_VALOR: "Sem valor no contrato",
  VALOR_DIFERENTE: "Valor diferente do corrigido",
  AJUSTADO: "Ajustado à mão no envio",
  SEM_MENSALIDADE: "Aluno sem mensalidade cadastrada",
};

export interface ConferenciaValor {
  situacao: SituacaoValor;
  /** Parcela gravada no contrato (0 = em branco). */
  valorContrato: number;
  /** Parcela esperada: mensalidade cadastrada corrigida; null se não houver mensalidade. */
  valorEsperado: number | null;
}

export function conferirValor(condicoes: unknown, aluno: { mensalidade: number | null; bolsista: boolean }): ConferenciaValor {
  const c = (condicoes ?? {}) as Partial<CondicoesContrato>;
  const valorContrato = Number(c.parcelaBruta) > 0 ? Number(c.parcelaBruta) : 0;
  if (aluno.bolsista) {
    return { situacao: c.bolsista ? "OK" : valorContrato > 0 ? "VALOR_DIFERENTE" : "SEM_VALOR", valorContrato, valorEsperado: 0 };
  }
  const esperado = aluno.mensalidade && aluno.mensalidade > 0 ? valoresComReajuste(aluno.mensalidade, CRITERIO_RENOVACAO_2027) : null;
  if (!esperado) return { situacao: "SEM_MENSALIDADE", valorContrato, valorEsperado: null };
  const igual = Math.round(valorContrato * 100) === Math.round(esperado.parcelaBruta * 100);
  const situacao: SituacaoValor = valorContrato === 0 ? "SEM_VALOR" : igual ? "OK" : c.reajuste ? "AJUSTADO" : "VALOR_DIFERENTE";
  return { situacao, valorContrato, valorEsperado: esperado.parcelaBruta };
}

/** Situações que o botão "atualizar" corrige (só em contratos ainda não assinados). */
export function precisaAtualizar(s: SituacaoValor): boolean {
  return s === "SEM_VALOR" || s === "VALOR_DIFERENTE";
}
