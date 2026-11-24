/**
 * Quem recebe, preenche e assina o contrato do aluno.
 *
 * Regra (pedido da direção, 24/11/2026): com mais de um responsável, o contrato vai só ao
 * responsável financeiro (contratante), nunca ao pedagógico. Enquanto a direção não indicar o
 * financeiro de um aluno com dois ou mais responsáveis, o app não escolhe sozinho: o envio e os
 * lembretes daquele aluno ficam parados e a tela Contratos pede a indicação.
 *
 * Arquivo sem acesso ao banco (usado também na tela); a parte do servidor está em
 * responsavel-financeiro-server.ts.
 */

export interface VinculoResponsavel {
  guardianId: string;
  responsavelFinanceiro: boolean;
  /** Conta ativa (não desativada nem excluída). */
  ativo: boolean;
}

export type SituacaoDestino =
  /** A direção indicou o responsável financeiro. */
  | "FINANCEIRO"
  /** Só um responsável ativo: é ele, sem precisar indicar. */
  | "UNICO"
  /** Dois ou mais responsáveis e nenhum indicado como financeiro: não envia a ninguém. */
  | "INDEFINIDO"
  /** Nenhum responsável ativo. */
  | "SEM_RESPONSAVEL";

export interface DestinoContrato {
  situacao: SituacaoDestino;
  /** Quem recebe o contrato e os lembretes (vazio em INDEFINIDO e SEM_RESPONSAVEL). */
  ids: string[];
}

export const MOTIVO_SEM_FINANCEIRO =
  "Aluno com mais de um responsável: indique o responsável financeiro (quem assina o contrato) na tela Contratos antes de enviar";

export function destinoContrato(vinculos: VinculoResponsavel[]): DestinoContrato {
  const ativos = vinculos.filter((v) => v.ativo);
  const financeiro = ativos.find((v) => v.responsavelFinanceiro);
  if (financeiro) return { situacao: "FINANCEIRO", ids: [financeiro.guardianId] };
  if (ativos.length === 1) return { situacao: "UNICO", ids: [ativos[0].guardianId] };
  if (ativos.length === 0) return { situacao: "SEM_RESPONSAVEL", ids: [] };
  return { situacao: "INDEFINIDO", ids: [] };
}

/**
 * O responsável vê o contrato do aluno no app? Com o destino definido, só quem assina. Sem
 * financeiro indicado (aluno com dois ou mais responsáveis), continua como antes: todos os
 * vinculados veem, para não sumir um contrato que já está em andamento.
 */
export function responsavelVeContrato(vinculos: VinculoResponsavel[], guardianId: string): boolean {
  if (!vinculos.some((v) => v.guardianId === guardianId)) return false;
  const destino = destinoContrato(vinculos);
  if (destino.situacao === "FINANCEIRO" || destino.situacao === "UNICO") return destino.ids.includes(guardianId);
  return true;
}
