"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { BENEFICIO_INDICACAO, avisoSorteioIndicacao, linkIndicacao, linkWhatsAppIndicacao, nomeParaIndicacao } from "@/lib/indicacao";
import { CAMPANHA_REMATRICULA } from "@/lib/rematricula";

const ANO_LETIVO_MATRICULAS = CAMPANHA_REMATRICULA.ano;

const DISMISS_KEY = `classlink-indique-${ANO_LETIVO_MATRICULAS}-dismissed`;

/**
 * Cartão "Indique uma família" no mural dos responsáveis: compartilha pelo WhatsApp o link
 * da página de matrículas já marcado como indicação. Some quando a família fecha (por ano).
 */
export function IndiqueFamiliaCard() {
  const user = useCurrentUser();
  const [visivel, setVisivel] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const ehFamilia = user.role === "GUARDIAN";

  useEffect(() => {
    if (!ehFamilia) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // Sem localStorage (modo privado): mostra mesmo assim.
    }
    // localStorage só existe no navegador: decidir aqui evita diferença entre servidor e cliente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisivel(true);
  }, [ehFamilia]);

  if (!ehFamilia || !visivel) return null;

  function fechar() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignora: o cartão só não fica lembrado como fechado
    }
    setVisivel(false);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linkIndicacao(window.location.origin, user.name));
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section aria-labelledby="titulo-indique" className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="titulo-indique" className="font-bold">
            💜 Conhece uma família que procura escola?
          </h2>
          <p className="mt-1">
            As matrículas {ANO_LETIVO_MATRICULAS} estão abertas. Compartilhe o link da escola: a família vê a página, agenda a
            visita, e a secretaria fica sabendo que foi indicação sua.
          </p>
          <p className="mt-1 font-semibold">🎁 {BENEFICIO_INDICACAO}</p>
          <p className="mt-1">🎉 {avisoSorteioIndicacao(ANO_LETIVO_MATRICULAS)}</p>
          <p className="mt-1 text-xs text-purple-800">
            O link leva o seu nome ({nomeParaIndicacao(user.name)}) só para a escola saber quem indicou.
          </p>
        </div>
        <button type="button" onClick={fechar} aria-label="Fechar convite para indicar" className="rounded-md px-2 py-1 text-purple-800 hover:bg-purple-100">
          ✕
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={linkWhatsAppIndicacao(window.location.origin, user.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Indicar pelo WhatsApp
        </a>
        <button
          type="button"
          onClick={copiar}
          className="rounded-md border border-purple-300 bg-white px-3 py-2 text-xs font-semibold text-purple-900 hover:bg-purple-100"
        >
          {copiado ? "Link copiado ✓" : "Copiar link"}
        </button>
      </div>
    </section>
  );
}
