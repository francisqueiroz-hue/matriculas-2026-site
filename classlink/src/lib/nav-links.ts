import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/types";
import { apiJson } from "@/lib/api-client";

export interface NavLink {
  href: string;
  label: string;
}

const baseLinks: NavLink[] = [
  { href: "/dashboard/mural", label: "Mural" },
  { href: "/dashboard/comunicados", label: "Comunicados" },
  { href: "/dashboard/mensagens", label: "Mensagens" },
  { href: "/dashboard/agenda", label: "Agenda" },
  { href: "/dashboard/frequencia", label: "Frequência" },
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

interface ComunicadoResumo {
  prazoResposta: string | null;
  minhasRespostas?: { alunoId: string; resposta: string }[];
  totalRespostas?: number;
  totalPublicoAlvo?: number;
}

/** Quantidade de comunicados que ainda precisam de ação do usuário atual (resposta pendente e não expirada). */
function countPendentes(comunicados: ComunicadoResumo[], role: string): number {
  const agora = Date.now();
  return comunicados.filter((c) => {
    const expirado = c.prazoResposta ? new Date(c.prazoResposta).getTime() < agora : false;
    if (expirado) return false;
    if (role === "GUARDIAN") return (c.minhasRespostas?.length ?? 0) === 0;
    return typeof c.totalRespostas === "number" && typeof c.totalPublicoAlvo === "number" && c.totalRespostas < c.totalPublicoAlvo;
  }).length;
}

/** Contagem de comunicados pendentes de resposta, usada no badge do menu (mobile e desktop). */
export function useComunicadosPendentes(role: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    apiJson<{ comunicados: ComunicadoResumo[] }>("/api/comunicados")
      .then((data) => setCount(countPendentes(data.comunicados, role)))
      .catch(() => setCount(0));
  }, [role]);

  return count;
}
