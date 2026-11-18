import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/types";
import { apiJson } from "@/lib/api-client";
import { situacaoDoComunicado } from "@/lib/comunicados-situacao";
import { ehDirecao } from "@/lib/equipe";
import { telaBloqueada } from "@/lib/visibilidade";

export interface NavLink {
  href: string;
  label: string;
  /** Path de um ícone de 24x24 (mesmo estilo usado em /guia), pra ficar mais fácil de reconhecer o item de relance. */
  icon: string;
  /** Seção do menu, quando a mesma tela fica em seções diferentes conforme o perfil. */
  grupo?: string;
}

const baseLinks: NavLink[] = [
  { href: "/dashboard/mural", label: "Mural", icon: "M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h4" },
  {
    href: "/dashboard/comunicados",
    label: "Comunicados",
    icon: "M5 8a3 3 0 013-3h3l3-3v6l-3-3H8 M13 8h3l3 3v6l-3-3h-3",
  },
  {
    href: "/dashboard/enquetes",
    label: "Enquetes",
    icon: "M9 11l3 3 8-8 M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9",
  },
  {
    href: "/dashboard/mensagens",
    label: "Mensagens",
    icon: "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 20l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
  },
  { href: "/dashboard/agenda", label: "Agenda", icon: "M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4" },
  {
    href: "/dashboard/cardapio",
    label: "Cardápio",
    icon: "M7 3v8 M5 3v4a2 2 0 004 0V3 M7 11v10 M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4v9",
  },
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
  { href: "/dashboard/contratos", label: "Contratos", icon: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z M14 3v5h5 M9 13h6 M9 17h4" },
  saudeLink(),
  rotinaLink(),
];

/** Rotina diária: direção, secretaria e coordenação preenchem; a família vê a dos próprios filhos. */
function rotinaLink(grupo?: string): NavLink {
  return {
    ...(grupo && { grupo }),
    href: "/dashboard/rotina",
    label: "Rotina",
    icon: "M12 21a9 9 0 100-18 9 9 0 000 18z M12 7v5l3 2",
  };
}

/** Ficha de saúde e autorizados: famílias (os próprios filhos), direção e coordenação. */
function saudeLink(grupo?: string): NavLink {
  return {
    ...(grupo && { grupo }),
    href: "/dashboard/saude",
    label: "Saúde e autorizados",
    icon: "M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z M12 10v5 M9.5 12.5h5",
  };
}

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
    label: "Equipe",
    icon: "M12 12a4 4 0 100-8 4 4 0 000 8z M4 20c1-4 4-6 8-6s7 2 8 6",
  },
  {
    href: "/dashboard/admin/acessos",
    label: "Acessos",
    icon: "M15 7a3 3 0 11-6 0 3 3 0 016 0z M4 20c1-4 4-6 8-6 M16 16l2 2 4-4",
  },
  {
    href: "/dashboard/admin/matriculas",
    label: "Matrículas",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2 M9 5a2 2 0 012-2h2a2 2 0 012 2 M9 14l2 2 4-4",
  },
  {
    href: "/dashboard/admin/rematricula",
    label: "Rematrícula",
    icon: "M4 12a8 8 0 0114-5.3 M18 3v4h-4 M20 12a8 8 0 01-14 5.3 M6 21v-4h4",
  },
  { href: "/dashboard/admin/contratos", label: "Contratos", icon: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z M14 3v5h5 M9 13h6 M9 17h4" },
  {
    href: "/dashboard/admin/financeiro",
    label: "Financeiro",
    icon: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M3 10h18 M7 15h3",
  },
  {
    href: "/dashboard/admin/configuracoes",
    label: "Configurações",
    icon: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",
  },
  {
    href: "/dashboard/admin/lembretes",
    label: "Lembretes",
    icon: "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 01-3.4 0",
  },
];

const notasLink: NavLink = {
  href: "/dashboard/notas",
  label: "Notas",
  icon: "M9 4h9v16H9a3 3 0 01-3-3V7a3 3 0 013-3z M11 9h5 M11 13h5",
};

/** Seções do menu lateral: agrupam os itens por assunto para a pessoa achar rápido o que procura. */
const GRUPO_POR_HREF: Record<string, string> = {
  "/dashboard/mural": "Comunicação",
  "/dashboard/comunicados": "Comunicação",
  "/dashboard/enquetes": "Comunicação",
  "/dashboard/mensagens": "Comunicação",
  "/dashboard/agenda": "Dia a dia",
  "/dashboard/cardapio": "Dia a dia",
  "/dashboard/frequencia": "Dia a dia",
  "/dashboard/boletim": "Meu(s) filho(s)",
  "/dashboard/financeiro": "Meu(s) filho(s)",
  "/dashboard/contratos": "Meu(s) filho(s)",
  "/dashboard/saude": "Meu(s) filho(s)",
  "/dashboard/rotina": "Meu(s) filho(s)",
  "/dashboard/notas": "Pedagógico",
  "/dashboard/fichas": "Secretaria",
  "/dashboard/alunos": "Secretaria",
  "/guia": "Ajuda",
};

