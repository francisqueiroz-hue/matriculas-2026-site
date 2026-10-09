import type { FuncaoEquipe, Role } from "@prisma/client";
import { cargoParaExibir } from "@/lib/permissoes-mensagens";

/**
 * Famílias veem a equipe pelo papel institucional, nunca pelo nome pessoal: o
 * "nome para as famílias" que a pessoa definiu em Conta (ex.: "Secretaria") ou, sem ele,
 * o cargo ("Direção", "Coordenação", "Professor(a)"). Para a equipe, tudo segue com o nome real.
 */
export const SELECT_PESSOA = {
  id: true,
  name: true,
  role: true,
  isCoordenacao: true,
  funcao: true,
  nomeParaFamilias: true,
} as const;

interface Pessoa {
  id: string;
  name: string;
  role: Role;
  isCoordenacao: boolean;
  funcao: FuncaoEquipe | null;
  nomeParaFamilias: string | null;
}

export function nomeInstitucional(p: Omit<Pessoa, "id">): string {
  if (p.role === "GUARDIAN") return p.name;
  return p.nomeParaFamilias?.trim() || cargoParaExibir(p);
}

/** Nome a mostrar para quem está vendo (família → institucional; equipe → nome real). */
export function nomeParaQuemVe(p: Omit<Pessoa, "id">, quemVeRole: Role | string): string {
  return quemVeRole === "GUARDIAN" ? nomeInstitucional(p) : p.name;
}

/** Devolve só { id, name, role } com o nome já ajustado para quem vê. */
export function pessoaParaQuemVe<T extends Pessoa>(p: T, quemVeRole: Role | string) {
  return { id: p.id, name: nomeParaQuemVe(p, quemVeRole), role: p.role };
}
