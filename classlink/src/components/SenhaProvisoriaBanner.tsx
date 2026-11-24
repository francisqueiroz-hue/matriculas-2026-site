"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";

/**
 * Quem entrou com a senha provisória (enviada pela escola ou pelo "esqueci a senha") vê um
 * convite para trocar por uma senha própria, mais fácil de lembrar. Não bloqueia o uso do app:
 * some sozinho quando a pessoa troca a senha em Minha conta.
 */
export function SenhaProvisoriaBanner() {
  const user = useCurrentUser();
  const pathname = usePathname();
  if (!user.senhaProvisoria) return null;
  const naConta = pathname === "/dashboard/conta";

  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="text-sm">
        <strong>Você entrou com uma senha provisória.</strong> Troque por uma senha sua, fácil de lembrar, para os próximos
        acessos.
      </p>
      <Link
        href={naConta ? "#trocar-senha" : "/dashboard/conta#trocar-senha"}
        className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-center text-sm font-semibold text-white hover:bg-amber-700"
      >
        Trocar senha agora
      </Link>
    </div>
  );
}
