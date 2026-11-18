"use client";

import { useState } from "react";
import { PdfErro, abrirArquivo, obterPdf, salvarArquivo } from "@/lib/pdf-client";

/** Botão que baixa o boletim em PDF (com a sessão do app) e abre para imprimir; se não abrir, salva. */
export function BaixarBoletimPdf({ url, nomeArquivo, rotulo }: { url: string; nomeArquivo: string; rotulo: string }) {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    setErro(null);
    setBaixando(true);
    try {
      const arquivo = await obterPdf(url, nomeArquivo);
      if (!abrirArquivo(arquivo)) salvarArquivo(arquivo);
    } catch (err) {
      setErro(err instanceof PdfErro ? err.message : "Não foi possível gerar o PDF. Tente de novo.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={baixar}
        disabled={baixando}
        className="rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-300 dark:hover:bg-indigo-950"
      >
        {baixando ? "Gerando PDF..." : rotulo}
      </button>
      {erro && <span role="alert" className="mt-1 text-xs text-red-600">{erro}</span>}
    </span>
  );
}
