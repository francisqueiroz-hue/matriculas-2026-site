"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { NavIcon } from "@/components/NavIcon";
import { MENSAGEM_LOGOUT_NAO_CONFIRMADO, sairDaConta } from "@/lib/logout-client";
import { agruparLinks, getNavLinks, useComunicadosPendentes } from "@/lib/nav-links";
import { useMensagensNaoLidas } from "@/components/AvisosMensagens";
import { LogoEspacoKids, LogoInstitutoFokus } from "@/components/Logos";

const RECOLHIDO_KEY = "classlink-menu-recolhido";

/**
 * Menu lateral (tablet/computador). Depois de escolher uma função ele se recolhe numa barra
 * só com ícones, deixando a tela para o conteúdo; o botão do topo abre de novo. A escolha
 * fica guardada no aparelho.
 */
export function Sidebar() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const comunicadosPendentes = useComunicadosPendentes(user.role);
  const mensagensNaoLidas = useMensagensNaoLidas().total;
  const [recolhido, setRecolhido] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const grupos = agruparLinks(getNavLinks(user));

  useEffect(() => {
    // localStorage só existe no navegador: lido depois da montagem.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(RECOLHIDO_KEY) === "1") setRecolhido(true);
    } catch {
      // sem armazenamento: começa aberto
    }
  }, []);

  function definirRecolhido(valor: boolean) {
    setRecolhido(valor);
    try {
      localStorage.setItem(RECOLHIDO_KEY, valor ? "1" : "0");
    } catch {
      // ignora
    }
  }

  async function handleLogout() {
    if (saindo) return;
    setSaindo(true);
    // Revoga a sessão e limpa o aparelho (token de push e caches). Sem confirmação do
    // servidor os cookies ficam e o login devolveria ao painel: avisa e deixa tentar de novo.
    const confirmado = await sairDaConta();
    if (!confirmado) {
      setSaindo(false);
      window.alert(MENSAGEM_LOGOUT_NAO_CONFIRMADO);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  const contador = (href: string) =>
    href === "/dashboard/comunicados" ? comunicadosPendentes : href === "/dashboard/mensagens" ? mensagensNaoLidas : 0;

  if (recolhido) {
    return (
      <aside className="hidden sm:sticky sm:top-0 sm:flex sm:h-screen sm:w-16 sm:shrink-0 sm:flex-col sm:items-center sm:border-r sm:border-slate-200 sm:bg-white">
        <button
          type="button"
          onClick={() => definirRecolhido(false)}
          aria-label="Abrir menu"
          aria-expanded={false}
          title="Abrir menu"
          className="mt-3 flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100"
        >
          ☰
        </button>
        <nav aria-label="Menu principal" className="mt-3 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {grupos.flatMap((g) => g.links).map((link) => {
            const n = contador(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.label}
                aria-label={n > 0 ? `${link.label} (${n})` : link.label}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                  pathname === link.href ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <NavIcon path={link.icon} />
                {n > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {n}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/dashboard/conta"
          title={`Minha conta (${user.name})`}
          aria-label="Minha conta"
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
        >
          <NavIcon path="M12 12a4 4 0 100-8 4 4 0 000 8z M4 20c1-4 4-6 8-6s7 2 8 6" />
        </Link>
      </aside>
    );
  }

  return (
    <aside className="hidden sm:sticky sm:top-0 sm:flex sm:h-screen sm:w-60 sm:shrink-0 sm:flex-col sm:border-r sm:border-slate-200 sm:bg-white">
      <div className="relative flex items-center justify-center gap-3 border-b border-slate-200 px-4 py-4">
        <LogoEspacoKids className="h-12" />
        <LogoInstitutoFokus className="h-12" />
        <button
          type="button"
          onClick={() => definirRecolhido(true)}
          aria-label="Recolher menu"
          aria-expanded={true}
          title="Recolher menu"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          «
        </button>
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
                  // Escolheu a função: o menu se recolhe e a tela fica para o conteúdo.
                  onClick={() => definirRecolhido(true)}
                  aria-current={pathname === link.href ? "page" : undefined}
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
        <Link href="/dashboard/conta" onClick={() => definirRecolhido(true)} className="block truncate text-sm text-slate-500 hover:underline">
          {user.name}
        </Link>
        <button type="button"
          onClick={handleLogout}
          disabled={saindo}
          aria-busy={saindo}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
        >
          {saindo ? "Saindo…" : "Sair"}
        </button>
      </div>
    </aside>
  );
}
