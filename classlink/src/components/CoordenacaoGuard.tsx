"use client";

import { useCurrentUser } from "@/components/UserContext";

/** Lançamento de notas: só direção (ADMIN) ou coordenação (STAFF marcado como tal). */
export function CoordenacaoGuard({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  if (user.role !== "ADMIN" && !(user.role === "STAFF" && user.isCoordenacao)) {
    return <p className="text-sm text-slate-500">Área restrita à direção e à coordenação pedagógica.</p>;
  }
  return <>{children}</>;
}
