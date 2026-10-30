"use client";

import { useState } from "react";
import Link from "next/link";
import { apiJson } from "@/lib/api-client";
import { TITULO_GUIA, textoComunicadoGuia, textoWhatsAppGuia } from "@/lib/guia-familias";

/**
 * Painel da direção: divulga o Guia do app (/guia). Mostra a prévia do comunicado e só envia
 * depois da confirmação; também oferece o link e um texto pronto para colar no WhatsApp.
 */
export function EnviarGuiaFamilias() {
  const [etapa, setEtapa] = useState<"fechado" | "previa" | "enviando" | "enviado">("fechado");
  const [erro, setErro] = useState<string | null>(null);
  const [comunicadoId, setComunicadoId] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  // Só lido em cliques e na prévia (que aparece depois de um clique): nada depende de window no servidor.
  const linkGuia = () => `${window.location.origin}/guia`;

  async function enviar() {
    setEtapa("enviando");
    setErro(null);
    try {
      const res = await apiJson<{ comunicado: { id: string } }>("/api/comunicados", {
        method: "POST",
        body: JSON.stringify({ tipo: "CIRCULAR", titulo: TITULO_GUIA, descricao: textoComunicadoGuia(linkGuia()), audience: "SCHOOL" }),
      });
      setComunicadoId(res.comunicado.id);
      setEtapa("enviado");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar.");
      setEtapa("previa");
    }
  }

  async function copiar(valor: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(rotulo);
    } catch {
      setCopiado(null);
      setErro("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
      <h2 className="font-semibold">Guia do app para as famílias</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Passo a passo de instalação (Android, iPhone, computador), uso de cada área e como pedir declarações pelas
        Mensagens.{" "}
        <a href="/guia" target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-700 underline dark:text-indigo-300">
          Ver o guia
        </a>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {etapa === "fechado" && (
          <button
            type="button"
            onClick={() => setEtapa("previa")}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Enviar guia às famílias
          </button>
        )}
        <button
          type="button"
          onClick={() => copiar(linkGuia(), "link")}
          className="rounded-md border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900"
        >
          Copiar link
        </button>
        <button
          type="button"
          onClick={() => copiar(textoWhatsAppGuia(linkGuia()), "mensagem")}
          className="rounded-md border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900"
        >
          Copiar mensagem para WhatsApp
        </button>
      </div>
      {copiado && (
        <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
          {copiado === "link" ? "Link copiado." : "Mensagem copiada. Cole no WhatsApp ou na lista de transmissão."}
        </p>
      )}

      {(etapa === "previa" || etapa === "enviando") && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prévia do comunicado · Toda a escola</p>
          <p className="mt-2 font-semibold">{TITULO_GUIA}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{textoComunicadoGuia(linkGuia())}</p>
          <p className="mt-3 text-xs text-slate-500">
            Vai para Comunicados de todas as famílias, com notificação no celular de quem ativou os avisos. Famílias que
            ainda não entraram no app não veem: para elas, use &quot;Copiar mensagem para WhatsApp&quot;.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={enviar}
              disabled={etapa === "enviando"}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {etapa === "enviando" ? "Enviando…" : "Confirmar envio"}
            </button>
            <button
              type="button"
              onClick={() => setEtapa("fechado")}
              disabled={etapa === "enviando"}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {etapa === "enviado" && (
        <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
          ✓ Guia enviado como comunicado para toda a escola.{" "}
          {comunicadoId && (
            <Link href={`/dashboard/comunicados/${comunicadoId}`} className="font-medium underline">
              Acompanhar quem leu
            </Link>
          )}
        </p>
      )}
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </section>
  );
}
