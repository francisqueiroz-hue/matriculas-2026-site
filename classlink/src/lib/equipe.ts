import type { FuncaoEquipe, Role } from "@prisma/client";

export const FUNCOES_EQUIPE: FuncaoEquipe[] = ["DIRECAO", "COORDENACAO", "PROFESSOR", "AUXILIAR"];

export const FUNCAO_LABEL: Record<FuncaoEquipe, string> = {
  DIRECAO: "Direção",
  COORDENACAO: "Coordenação",
  PROFESSOR: "Professor(a)",
  AUXILIAR: "Auxiliar",
};

/** Perfil de acesso correspondente à função: direção administra; coordenação lança notas. */
export function perfilDaFuncao(funcao: FuncaoEquipe): { role: Role; isCoordenacao: boolean } {
  if (funcao === "DIRECAO") return { role: "ADMIN", isCoordenacao: false };
  return { role: "STAFF", isCoordenacao: funcao === "COORDENACAO" };
}

/** Função para exibir — cadastros antigos (sem função) deduzem pelo perfil. */
export function funcaoDoUsuario(user: { funcao: FuncaoEquipe | null; role: Role; isCoordenacao: boolean }): FuncaoEquipe | null {
  if (user.funcao) return user.funcao;
  if (user.role === "ADMIN") return "DIRECAO";
  if (user.role === "STAFF") return user.isCoordenacao ? "COORDENACAO" : "PROFESSOR";
  return null;
}
