"use client";

import { useEffect, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";

interface Metrics {
  totals: { totalStudents: number; totalGuardians: number; totalStaff: number };
  posts: {
    id: string;
    title: string;
    audience: string;
    className: string | null;
    createdAt: string;
    readCount: number;
    audienceSize: number;
    readRate: number;
  }[];
  messaging: { staffMessages: number; guardianReplies: number; responseRate: number };
}

interface ComunicadosMetrics {
  periodoDias: number;
  totalComunicados: number;
  totalRespostas: number;
  totalPendentes: number;
  totalPublicoAlvo: number;
  tempoMedioMinutos: number | null;
}

const PERIODOS = [7, 30, 90] as const;

function formatDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h ${minutos % 60}min`;
  const dias = Math.floor(horas / 24);
  return `${dias}d ${horas % 24}h`;
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [comunicadosMetrics, setComunicadosMetrics] = useState<ComunicadosMetrics | null>(null);
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>(30);

  useEffect(() => {
    apiJson<Metrics>("/api/admin/metrics").then(setMetrics);
  }, []);

  useEffect(() => {
    apiJson<ComunicadosMetrics>(`/api/admin/comunicados-metrics?dias=${periodo}`).then(setComunicadosMetrics);
  }, [periodo]);

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Painel de engajamento</h1>

        {metrics && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Alunos" value={metrics.totals.totalStudents} />
              <StatCard label="Responsáveis" value={metrics.totals.totalGuardians} />
              <StatCard label="Equipe" value={metrics.totals.totalStaff} />
              <StatCard label="Taxa de resposta" value={`${metrics.messaging.responseRate}%`} />
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Comunicados</h2>
                <div className="flex gap-1 rounded-md border border-slate-200 p-0.5 dark:border-slate-800">
                  {PERIODOS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriodo(p)}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        periodo === p
                          ? "bg-indigo-600 text-white"
                          : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      Últimos {p} dias
                    </button>
                  ))}
                </div>
              </div>

              {comunicadosMetrics === null && <p className="text-sm text-slate-500">Carregando...</p>}
              {comunicadosMetrics && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard
                    label="Tempo médio de resposta"
                    value={comunicadosMetrics.tempoMedioMinutos !== null ? formatDuracao(comunicadosMetrics.tempoMedioMinutos) : "—"}
                  />
                  <StatCard label="Comunicados publicados" value={comunicadosMetrics.totalComunicados} />
                  <StatCard label="Respostas recebidas" value={comunicadosMetrics.totalRespostas} />
                  <StatCard label="Pendentes" value={comunicadosMetrics.totalPendentes} />
                </div>
              )}
              {comunicadosMetrics && comunicadosMetrics.totalComunicados === 0 && (
                <p className="mt-2 text-sm text-slate-500">Nenhum comunicado publicado neste período.</p>
              )}
            </div>

            <div>
              <h2 className="mb-2 font-semibold">Leitura dos últimos avisos</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-3 py-2">Aviso</th>
                      <th className="px-3 py-2">Destino</th>
                      <th className="px-3 py-2">Leitura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.posts.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2">{p.title}</td>
                        <td className="px-3 py-2 text-slate-500">{p.className ?? "Toda a escola"}</td>
                        <td className="px-3 py-2">
                          {p.readCount}/{p.audienceSize} ({p.readRate}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminGuard>
  );
}
