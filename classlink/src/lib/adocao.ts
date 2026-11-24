/**
 * Adoção do ClassLink pelas famílias: quantas já entraram, quantas usaram nos últimos 7 dias
 * e quantas têm notificações ativas — no total e por turma. Sem dependências de servidor.
 *
 * Unidade principal: o ALUNO (a família dele está "no app" se ao menos um responsável
 * vinculado entrou/usou/ativou avisos). Assim, mãe e pai do mesmo aluno não contam em dobro.
 * Uso = criação de sessão (login ou renovação, que acontece a cada abertura do app depois de
 * 15 min sem uso), lida do RefreshToken, que nunca é apagado.
 */

export const JANELA_ATIVO_DIAS = 7;
const DIA_MS = 24 * 60 * 60 * 1000;
/** Brasília é UTC−3 o ano todo (sem horário de verão desde 2019). */
const FUSO_BRASILIA_MS = 3 * 60 * 60 * 1000;

export interface ResponsavelAdocao {
  id: string;
  primeiroAcesso: Date | null;
  ultimoUso: Date | null;
  notificacoesAtivas: boolean;
}

export interface AlunoAdocao {
  turma: string | null;
  responsaveis: string[];
}

export interface Contagem {
  total: number;
  entraram: number;
  ativos7d: number;
  comAvisos: number;
}

export interface TurmaAdocao extends Contagem {
  turma: string;
}

export interface ResumoAdocao {
  /** Alunos cuja família (algum responsável) entrou / usou em 7 dias / tem avisos. */
  alunos: Contagem;
  /** Responsáveis contados um a um. */
  responsaveis: Contagem;
  turmas: TurmaAdocao[];
}

export function ativoRecente(ultimoUso: Date | null, agora: Date): boolean {
  return Boolean(ultimoUso && agora.getTime() - ultimoUso.getTime() < JANELA_ATIVO_DIAS * DIA_MS);
}

function vazio(): Contagem {
  return { total: 0, entraram: 0, ativos7d: 0, comAvisos: 0 };
}

export function resumoAdocao(responsaveis: ResponsavelAdocao[], alunos: AlunoAdocao[], agora = new Date()): ResumoAdocao {
  const porId = new Map(responsaveis.map((r) => [r.id, r]));

  const resp = vazio();
  for (const r of responsaveis) {
    resp.total++;
    if (r.primeiroAcesso) resp.entraram++;
    if (ativoRecente(r.ultimoUso, agora)) resp.ativos7d++;
    if (r.notificacoesAtivas) resp.comAvisos++;
  }

  const total = vazio();
  const turmas = new Map<string, TurmaAdocao>();
  for (const a of alunos) {
    const nomeTurma = a.turma?.trim() || "Sem turma";
    const t = turmas.get(nomeTurma) ?? { turma: nomeTurma, ...vazio() };
    turmas.set(nomeTurma, t);
    const dele = a.responsaveis.map((id) => porId.get(id)).filter((r): r is ResponsavelAdocao => Boolean(r));
    const entrou = dele.some((r) => r.primeiroAcesso);
    const ativo = dele.some((r) => ativoRecente(r.ultimoUso, agora));
    const avisos = dele.some((r) => r.notificacoesAtivas);
    for (const c of [total, t]) {
      c.total++;
      if (entrou) c.entraram++;
      if (ativo) c.ativos7d++;
      if (avisos) c.comAvisos++;
    }
  }

  return {
    alunos: total,
    responsaveis: resp,
    turmas: [...turmas.values()].sort((x, y) => x.turma.localeCompare(y.turma, "pt-BR", { numeric: true })),
  };
}

/** Segunda-feira (data em Brasília, "AAAA-MM-DD") da semana do instante dado. */
export function inicioSemana(instante: Date): string {
  const local = new Date(instante.getTime() - FUSO_BRASILIA_MS);
  const diasDesdeSegunda = (local.getUTCDay() + 6) % 7;
  return new Date(local.getTime() - diasDesdeSegunda * DIA_MS).toISOString().slice(0, 10);
}

/**
 * Responsáveis distintos que usaram o app em cada semana (segunda a domingo, Brasília),
 * das `semanas` mais recentes, da mais antiga para a atual (a atual pode estar incompleta).
 */
export function usoPorSemana(sessoes: { userId: string; createdAt: Date }[], agora = new Date(), semanas = 8): { semana: string; ativos: number }[] {
  const atual = inicioSemana(agora);
  const chaves: string[] = [];
  for (let i = semanas - 1; i >= 0; i--) {
    chaves.push(new Date(Date.parse(`${atual}T00:00:00Z`) - i * 7 * DIA_MS).toISOString().slice(0, 10));
  }
  const usuarios = new Map(chaves.map((c) => [c, new Set<string>()]));
  for (const s of sessoes) usuarios.get(inicioSemana(s.createdAt))?.add(s.userId);
  return chaves.map((semana) => ({ semana, ativos: usuarios.get(semana)!.size }));
}

/** Percentual inteiro (0 quando não há base). */
export function percentual(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/** Mensagem para a escola mandar do próprio WhatsApp pedindo para ativar as notificações. */
export function mensagemAtivarAvisos(nome: string, linkGuia: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] || nome;
  return [
    `Olá, ${primeiro}! Aqui é da escola.`,
    "Para você saber na hora quando chega comunicado, mensagem, boleto ou a rotina do dia, ative as notificações do ClassLink:",
    "1. Abra o ClassLink pelo ícone na tela do celular (no iPhone, primeiro instale: Compartilhar > Adicionar à Tela de Início);",
    "2. Toque no seu nome, no fim do menu (Minha conta);",
    '3. Toque em "Ativar notificações" e depois em "Permitir".',
    `Passo a passo com imagens: ${linkGuia}`,
  ].join("\n");
}
