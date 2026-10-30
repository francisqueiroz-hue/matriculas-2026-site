"use client";

/** Abre a impressão do navegador — dali a família ou a secretaria também salva o guia em PDF. */
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 print:hidden"
    >
      🖨️ Imprimir ou salvar em PDF
    </button>
  );
}
