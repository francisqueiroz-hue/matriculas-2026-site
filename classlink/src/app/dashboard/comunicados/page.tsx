"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { ComunicadoComposer } from "@/components/ComunicadoComposer";

interface ComunicadoItem {
  id: string;
  tipo: "AUTORIZACAO_PASSEIO" | "CONFIRMACAO_REUNIAO" | "CIRCULAR";
  titulo: string;
  descricao: string;
  audience: "SCHOOL" | "CLASS";
  class: { id: string; name: string } | null;
  criadoPor: { id: string; name: string };
  dataCriacao: string;
  prazoResposta: string | null;
  totalRespostas?: number;
  totalPublicoAlvo?: number;
  minhasRespostas?: { alunoId: string; resposta: string }[];
}

const TIPO_LABEL: Record<string, string> = {
  AUTORIZACAO_PASSEIO: "Autorização de passeio",
  CONFIRMACAO_REUNIAO: "Confirmação de reunião",
  CIRCULAR: "Circular",
};

export default function ComunicadosPage() {
  const user = useCurrentUser();
  const [comunicados, setComunicados] = useState<ComunicadoItem[] | null>(null);

  function load() {
    apiJson<{ comunicados: ComunicadoItem[] }>("/api/comunicados").then((data) => setComunicados(data.comunicados));
  }

  useEffect(load, []);

  const podeCriar = user.role === "ADMIN" || user.role === "STAFF";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Comunicados</h1>

      {podeCriar && <ComunicadoComposer onCreated={load} />}

      {comunicados === null && <p className="text-sm text-slate-500">Carregando comunicados...</p>}
      {comunicados?.length === 0 && <p className="text-sm text-slate-500">Nenhum comunicado publicado ainda.</p>}

      <div className="space-y-3">
        {comunicados?.map((c) => {
          const expirado = c.prazoResposta ? new Date(c.prazoResposta) < new Date() : false;
          return (
            <Link
              key={c.id}
              href={`/dashboard/comunicados/${c.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {TIPO_LABEL[c.tipo]}
                  </span>
                  <h3 className="mt-1 font-semibold">{c.titulo}</h3>
                  <p className="text-xs text-slate-500">
                    {c.criadoPor.name} · {c.audience === "SCHOOL" ? "Toda a escola" : c.class?.name} ·{" "}
                    {new Date(c.dataCriacao).toLocaleString("pt-BR")}
                    {c.prazoResposta && (
                      <> · prazo: {new Date(c.prazoResposta).toLocaleString("pt-BR")}{expirado && " (expirado)"}</>
                    )}
                  </p>
                </div>
                {typeof c.totalRespostas === "number" && (
                  <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {c.totalRespostas} de {c.totalPublicoAlvo} responderam
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{c.descricao}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
