"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiFetch, apiJson } from "@/lib/api-client";
import { getNavLinks } from "@/lib/nav-links";

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

export function Sidebar() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const [comunicadosPendentes, setComunicadosPendentes] = useState(0);

  useEffect(() => {
    apiJson<{ comunicados: ComunicadoResumo[] }>("/api/comunicados")
      .then((data) => setComunicadosPendentes(countPendentes(data.comunicados, user.role)))
      .catch(() => setComunicadosPendentes(0));
  }, [user.role]);

  const links = getNavLinks(user);

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden sm:sticky sm:top-0 sm:flex sm:h-screen sm:w-60 sm:shrink-0 sm:flex-col sm:border-r sm:border-slate-200 sm:bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
        <img src="/logos/logo-espaco-kids.png" alt="Espaço Kids" className="h-8 w-auto object-contain" />
        <img src="/logos/logo-instituto-fokus.png" alt="Instituto Fokus" className="h-8 w-auto object-contain" />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname === link.href ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>{link.label}</span>
            {link.href === "/dashboard/comunicados" && comunicadosPendentes > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
                {comunicadosPendentes}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3">
        <Link href="/dashboard/conta" className="block truncate text-sm text-slate-500 hover:underline">
          {user.name}
        </Link>
        <button
          onClick={handleLogout}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
