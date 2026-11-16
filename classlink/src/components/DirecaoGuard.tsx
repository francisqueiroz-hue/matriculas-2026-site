"use client";

import { useCurrentUser } from "@/components/UserContext";
import { ehDirecao } from "@/lib/equipe";

/**
 * Financeiro, contratos (com valores) e lembretes de cobrança: só a direção. A tela não carrega
 * nada para os demais (o servidor também recusa cada chamada).
 */
export function DirecaoGuard({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  if (!ehDirecao({ role: user.role, funcao: user.funcao ?? null })) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">
        <p className="font-semibold">Área restrita à direção.</p>
        <p className="mt-1">
          Financeiro, mensalidades e contratos ficam só com a direção. Se uma família pedir o contrato ou o boleto, peça à direção
          para enviar diretamente.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
