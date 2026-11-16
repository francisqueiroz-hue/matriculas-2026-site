import type { Role } from "@prisma/client";

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
}
