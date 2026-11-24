"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { percentual, type ResumoAdocao } from "@/lib/adocao";

type Dados = ResumoAdocao & { semanas: { semana: string; ativos: number }[] };

/** "17/11" a partir de "2026-11-17". */
function diaMes(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function Indicador({ titulo, valor, total, detalhe, cor }: { titulo: string; valor: number; total: number; detalhe: string; cor: string }) {
  const pct = percentual(valor, total);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{pct}%</p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
    </div>
  );
}

/**
 * Quanto as famílias usam o ClassLink: entraram, usaram nos últimos 7 dias e têm notificações,
 * no total e por turma, mais o uso semana a semana. Tocar numa turma filtra a lista abaixo.
 */
export function PainelAdocao({ turmaSelecionada, onTurma }: { turmaSelecionada: string | null; onTurma: (turma: string | null) => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Dados>("/api/admin/acessos/adocao")
      .then(setDados)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar"));
  }, []);

  if (erro) return <p className="text-sm text-red-600">Painel de uso: {erro}</p>;
  if (!dados) return <p className="text-sm text-slate-500">Carregando o painel de uso...</p>;

  const { alunos } = dados;
  const maxSemana = Math.max(1, ...dados.semanas.map((s) => s.ativos));
  const totalResp = dados.responsaveis.total;

  return (
    <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4" aria-labelledby="titulo-adocao">
      <div>
        <h2 id="titulo-adocao" className="font-semibold text-indigo-950">
          📊 Uso do app pelas famílias
        </h2>
        <p className="text-xs text-indigo-900/80">
          Contado por aluno: a família conta se ao menos um responsável entrou, usou ou ativou as notificações. Meta principal: famílias
          que usaram nos últimos 7 dias.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Indicador
          titulo="Usaram nos últimos 7 dias"
          valor={alunos.ativos7d}
          total={alunos.total}
          cor="bg-indigo-600"
          detalhe={`${alunos.ativos7d} de ${alunos.total} alunos · ${dados.responsaveis.ativos7d} de ${totalResp} responsáveis`}
        />
        <Indicador
          titulo="Com notificações ativas"
          valor={alunos.comAvisos}
          total={alunos.total}
          cor="bg-sky-500"
          detalhe={`${alunos.comAvisos} de ${alunos.total} alunos · ${dados.responsaveis.comAvisos} de ${totalResp} responsáveis`}
        />
        <Indicador
          titulo="Já entraram alguma vez"
          valor={alunos.entraram}
          total={alunos.total}
          cor="bg-emerald-500"
          detalhe={`${alunos.entraram} de ${alunos.total} alunos · ${dados.responsaveis.entraram} de ${totalResp} responsáveis`}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-medium text-slate-500">Responsáveis que abriram o app, por semana (segunda a domingo)</p>
        <div className="mt-2 flex h-24 items-end gap-1.5" role="list">
          {dados.semanas.map((s, i) => (
            <div key={s.semana} className="flex flex-1 flex-col items-center gap-1" role="listitem" aria-label={`Semana de ${diaMes(s.semana)}: ${s.ativos}`}>
              <span className="text-[10px] font-semibold text-slate-700">{s.ativos}</span>
              <div
                className={`w-full rounded-t ${i === dados.semanas.length - 1 ? "bg-indigo-300" : "bg-indigo-600"}`}
                style={{ height: `${Math.max(4, (s.ativos / maxSemana) * 64)}px` }}
              />
              <span className="text-[10px] text-slate-500">{diaMes(s.semana)}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-400">A última barra (mais clara) é a semana atual, ainda em andamento.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Turma</th>
              <th className="px-2 py-2 text-right font-medium">Alunos</th>
              <th className="px-2 py-2 text-right font-medium">Usaram (7 dias)</th>
              <th className="px-2 py-2 text-right font-medium">Notificações</th>
              <th className="px-2 py-2 text-right font-medium">Já entraram</th>
            </tr>
          </thead>
          <tbody>
            {dados.turmas.map((t) => {
              const selecionada = turmaSelecionada === t.turma;
              const baixo = percentual(t.ativos7d, t.total) < 50;
              return (
                <tr key={t.turma} className={`border-t border-slate-100 ${selecionada ? "bg-indigo-50" : ""}`}>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onTurma(selecionada ? null : t.turma)}
                      aria-pressed={selecionada}
                      className="font-semibold text-indigo-700 underline-offset-2 hover:underline"
                    >
                      {t.turma}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right text-slate-700">{t.total}</td>
                  <td className={`px-2 py-2 text-right font-semibold ${baixo ? "text-amber-700" : "text-emerald-700"}`}>
                    {t.ativos7d} ({percentual(t.ativos7d, t.total)}%)
                  </td>
                  <td className="px-2 py-2 text-right text-slate-700">
                    {t.comAvisos} ({percentual(t.comAvisos, t.total)}%)
                  </td>
                  <td className="px-2 py-2 text-right text-slate-700">
                    {t.entraram} ({percentual(t.entraram, t.total)}%)
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
          Toque no nome da turma para ver só os responsáveis dela na lista abaixo. Em laranja: menos da metade usou nos últimos 7 dias.
        </p>
      </div>
    </section>
  );
}
