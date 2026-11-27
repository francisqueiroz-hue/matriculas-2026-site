"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import type { MesDoAno, SituacaoMes } from "@/lib/boletos-do-ano";

interface AnoDoAluno {
  studentId: string;
  alunoNome: string;
  anoLetivo: number;
  parcela: number | null;
  bloqueio: string | null;
  meses: MesDoAno[];
}

interface Estado {
  disponivel: boolean;
  alunos: AnoDoAluno[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ref: string) => `${MESES[Number(ref.slice(5, 7)) - 1]}/${ref.slice(0, 4)}`;

const SITUACAO: Record<SituacaoMes, { texto: string; cor: string }> = {
  A_EMITIR: { texto: "A emitir", cor: "text-slate-600 dark:text-slate-300" },
  EMITIDO: { texto: "Emitido", cor: "text-indigo-700 dark:text-indigo-300" },
  PAGO: { texto: "Pago", cor: "text-green-700 dark:text-green-400" },
  VENCIDO: { texto: "Vencido", cor: "text-red-600" },
  COM_A_ESCOLA: { texto: "Com a escola", cor: "text-amber-700 dark:text-amber-400" },
};

/**
 * "Boletos do ano": a família emite de uma vez, no Banco Inter, as parcelas do contrato
 * assinado (uma por mês, vencimento dia 05). Só aparece quando a direção liga a opção.
 */
export function BoletosDoAno({ aoEmitir }: { aoEmitir: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [emitindo, setEmitindo] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Estado>("/api/billing/boletos-do-ano")
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);

  if (!estado?.disponivel || estado.alunos.length === 0) return null;

  async function emitir(a: AnoDoAluno) {
    const qtd = a.meses.filter((m) => m.situacao === "A_EMITIR").length;
    if (!window.confirm(`Emitir ${qtd} boleto(s) de ${a.anoLetivo} de ${a.alunoNome}, de ${brl(a.parcela ?? 0)} cada, com vencimento no dia 05 de cada mês?`)) return;
    setEmitindo(a.studentId);
    setMensagem(null);
    setErro(null);
    try {
      const r = await apiJson<{ emitidos: number; erros: number; erro?: string; estado: Estado }>("/api/billing/boletos-do-ano", {
        method: "POST",
        body: JSON.stringify({ studentId: a.studentId }),
      });
      setEstado(r.estado);
      if (r.erros > 0) setErro(`${r.emitidos} emitido(s), ${r.erros} com erro${r.erro ? `: ${r.erro}` : ""}`);
      else setMensagem(`${r.emitidos} boleto(s) emitido(s). O Pix e a linha digitável aparecem em cada mês, em Faturas.`);
      aoEmitir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível emitir agora. Tente de novo.");
    } finally {
      setEmitindo(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
      <h2 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Boletos do ano</h2>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        Se preferir, emita de uma vez os boletos do ano, um por mês, com vencimento no dia 05. O valor é o do contrato assinado.
      </p>
      {estado.alunos.map((a) => {
        const aEmitir = a.meses.filter((m) => m.situacao === "A_EMITIR").length;
        return (
          <div key={a.studentId} className="space-y-2 rounded-lg bg-white p-3 dark:bg-slate-900">
            <p className="text-sm font-semibold">
              {a.alunoNome} · {a.anoLetivo}
              {a.parcela ? <span className="font-normal text-slate-500"> · {brl(a.parcela)} por mês</span> : null}
            </p>
            {a.bloqueio ? (
              <p className="text-xs text-amber-800 dark:text-amber-300">{a.bloqueio}</p>
            ) : (
              <>
                <ul className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
                  {a.meses.map((m) => (
                    <li key={m.mesReferencia} title={m.motivo}>
                      <span className="text-slate-500">{rotuloMes(m.mesReferencia)}</span>{" "}
                      <span className={SITUACAO[m.situacao].cor}>{SITUACAO[m.situacao].texto}</span>
                    </li>
                  ))}
                </ul>
                {a.meses.some((m) => m.motivo) && (
                  <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
                    {a.meses
                      .filter((m) => m.motivo)
                      .map((m) => (
                        <li key={m.mesReferencia}>
                          {rotuloMes(m.mesReferencia)}: {m.motivo}
                        </li>
                      ))}
                  </ul>
                )}
                {aEmitir > 0 ? (
                  <button
                    type="button"
                    disabled={emitindo !== null}
                    onClick={() => emitir(a)}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {emitindo === a.studentId ? "Emitindo… (pode levar até 1 minuto)" : `Emitir ${aEmitir} boleto(s) de ${a.anoLetivo}`}
                  </button>
                ) : (
                  <p className="text-xs text-slate-500">Nada a emitir: os boletos deste ano já estão em Faturas.</p>
                )}
              </>
            )}
          </div>
        );
      })}
      {mensagem && <p className="text-xs text-green-700">{mensagem}</p>}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </section>
  );
}
