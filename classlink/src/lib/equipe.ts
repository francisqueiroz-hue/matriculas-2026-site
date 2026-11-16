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
