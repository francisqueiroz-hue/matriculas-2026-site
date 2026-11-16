"use client";

import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { MENSAGEM_AREA_DESATIVADA, telaBloqueada } from "@/lib/visibilidade";

/**
 * Mostra um aviso no lugar da tela quando a direção desligou a área para o perfil da pessoa
 * (tela Configurações). É só conforto: os dados já são negados pelo servidor (`exigirArea`).
 */
export function GuardaVisibilidade({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const pathname = usePathname() ?? "";
  if (telaBloqueada(pathname, user.areasBloqueadas)) {
    return (
      <div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="font-semibold">{MENSAGEM_AREA_DESATIVADA}</p>
        <p className="mt-1 text-sm text-slate-500">Se precisar deste acesso, fale com a direção.</p>
      </div>
    );
  }
  return <>{children}</>;
}
