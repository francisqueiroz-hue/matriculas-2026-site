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

  useEffect(() => {
    apiJson<Metrics>("/api/admin/metrics").then(setMetrics);
  }, []);

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
