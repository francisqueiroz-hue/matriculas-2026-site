"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { CAMPANHA_REMATRICULA, linkWhatsAppRematricula, type AlunoRematricula } from "@/lib/rematricula";

const DISMISS_KEY = `classlink-rematricula-${CAMPANHA_REMATRICULA.ano}-dismissed`;

/**
 * Destaque da campanha de rematrícula para responsáveis: mostra os filhos vinculados
 * e abre o WhatsApp da secretaria com a confirmação já escrita. Some quando o
 * responsável fecha o aviso (guardado por ano, então volta na campanha seguinte).
 */
export function RematriculaBanner() {
  const user = useCurrentUser();
  const [visible, setVisible] = useState(false);
  const [alunos, setAlunos] = useState<AlunoRematricula[]>([]);

  const enabled = CAMPANHA_REMATRICULA.ativa && user.role === "GUARDIAN";

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // Sem acesso ao localStorage (modo privado etc.): mostra o aviso mesmo assim.
    }
    apiJson<{ students: AlunoRematricula[] }>("/api/account/meus-alunos")
      .then((data) => setAlunos(data.students))
      .catch(() => setAlunos([]))
      .finally(() => setVisible(true));
  }, [enabled]);

  if (!enabled || !visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignora: o aviso só não fica lembrado como fechado
    }
    setVisible(false);
  }

  const nomes = alunos.map((a) => a.name.split(" ")[0]);
  const paraQuem = nomes.length > 0 ? ` de ${nomes.join(nomes.length > 2 ? ", " : " e ")}` : " do seu filho";

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">📣 Rematrícula {CAMPANHA_REMATRICULA.ano} aberta!</p>
          <p className="mt-1">
            Garanta a vaga{paraQuem} para {CAMPANHA_REMATRICULA.ano}. Quem já é aluno tem prioridade — a confirmação
            leva menos de 2 minutos.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar aviso de rematrícula"
          className="rounded-md px-2 py-1 text-amber-800 hover:bg-amber-100"
        >
          ✕
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={linkWhatsAppRematricula(user.name, alunos)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Confirmar rematrícula pelo WhatsApp
        </a>
        <Link
          href="/matriculas#rematricula"
          className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Saiba mais
        </Link>
      </div>
    </div>
  );
}
