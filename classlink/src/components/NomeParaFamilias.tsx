"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

interface Dados {
  nomeParaFamilias: string | null;
  cargo: string;
  exibido: string;
}

/** Equipe: como o seu nome aparece para as famílias (ex.: "Secretaria"). */
export function NomeParaFamilias() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Dados>("/api/account/nome-familias")
      .then((d) => {
        setDados(d);
        setValor(d.nomeParaFamilias ?? "");
      })
      .catch(() => setDados(null));
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setAviso(null);
    try {
      const d = await apiJson<Dados>("/api/account/nome-familias", {
        method: "PATCH",
        body: JSON.stringify({ nomeParaFamilias: valor.trim() || null }),
      });
      setDados(d);
      setAviso(`Pronto! As famílias veem você como “${d.exibido}”.`);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  if (!dados) return null;
  return (
    <form onSubmit={salvar} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold">Como as famílias veem você</h2>
      <p className="mt-1 text-sm text-slate-500">
        Nas mensagens, no Mural e nos comunicados, as famílias não veem o seu nome pessoal, e sim este nome. Em branco, aparece o
        seu cargo (“{dados.cargo}”).
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Nome para as famílias</span>
          <input
            value={valor}
            maxLength={60}
            onChange={(e) => setValor(e.target.value)}
            placeholder={dados.cargo}
            className="w-64 rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <button type="submit" disabled={salvando} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Ex.: Secretaria, Direção, Coordenação Pedagógica.</p>
      {aviso && (
        <p className="mt-2 text-sm text-emerald-700" role="status">
          {aviso}
        </p>
      )}
    </form>
  );
}
