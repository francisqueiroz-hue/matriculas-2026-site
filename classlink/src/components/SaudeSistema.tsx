"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

interface ErroItem {
  id: string;
  origem: string;
  mensagem: string;
  total: number;
  primeiraVez: string;
  ultimaVez: string;
}
interface CspItem {
  id: string;
  diretiva: string;
  bloqueado: string;
  pagina: string;
  total: number;
  ultimaVez: string;
}
interface Saude {
  janelaDias: number;
  erros: ErroItem[];
  csp: CspItem[];
}

const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** Quadro do Painel com os erros do servidor guardados no banco (a Vercel guarda só 1 hora de log). */
export function SaudeSistema() {
  const [dados, setDados] = useState<Saude | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [limpando, setLimpando] = useState(false);

  const carregar = useCallback(() => {
    apiJson<Saude>("/api/admin/saude")
      .then((d) => {
        setDados(d);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar"));
  }, []);
  useEffect(carregar, [carregar]);

  async function limpar(tipo: "erros" | "csp") {
    const texto = tipo === "erros" ? "Marcar todos os erros como resolvidos?" : "Limpar os alertas de segurança do navegador?";
    if (!confirm(texto)) return;
    setLimpando(true);
    try {
      await apiJson(`/api/admin/saude${tipo === "csp" ? "?tipo=csp" : ""}`, { method: "DELETE" });
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao limpar");
    } finally {
      setLimpando(false);
    }
  }

  return (
    <section aria-labelledby="saude-titulo" className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="saude-titulo" className="font-semibold">
          Saúde do sistema
        </h2>
        {dados && <span className="text-xs text-slate-500">Últimos {dados.janelaDias} dias</span>}
      </div>
      {erro && (
        <p className="mt-2 text-red-600" role="alert">
          {erro}
        </p>
      )}
      {!dados && !erro && <p className="mt-2 text-slate-500">Carregando…</p>}
      {dados && (
        <>
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Erros do servidor</h3>
              {dados.erros.length > 0 && (
                <button type="button" onClick={() => limpar("erros")} disabled={limpando} className="text-xs font-medium text-indigo-700 hover:underline disabled:opacity-60">
                  Marcar como resolvidos
                </button>
              )}
            </div>
            {dados.erros.length === 0 ? (
              <p className="mt-1 text-emerald-700">✅ Nenhum erro registrado.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {dados.erros.map((e) => (
                  <li key={e.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/30">
                    <p className="break-words font-medium text-slate-800 dark:text-slate-100">{e.mensagem}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {e.origem} · {e.total}× · último em {quando(e.ultimaVez)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Alertas de segurança do navegador (CSP)</h3>
              {dados.csp.length > 0 && (
                <button type="button" onClick={() => limpar("csp")} disabled={limpando} className="text-xs font-medium text-indigo-700 hover:underline disabled:opacity-60">
                  Limpar
                </button>
              )}
            </div>
            {dados.csp.length === 0 ? (
              <p className="mt-1 text-emerald-700">✅ Nenhum alerta.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {dados.csp.map((c) => (
                  <li key={c.id} className="break-words">
                    <strong>{c.diretiva}</strong> bloquearia {c.bloqueado} em {c.pagina} · {c.total}× · {quando(c.ultimaVez)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
