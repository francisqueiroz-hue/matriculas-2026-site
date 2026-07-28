import type { SessionUser } from "@/lib/types";

export interface NavLink {
  href: string;
  label: string;
}

const baseLinks: NavLink[] = [
  { href: "/dashboard/mural", label: "Mural" },
  { href: "/dashboard/comunicados", label: "Comunicados" },
  { href: "/dashboard/mensagens", label: "Mensagens" },
  { href: "/dashboard/agenda", label: "Agenda" },
];

const guardianLinks: NavLink[] = [
  { href: "/dashboard/boletim", label: "Boletim" },
  { href: "/dashboard/financeiro", label: "Financeiro" },
];

const adminLinks: NavLink[] = [
  { href: "/dashboard/admin", label: "Painel" },
  { href: "/dashboard/admin/turmas", label: "Turmas" },
  { href: "/dashboard/admin/alunos", label: "Alunos" },
  { href: "/dashboard/admin/usuarios", label: "Usuários" },
  { href: "/dashboard/admin/financeiro", label: "Financeiro" },
];

const notasLink: NavLink = { href: "/dashboard/notas", label: "Notas" };

/** Notas fica visível só para direção (ADMIN) e coordenação (STAFF com isCoordenacao). */
export function getNavLinks(user: Pick<SessionUser, "role" | "isCoordenacao">): NavLink[] {
  if (user.role === "ADMIN") return [...baseLinks, notasLink, ...adminLinks];
  if (user.role === "GUARDIAN") return [...baseLinks, ...guardianLinks];
  if (user.role === "STAFF" && user.isCoordenacao) return [...baseLinks, notasLink];
  return baseLinks;
}
