"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiFetch } from "@/lib/api-client";

const baseLinks = [
  { href: "/dashboard/mural", label: "Mural" },
  { href: "/dashboard/comunicados", label: "Comunicados" },
  { href: "/dashboard/mensagens", label: "Mensagens" },
  { href: "/dashboard/agenda", label: "Agenda" },
];

const guardianLinks = [{ href: "/dashboard/financeiro", label: "Financeiro" }];

const adminLinks = [
  { href: "/dashboard/admin", label: "Painel" },
  { href: "/dashboard/admin/turmas", label: "Turmas" },
  { href: "/dashboard/admin/alunos", label: "Alunos" },
  { href: "/dashboard/admin/usuarios", label: "Usuários" },
  { href: "/dashboard/admin/financeiro", label: "Financeiro" },
];

export function Navbar() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();

  const links =
    user.role === "ADMIN"
      ? [...baseLinks, ...adminLinks]
      : user.role === "GUARDIAN"
        ? [...baseLinks, ...guardianLinks]
        : baseLinks;

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <img src="/logos/logo-espaco-kids.png" alt="Espaço Kids" className="h-9 w-auto object-contain" />
            <span className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <img src="/logos/logo-instituto-fokus.png" alt="Instituto Fokus" className="h-9 w-auto object-contain" />
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/conta" className="text-sm text-slate-500 hover:underline">
            {user.name}
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Sair
          </button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-1.5 sm:hidden dark:border-slate-800">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ${
              pathname === link.href
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : "text-slate-600 dark:text-slate-300"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
