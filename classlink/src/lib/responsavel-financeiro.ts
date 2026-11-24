/**
 * Quem recebe, preenche e assina o contrato do aluno, e quem recebe o boleto.
 *
 * Regra (decisão da direção, 24/11/2026): com mais de um responsável, contrato e boleto vão só
 * ao responsável financeiro, nunca ao pedagógico. Vale para o que for criado a partir de agora;
 * contratos e boletos anteriores continuam como estavam (contrato: todos os responsáveis;
 * boleto: o 1º responsável vinculado).
 *
 * Quem é o financeiro, nesta ordem:
 * 1. o indicado pela direção;
 * 2. o único responsável ativo;
 * 3. quem já consta como contratante/pagador no cadastro: o responsável que enviou o último
 *    contrato assinado ou, se não houver, o único com CPF de cobrança preenchido (presumido; a
 *    tela mostra para a direção confirmar);
 * 4. ninguém: a direção é avisada e nada é enviado até ela indicar.
 *
 * Arquivo sem acesso ao banco (usado também na tela); a parte do servidor está em
 * contratos-server.ts.
 */

export interface VinculoResponsavel {
  guardianId: string;
  responsavelFinanceiro: boolean;
  /** Conta ativa (não desativada nem excluída). */
  ativo: boolean;
  /** Foi quem enviou o último contrato assinado do aluno (contratante anterior). */
  assinouUltimoContrato?: boolean;
  /** Preencheu o CPF de cobrança (pagador de boleto). */
  temCpf?: boolean;
}

export type SituacaoDestino =
  /** A direção indicou o responsável financeiro. */
  | "FINANCEIRO"
  /** Só um responsável ativo: é ele, sem precisar indicar. */
  | "UNICO"
  /** Não indicado, mas já consta como contratante (último contrato assinado). */
  | "PRESUMIDO_CONTRATO"
  /** Não indicado, mas é o único com CPF de cobrança preenchido. */
  | "PRESUMIDO_COBRANCA"
  /** Dois ou mais responsáveis, nenhum indicado e nada no cadastro aponta quem é. */
  | "INDEFINIDO"
  /** Nenhum responsável ativo. */
  | "SEM_RESPONSAVEL";

export interface DestinoContrato {
  situacao: SituacaoDestino;
  /** Quem recebe o contrato e o boleto (vazio em INDEFINIDO e SEM_RESPONSAVEL). */
  ids: string[];
}

export const MOTIVO_SEM_FINANCEIRO =
  "Aluno com mais de um responsável: indique o responsável financeiro (quem assina o contrato e recebe o boleto) na tela Contratos antes de enviar";

export const ROTULO_PRESUMIDO: Partial<Record<SituacaoDestino, string>> = {
  PRESUMIDO_CONTRATO: "assinou o contrato anterior",
  PRESUMIDO_COBRANCA: "tem o CPF de cobrança no cadastro",
};

function unico(lista: VinculoResponsavel[]): VinculoResponsavel | undefined {
  return lista.length === 1 ? lista[0] : undefined;
}

export function destinoContrato(vinculos: VinculoResponsavel[]): DestinoContrato {
  const ativos = vinculos.filter((v) => v.ativo);
  const financeiro = ativos.find((v) => v.responsavelFinanceiro);
  if (financeiro) return { situacao: "FINANCEIRO", ids: [financeiro.guardianId] };
  if (ativos.length === 0) return { situacao: "SEM_RESPONSAVEL", ids: [] };
  if (ativos.length === 1) return { situacao: "UNICO", ids: [ativos[0].guardianId] };
  const contratante = unico(ativos.filter((v) => v.assinouUltimoContrato));
  if (contratante) return { situacao: "PRESUMIDO_CONTRATO", ids: [contratante.guardianId] };
  const pagador = unico(ativos.filter((v) => v.temCpf));
  if (pagador) return { situacao: "PRESUMIDO_COBRANCA", ids: [pagador.guardianId] };
  return { situacao: "INDEFINIDO", ids: [] };
}

/** Contrato ou boleto: criado pela regra do financeiro (com destinatário) ou anterior a ela. */
export interface ItemComDestinatario {
  porResponsavelFinanceiro: boolean;
  destinatarioId: string | null;
}

/**
 * Quem recebe os avisos do item. Pela regra nova: só o destinatário (ativo). Anterior à regra:
 * `anteriores` (contrato: todos os responsáveis ativos; boleto: o 1º vinculado), como era.
 */
export function avisadosDoItem(item: ItemComDestinatario, vinculos: VinculoResponsavel[], anteriores: string[]): string[] {
  if (!item.porResponsavelFinanceiro) return anteriores;
  const destinatario = vinculos.find((v) => v.guardianId === item.destinatarioId && v.ativo);
  return destinatario ? [destinatario.guardianId] : [];
}

/**
 * O responsável vê o item no app? Pela regra nova, com destinatário: só ele. Anterior à regra
 * (ou sem destinatário ainda): todos os vinculados, como antes.
 */
export function responsavelVeItem(item: ItemComDestinatario, vinculado: boolean, guardianId: string): boolean {
  if (!vinculado) return false;
  if (item.porResponsavelFinanceiro && item.destinatarioId) return item.destinatarioId === guardianId;
  return true;
}

/** Tira os campos da regra antes de mandar o item para a família (dado interno da escola). */
export function semDadosDaRegra<T extends ItemComDestinatario>(item: T): Omit<T, keyof ItemComDestinatario> {
  const { porResponsavelFinanceiro, destinatarioId, ...resto } = item;
  void porResponsavelFinanceiro;
  void destinatarioId;
  return resto;
}
