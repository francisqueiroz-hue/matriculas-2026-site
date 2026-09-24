"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiFetch } from "@/lib/api-client";
import { getNavLinks, useComunicadosPendentes } from "@/lib/nav-links";

export function Navbar() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const comunicadosPendentes = useComunicadosPendentes(user.role);
  const [open, setOpen] = useState(false);

  const links = getNavLinks(user);

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur sm:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <img src="/logos/logo-espaco-kids.png" alt="Espaço Kids" className="h-8 w-auto object-contain" />
          <img src="/logos/logo-instituto-fokus.png" alt="Instituto Fokus" className="h-8 w-auto object-contain" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100"
        >
          {open ? "✕" : "☰"}
          {!open && comunicadosPendentes > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {comunicadosPendentes}
            </span>
          )}
        </button>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 bg-black/20"
          />
          <nav className="relative z-20 max-h-[70vh] overflow-y-auto border-t border-slate-200 bg-white px-2 py-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium ${
                  pathname === link.href ? "bg-indigo-100 text-indigo-700" : "text-slate-700 hover:bg-slate-100"
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
            <div className="mt-2 border-t border-slate-100 px-3 pt-2">
              <Link
                href="/dashboard/conta"
                onClick={() => setOpen(false)}
                className="block py-1.5 text-sm text-slate-500 hover:underline"
              >
                {user.name}
              </Link>
              <button
                onClick={handleLogout}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Sair
              </button>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
