"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import type { ContratoStatus } from "@/lib/contratos";

interface ContratoResumo {
  status: ContratoStatus;
  student: { name: string };
}

const DISMISS_KEY = "classlink-contratos-pendentes-dismissed";

/**
 * Aviso para o responsável quando há contrato esperando ação dele (assinar, reenviar
 * após devolução ou entregar a via original). Fechar esconde só nesta sessão do navegador —
 * enquanto houver pendência, o aviso volta na próxima visita.
 */
export function ContratosPendentesBanner() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const [pendentes, setPendentes] = useState<ContratoResumo[]>([]);
  const [visivel, setVisivel] = useState(false);

  const ativo = user.role === "GUARDIAN";

  // Reconsulta a cada troca de tela (fora da própria página de contratos), para o aviso
  // sumir logo depois que a família assina, sem precisar recarregar o app.
  useEffect(() => {
    if (!ativo || pathname === "/dashboard/contratos") return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // Sem sessionStorage (modo privado etc.): mostra o aviso mesmo assim.
    }
    apiJson<{ contratos: ContratoResumo[] }>("/api/contratos")
      .then((data) =>
        setPendentes(
          data.contratos.filter((c) => c.status === "AGUARDANDO_DADOS" || c.status === "AGUARDANDO_ASSINATURA" || c.status === "DEVOLVIDO" || c.status === "AGUARDANDO_ORIGINAL"),
        ),
      )
      .catch(() => setPendentes([]))
      .finally(() => setVisivel(true));
  }, [ativo, pathname]);

  if (!ativo || !visivel || pendentes.length === 0 || pathname === "/dashboard/contratos") return null;

  function fechar() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignora: só não fica lembrado
    }
    setVisivel(false);
  }

  const soOriginal = pendentes.every((c) => c.status === "AGUARDANDO_ORIGINAL");
  const nomes = [...new Set(pendentes.map((c) => c.student.name.split(" ")[0]))].join(" e ");
  const texto = soOriginal
    ? `Falta entregar na secretaria a via original do contrato de ${nomes}.`
    : pendentes.length === 1
      ? `O contrato de matrícula de ${nomes} está esperando a sua assinatura. Leva poucos minutos e é grátis pelo gov.br.`
      : `Há ${pendentes.length} contratos de matrícula (${nomes}) esperando a sua assinatura. É grátis pelo gov.br.`;

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950" role="region" aria-label="Contrato pendente">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">✍️ {soOriginal ? "Contrato quase concluído" : "Contrato de matrícula para assinar"}</p>
          <p className="mt-1">{texto}</p>
        </div>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar aviso de contrato"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-indigo-800 hover:bg-indigo-100"
        >
          ✕
        </button>
      </div>
      {!soOriginal && (
        <Link
          href="/dashboard/contratos"
          className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Assinar agora
        </Link>
      )}
    </div>
  );
}
