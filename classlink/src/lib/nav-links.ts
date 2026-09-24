import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/types";
import { apiJson } from "@/lib/api-client";

export interface NavLink {
  href: string;
  label: string;
  /** Path de um ícone de 24x24 (mesmo estilo usado em /guia), pra ficar mais fácil de reconhecer o item de relance. */
  icon: string;
}

const baseLinks: NavLink[] = [
  { href: "/dashboard/mural", label: "Mural", icon: "M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h4" },
  {
    href: "/dashboard/comunicados",
    label: "Comunicados",
    icon: "M5 8a3 3 0 013-3h3l3-3v6l-3-3H8 M13 8h3l3 3v6l-3-3h-3",
  },
  {
    href: "/dashboard/mensagens",
    label: "Mensagens",
    icon: "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 20l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
  },
  { href: "/dashboard/agenda", label: "Agenda", icon: "M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4" },
  {
    href: "/dashboard/frequencia",
    label: "Frequência",
    icon: "M9 12l2 2 4-4 M12 21a9 9 0 100-18 9 9 0 000 18z",
  },
];

const guardianLinks: NavLink[] = [
  { href: "/dashboard/boletim", label: "Boletim", icon: "M12 15a5 5 0 100-10 5 5 0 000 10z M9 14l-2 6 5-3 5 3-2-6" },
  {
    href: "/dashboard/financeiro",
    label: "Financeiro",
    icon: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M3 10h18 M7 15h3",
  },
];

const adminLinks: NavLink[] = [
  { href: "/dashboard/admin", label: "Painel", icon: "M4 4h7v7H4z M13 4h7v5h-7z M13 12h7v8h-7z M4 14h7v6H4z" },
  {
    href: "/dashboard/admin/turmas",
    label: "Turmas",
    icon: "M8 12a3 3 0 100-6 3 3 0 000 6z M16 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M2.5 20c.5-3.5 3-6 5.5-6s5 2.5 5.5 6 M14.5 14.3c2.3.4 4 2.3 4.5 5.7",
  },
  {
    href: "/dashboard/admin/alunos",
    label: "Alunos",
    icon: "M9 4a3 3 0 016 0v2h1a2 2 0 012 2v11a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2h1V4z M9 11h6 M12 11v4",
  },
  {
    href: "/dashboard/admin/usuarios",
    label: "Usuários",
    icon: "M12 12a4 4 0 100-8 4 4 0 000 8z M4 20c1-4 4-6 8-6s7 2 8 6",
  },
  {
    href: "/dashboard/admin/financeiro",
    label: "Financeiro",
    icon: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M3 10h18 M7 15h3",
  },
];

const notasLink: NavLink = {
  href: "/dashboard/notas",
  label: "Notas",
  icon: "M9 4h9v16H9a3 3 0 01-3-3V7a3 3 0 013-3z M11 9h5 M11 13h5",
};

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
