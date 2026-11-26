import type { FuncaoEquipe, Role } from "@prisma/client";

export const FUNCOES_EQUIPE: FuncaoEquipe[] = ["DIRECAO", "SECRETARIA", "COORDENACAO", "PROFESSOR", "AUXILIAR"];

export const FUNCAO_LABEL: Record<FuncaoEquipe, string> = {
  DIRECAO: "Direção",
  SECRETARIA: "Secretaria",
  COORDENACAO: "Coordenação",
  PROFESSOR: "Professor(a)",
  AUXILIAR: "Auxiliar",
};

/**
 * Perfil de acesso correspondente à função: direção e secretaria administram a escola
 * (a secretaria sem financeiro e contratos, ver `ehDirecao`); coordenação lança notas.
 */
export function perfilDaFuncao(funcao: FuncaoEquipe): { role: Role; isCoordenacao: boolean } {
  if (funcao === "DIRECAO" || funcao === "SECRETARIA") return { role: "ADMIN", isCoordenacao: false };
  return { role: "STAFF", isCoordenacao: funcao === "COORDENACAO" };
}

/** Função para exibir — cadastros antigos (sem função) deduzem pelo perfil. */
export function funcaoDoUsuario(user: { funcao: FuncaoEquipe | null; role: Role; isCoordenacao: boolean }): FuncaoEquipe | null {
  if (user.funcao) return user.funcao;
  if (user.role === "ADMIN") return "DIRECAO";
  if (user.role === "STAFF") return user.isCoordenacao ? "COORDENACAO" : "PROFESSOR";
  return null;
}

/**
 * Direção: a única função com acesso ao financeiro (mensalidades, boletos, baixas, conferência),
 * aos contratos (com valores) e aos lembretes de cobrança. Perfil ADMIN com função Direção ou
 * sem função (cadastro antigo de diretor). A Secretaria é ADMIN, mas não é Direção.
 */
export function ehDirecao(user: { role: Role; funcao: FuncaoEquipe | null }): boolean {
  return user.role === "ADMIN" && (user.funcao === null || user.funcao === "DIRECAO");
}

export const MENSAGEM_SO_DIRECAO =
  "Somente a direção tem acesso ao financeiro, às mensalidades e aos contratos. Peça à direção.";

/** Dados do perfil usados nas regras de acesso (lidos do banco, nunca só do token). */
export interface PerfilAcesso {
  role: Role;
  funcao: FuncaoEquipe | null;
  isCoordenacao: boolean;
}

/** Coordenação pedagógica: equipe (STAFF) marcada como coordenação. */
export function ehCoordenacao(user: PerfilAcesso): boolean {
  return user.role === "STAFF" && user.isCoordenacao;
}

/** Auxiliar: equipe com a função Auxiliar (sem coordenação). */
export function ehAuxiliar(user: PerfilAcesso): boolean {
  return user.role === "STAFF" && !user.isCoordenacao && user.funcao === "AUXILIAR";
}

/**
 * Gestão da escola: direção, secretaria (ADMIN) e coordenação. Publica para a escola toda e em
 * qualquer turma, marca frequência de qualquer turma e cuida do que as outras pessoas da equipe
 * criaram. Financeiro, contratos e lembretes continuam só com a direção (`ehDirecao`).
 */
export function ehGestao(user: PerfilAcesso): boolean {
  return user.role === "ADMIN" || ehCoordenacao(user);
}

/** Lançar notas (e cadastrar disciplinas): só direção e coordenação. A secretaria não lança. */
export function podeLancarNotas(user: PerfilAcesso): boolean {
  return ehDirecao(user) || ehCoordenacao(user);
}

/**
 * Professores publicam no mural, comunicados, enquetes e agenda das próprias turmas?
 * Matriz da escola (18/11/2026): professores e auxiliares só veem; quem publica é a gestão.
 * Auxiliares nunca publicam, qualquer que seja este valor.
 */
export const PROFESSORES_PUBLICAM = false;

/** Pode publicar no mural, comunicados, enquetes e agenda (a turma ainda é conferida na rota). */
export function podePublicar(user: PerfilAcesso): boolean {
  if (ehGestao(user)) return true;
  return PROFESSORES_PUBLICAM && user.role === "STAFF" && !ehAuxiliar(user);
}

export const MENSAGEM_SO_NOTAS = "Somente a direção e a coordenação lançam notas.";
export const MENSAGEM_SO_GESTAO_PUBLICA = "Somente a direção, a secretaria e a coordenação publicam aqui.";
export const MENSAGEM_SO_GESTAO_ESCOLA = "Somente a direção, a secretaria e a coordenação publicam para toda a escola.";

/** Perfil a partir do usuário da tela (UserContext) ou de um cadastro com campos opcionais. */
export function perfilAcessoDe(user: { role: string; funcao?: FuncaoEquipe | null; isCoordenacao?: boolean | null }): PerfilAcesso {
  return { role: user.role as Role, funcao: user.funcao ?? null, isCoordenacao: Boolean(user.isCoordenacao) };
}

/** Direção (sem a secretaria) ou coordenação. */
export function ehDirecaoOuCoordenacao(user: PerfilAcesso): boolean {
  return ehDirecao(user) || ehCoordenacao(user);
}

/**
 * Responde as enquetes internas (regra do Francis, 18/11/2026): professores, auxiliares,
 * coordenação e secretaria. A direção cria e acompanha; quem criou a enquete não responde a
 * própria (ver `respondeEstaEnquete`).
 */
export function respondeEnqueteInterna(user: PerfilAcesso): boolean {
  if (user.role === "STAFF") return user.funcao !== "DIRECAO";
  if (user.role === "ADMIN") return user.funcao === "SECRETARIA";
  return false;
}

/** Criar enquete interna (para a equipe): só direção e coordenação. */
export const podeCriarEnqueteInterna = ehDirecaoOuCoordenacao;

/** Escrever para toda a equipe (Mensagens): só direção e coordenação; todos da equipe respondem. */
export const podeEscreverParaEquipe = ehDirecaoOuCoordenacao;

/** Exportar o boletim em PDF para impressão: só direção e coordenação (famílias e professores só consultam). */
export const podeExportarBoletim = ehDirecaoOuCoordenacao;

export const MENSAGEM_SO_DIRECAO_COORDENACAO_ENQUETE_INTERNA = "Somente a direção e a coordenação criam enquetes para a equipe.";
export const MENSAGEM_SO_DIRECAO_COORDENACAO_EQUIPE = "Somente a direção e a coordenação escrevem para toda a equipe.";
export const MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM = "Somente a direção e a coordenação exportam o boletim para impressão.";

/**
 * Histórico escolar (regra do Francis, 26/11/2026): direção e coordenação emitem (preenchem,
 * salvam e geram o PDF); a secretaria só visualiza. Professores, auxiliares e famílias não
 * acessam (o histórico traz notas de todos os anos e dados pessoais).
 */
export const podeVerHistorico = ehGestao;
export const podeEmitirHistorico = ehDirecaoOuCoordenacao;
export const MENSAGEM_SO_GESTAO_HISTORICO = "Somente a direção, a secretaria e a coordenação acessam o histórico escolar.";
export const MENSAGEM_SO_DIRECAO_COORDENACAO_HISTORICO = "Somente a direção e a coordenação emitem o histórico escolar. A secretaria só visualiza.";