export interface GrupoNav {
  titulo: string;
  links: NavLink[];
}

/** Divide os links em seções, mantendo a ordem. O que não tem seção definida (área da direção) vai para "Gestão". */
export function agruparLinks(links: NavLink[]): GrupoNav[] {
  const grupos: GrupoNav[] = [];
  for (const link of links) {
    const titulo = link.grupo ?? GRUPO_POR_HREF[link.href] ?? "Gestão";
    const existente = grupos.find((g) => g.titulo === titulo);
    if (existente) existente.links.push(link);
    else grupos.push({ titulo, links: [link] });
  }
  return grupos;
}

const fichasLink: NavLink = {
  href: "/dashboard/fichas",
  label: "Fichas de matrícula",
  icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2z M9 12h6 M9 16h4",
};

/** Consulta rápida de aluno para a coordenação (a direção usa a tela Alunos da Gestão). */
const consultaAlunosLink: NavLink = {
  href: "/dashboard/alunos",
  label: "Alunos",
  icon: "M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z M16 16l5 5",
};

/** Guia do app (instalação e uso), para todos: é também o link que a escola manda às famílias. */
const guiaLink: NavLink = {
  href: "/guia",
  label: "Guia do app",
  icon: "M12 21a9 9 0 100-18 9 9 0 000 18z M9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4 M12 17h.01",
};

/** Abas da administração que só a direção vê: financeiro, contratos (com valores), lembretes de cobrança e Configurações (visibilidade). */
export const ABAS_SO_DIRECAO = [
  "/dashboard/admin/contratos",
  "/dashboard/admin/financeiro",
  "/dashboard/admin/lembretes",
  "/dashboard/admin/configuracoes",
];

/**
 * Notas fica visível só para direção/secretaria (ADMIN) e coordenação (STAFF com isCoordenacao).
 * Financeiro, Contratos, Lembretes e Configurações só para a direção (o servidor também bloqueia).
 * Áreas desligadas pela direção em Configurações somem do menu (o servidor também bloqueia).
 */
export function getNavLinks(user: Pick<SessionUser, "role" | "isCoordenacao" | "funcao" | "areasBloqueadas">): NavLink[] {
  return linksDoPerfil(user).filter((l) => !telaBloqueada(l.href, user.areasBloqueadas));
}

function linksDoPerfil(user: Pick<SessionUser, "role" | "isCoordenacao" | "funcao">): NavLink[] {
  if (user.role === "ADMIN") {
    const direcao = ehDirecao({ role: user.role, funcao: user.funcao ?? null });
    const admin = direcao ? adminLinks : adminLinks.filter((l) => !ABAS_SO_DIRECAO.includes(l.href));
    return [...baseLinks, notasLink, ...admin, fichasLink, saudeLink("Secretaria"), rotinaLink("Secretaria"), guiaLink];
  }
  if (user.role === "GUARDIAN") return [...baseLinks, ...guardianLinks, guiaLink];
  if (user.role === "STAFF" && user.isCoordenacao) return [...baseLinks, notasLink, consultaAlunosLink, fichasLink, saudeLink("Secretaria"), rotinaLink("Secretaria"), guiaLink];
  if (user.role === "STAFF") return [...baseLinks, fichasLink, guiaLink];
  return [...baseLinks, guiaLink];
}

interface ComunicadoResumo {
  tipo?: string;
  dataCriacao: string;
  prazoResposta: string | null;
  minhasRespostas?: { alunoId: string; resposta: string }[];
  alunosAlvo?: number;
  lidoEm?: string | null;
}

/**
 * Quantidade de comunicados que ainda precisam de ação do usuário atual. Só a família tem número
 * no menu: para a equipe, quem abriu ou respondeu fica no detalhe de cada comunicado (comprovante
 * de leitura), sem número no menu.
 */
export function countPendentes(comunicados: ComunicadoResumo[], role: string): number {
  if (role !== "GUARDIAN") return 0;
  // Mesma regra dos cards da lista: conta só o que ainda espera resposta ou leitura (irmãos incluídos).
  return comunicados.filter((c) => situacaoDoComunicado(c) === "PENDENTE").length;
}

/** Contagem de comunicados pendentes da família, usada no badge do menu (mobile e desktop). */
export function useComunicadosPendentes(role: string) {
  const [count, setCount] = useState(0);
  // O menu fica montado entre as telas: recontar ao entrar/sair das telas de comunicados, senão o
  // número continua o mesmo depois que a família abre ou responde um. Nas demais telas, não refaz.
  const pathname = usePathname() ?? "";
  const telaComunicados = pathname.startsWith("/dashboard/comunicados") ? pathname : "";

  useEffect(() => {
    if (role !== "GUARDIAN") return; // equipe não tem número no menu: nem consulta
    apiJson<{ comunicados: ComunicadoResumo[] }>("/api/comunicados")
      .then((data) => setCount(countPendentes(data.comunicados, role)))
      .catch(() => setCount(0));
  }, [role, telaComunicados]);

  return count;
}
