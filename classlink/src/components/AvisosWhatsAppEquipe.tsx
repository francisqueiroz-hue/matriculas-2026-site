"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

interface Preferencia {
  phone: string | null;
  avisosWhatsApp: boolean;
  disponivel: boolean;
}

function formatarTelefone(telefone: string | null) {
  if (!telefone) return "";
  const d = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

/** Equipe: receber no WhatsApp pessoal o aviso de mensagem nova no ClassLink. */
export function AvisosWhatsAppEquipe() {
  const [pref, setPref] = useState<Preferencia | null>(null);
  const [telefone, setTelefone] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    apiJson<Preferencia>("/api/account/avisos")
      .then((p) => {
        setPref(p);
        setTelefone(formatarTelefone(p.phone));
        setAtivo(p.avisosWhatsApp);
      })
      .catch(() => setPref(null));
  }, []);

  if (!pref) return null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMensagem(null);
    try {
      const p = await apiJson<Preferencia>("/api/account/avisos", {
        method: "PATCH",
        body: JSON.stringify({ avisosWhatsApp: ativo, telefone }),
      });
      setPref(p);
      setTelefone(formatarTelefone(p.phone));
      setMensagem({
        tipo: "ok",
        texto: p.avisosWhatsApp
          ? "Pronto! Você vai receber no WhatsApp um aviso quando chegar mensagem nova."
          : "Avisos pelo WhatsApp desativados.",
      });
    } catch (err) {
      setMensagem({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold">Avisos de mensagens no WhatsApp</h2>
      <p className="mt-1 text-sm text-slate-500">
        Receba no seu WhatsApp, pelo número da escola, um aviso com o trecho da mensagem e o link para responder sempre
        que uma família ou um colega escrever para você no ClassLink.
      </p>
      {!pref.disponivel && (
        <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          Ainda indisponível: a escola precisa ter o modelo de aviso aprovado pela Meta (WHATSAPP_TEMPLATE_AVISO). Você já
          pode deixar sua preferência salva — os avisos começam assim que ele for configurado.
        </p>
      )}
      <form onSubmit={salvar} className="mt-3 space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Seu celular (WhatsApp)</span>
          <input
            type="tel"
            inputMode="tel"
            placeholder="(21) 90000-0000"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4" />
          Quero receber os avisos de mensagens no WhatsApp
        </label>
        {mensagem && (
          <p className={`text-sm ${mensagem.tipo === "ok" ? "text-emerald-700" : "text-red-600"}`} role="status">
            {mensagem.texto}
          </p>
        )}
        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
