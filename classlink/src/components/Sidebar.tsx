"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { NavIcon } from "@/components/NavIcon";
import { apiFetch } from "@/lib/api-client";
import { agruparLinks, getNavLinks, useComunicadosPendentes } from "@/lib/nav-links";
import { useMensagensNaoLidas } from "@/components/AvisosMensagens";
import { LogoEspacoKids, LogoInstitutoFokus } from "@/components/Logos";

export function Sidebar() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const comunicadosPendentes = useComunicadosPendentes(user.role);
  const mensagensNaoLidas = useMensagensNaoLidas().total;

  const grupos = agruparLinks(getNavLinks(user));

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden sm:sticky sm:top-0 sm:flex sm:h-screen sm:w-60 sm:shrink-0 sm:flex-col sm:border-r sm:border-slate-200 sm:bg-white">
      <div className="flex items-center justify-center gap-3 border-b border-slate-200 px-4 py-4">
        <LogoEspacoKids className="h-12" />
        <LogoInstitutoFokus className="h-12" />
      </div>

      <nav aria-label="Menu principal" className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {grupos.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{grupo.titulo}</p>
            <div className="space-y-1">
              {grupo.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    pathname === link.href ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <NavIcon path={link.icon} />
                    {link.label}
                  </span>
                  {link.href === "/dashboard/comunicados" && comunicadosPendentes > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
                      {comunicadosPendentes}
                    </span>
                  )}
                  {link.href === "/dashboard/mensagens" && mensagensNaoLidas > 0 && (
                    <span
                      aria-label={`${mensagensNaoLidas} mensagem(ns) não lida(s)`}
                      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white"
                    >
                      {mensagensNaoLidas}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3">
        <Link href="/dashboard/conta" className="block truncate text-sm text-slate-500 hover:underline">
          {user.name}
        </Link>
        <button type="button"
          onClick={handleLogout}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
