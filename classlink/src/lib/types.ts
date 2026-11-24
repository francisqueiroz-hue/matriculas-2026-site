import type { FuncaoEquipe, Role } from "@prisma/client";

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  schoolId: string;
  schoolName: string;
  isCoordenacao: boolean;
  /** Áreas desligadas pela direção para este perfil (tela Configurações). Some do menu e da tela. */
  areasBloqueadas?: string[];
  /** Função na equipe (Direção, Secretaria...). Só a Direção vê financeiro e contratos. */
  funcao?: FuncaoEquipe | null;
  /** Entrou com senha provisória: o app sugere trocar por uma senha da própria pessoa. */
  senhaProvisoria?: boolean;
}
