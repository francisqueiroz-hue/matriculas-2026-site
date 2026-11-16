import type { FuncaoEquipe, Role } from "@prisma/client";

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  schoolId: string;
  schoolName: string;
  isCoordenacao: boolean;
  /** Função na equipe (Direção, Secretaria...). Só a Direção vê financeiro e contratos. */
  funcao?: FuncaoEquipe | null;
}
