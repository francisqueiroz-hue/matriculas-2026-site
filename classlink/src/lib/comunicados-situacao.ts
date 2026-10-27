// Situação de um comunicado do ponto de vista do responsável logado. Sem dependências de
// servidor: usado na lista de comunicados e no contador de pendências do menu.

export type SituacaoComunicado = "PENDENTE" | "RESPONDIDO" | "LIDO" | "ENCERRADO";

export interface ComunicadoParaSituacao {
  tipo?: string;
  dataCriacao: string;
  prazoResposta: string | null;
  minhasRespostas?: { alunoId: string; resposta: string }[];
  /** Quantos alunos vinculados ao responsável este comunicado alcança (irmãos respondem um a um). */
  alunosAlvo?: number;
  /** Circular: quando o responsável logado abriu (registro de leitura do servidor), ou null. */
  lidoEm?: string | null;
}

/**
 * Circular não tem botão de resposta: abrir é o que conta. Vale também a resposta LIDO antiga,
 * gravada antes de a abertura passar a ser registrada sozinha.
 */
function circularLida(c: ComunicadoParaSituacao): boolean {
  return Boolean(c.lidoEm) || (c.minhasRespostas ?? []).some((r) => r.resposta === "LIDO");
}

/**
 * PENDENTE: ainda falta resposta para algum aluno e o prazo não acabou.
 * RESPONDIDO: todos os alunos alcançados têm resposta do responsável.
 * LIDO: circular já aberta pelo responsável.
 * ENCERRADO: o prazo acabou sem resposta completa (inclui o registro automático PENDENTE_EXPIRADO).
 * Na circular, PENDENTE quer dizer "ainda não aberta".
 */
export function situacaoDoComunicado(c: ComunicadoParaSituacao, agora: Date = new Date()): SituacaoComunicado {
  if (c.tipo === "CIRCULAR" && circularLida(c)) return "LIDO";
  const respostas = c.minhasRespostas ?? [];
  const respondidas = respostas.filter((r) => r.resposta !== "PENDENTE_EXPIRADO").length;
  const alvo = Math.max(c.alunosAlvo ?? 1, 1);
  if (respondidas >= alvo) return "RESPONDIDO";
  const expirado = c.prazoResposta ? new Date(c.prazoResposta).getTime() < agora.getTime() : false;
  if (expirado || respostas.some((r) => r.resposta === "PENDENTE_EXPIRADO")) return "ENCERRADO";
  return "PENDENTE";
}

/** Quantos alunos ainda esperam resposta (para "falta responder por 1 aluno"). */
export function alunosSemResposta(c: ComunicadoParaSituacao): number {
  if (c.tipo === "CIRCULAR") return 0; // uma abertura vale para todos os filhos
  const respondidas = (c.minhasRespostas ?? []).filter((r) => r.resposta !== "PENDENTE_EXPIRADO").length;
  return Math.max(Math.max(c.alunosAlvo ?? 1, 1) - respondidas, 0);
}

/**
 * Pendentes primeiro (prazo mais próximo antes; sem prazo depois), depois os demais do
 * mais recente para o mais antigo.
 */
export function ordenarParaResponsavel<T extends ComunicadoParaSituacao>(lista: T[], agora: Date = new Date()): T[] {
  const prazo = (c: T) => (c.prazoResposta ? new Date(c.prazoResposta).getTime() : Number.POSITIVE_INFINITY);
  const criacao = (c: T) => new Date(c.dataCriacao).getTime();
  return [...lista].sort((a, b) => {
    const pa = situacaoDoComunicado(a, agora) === "PENDENTE";
    const pb = situacaoDoComunicado(b, agora) === "PENDENTE";
    if (pa !== pb) return pa ? -1 : 1;
    if (pa && pb && prazo(a) !== prazo(b)) return prazo(a) - prazo(b);
    return criacao(b) - criacao(a);
  });
}
