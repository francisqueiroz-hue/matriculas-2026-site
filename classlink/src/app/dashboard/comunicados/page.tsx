"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { ComunicadoComposer } from "@/components/ComunicadoComposer";
import { formatarDataHora } from "@/lib/datas";
import {
  alunosSemResposta,
  ordenarParaResponsavel,
  situacaoDoComunicado,
  type SituacaoComunicado,
} from "@/lib/comunicados-situacao";

interface ComunicadoItem {
  id: string;
  tipo: "AUTORIZACAO_PASSEIO" | "CONFIRMACAO_REUNIAO" | "CIRCULAR";
  titulo: string;
  descricao: string;
  audience: "SCHOOL" | "CLASS" | "STUDENT";
  class: { id: string; name: string } | null;
  aluno: { id: string; name: string } | null;
  criadoPor: { id: string; name: string };
  dataCriacao: string;
  prazoResposta: string | null;
  totalRespostas?: number;
  totalPublicoAlvo?: number;
  minhasRespostas?: { alunoId: string; resposta: string }[];
  alunosAlvo?: number;
}

const TIPO_LABEL: Record<string, string> = {
  AUTORIZACAO_PASSEIO: "Autorização de passeio",
  CONFIRMACAO_REUNIAO: "Confirmação de reunião",
  CIRCULAR: "Circular",
};

const SITUACAO: Record<SituacaoComunicado, { label: string; classe: string }> = {
  PENDENTE: { label: "Pendente", classe: "bg-amber-100 text-amber-900 ring-1 ring-amber-300" },
  RESPONDIDO: { label: "✓ Respondido", classe: "bg-emerald-100 text-emerald-900" },
  ENCERRADO: { label: "Prazo encerrado", classe: "bg-slate-100 text-slate-600" },
};

function publico(c: ComunicadoItem) {
  return c.audience === "SCHOOL" ? "Toda a escola" : c.audience === "STUDENT" ? `Individual — ${c.aluno?.name}` : c.class?.name;
}

function ComunicadoCard({ c, situacao }: { c: ComunicadoItem; situacao?: SituacaoComunicado }) {
  const expirado = c.prazoResposta ? new Date(c.prazoResposta) < new Date() : false;
  const faltam = situacao === "PENDENTE" ? alunosSemResposta(c) : 0;
  return (
    <Link
      href={`/dashboard/comunicados/${c.id}`}
      className={`block rounded-xl border bg-white p-4 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-slate-900 dark:hover:bg-slate-800 ${
        situacao === "PENDENTE" ? "border-amber-300 dark:border-amber-800" : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {TIPO_LABEL[c.tipo]}
          </span>
          <h3 className="mt-1 font-semibold">{c.titulo}</h3>
          <p className="text-xs text-slate-500">
            {c.criadoPor.name} · {publico(c)} · {formatarDataHora(c.dataCriacao)}
          </p>
        </div>
        {situacao && (
          <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${SITUACAO[situacao].classe}`}>
            {SITUACAO[situacao].label}
          </span>
        )}
        {typeof c.totalRespostas === "number" && (
          <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {c.totalRespostas} de {c.totalPublicoAlvo} responderam
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{c.descricao}</p>
      {c.prazoResposta && (
        <p className={`mt-2 text-xs font-medium ${situacao === "PENDENTE" ? "text-amber-800 dark:text-amber-300" : "text-slate-500"}`}>
          {expirado ? `Prazo encerrado em ${formatarDataHora(c.prazoResposta)}` : `Responder até ${formatarDataHora(c.prazoResposta)}`}
        </p>
      )}
      {faltam > 0 && (c.alunosAlvo ?? 1) > 1 && (
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
          Falta responder por {faltam} {faltam === 1 ? "aluno" : "alunos"}
        </p>
      )}
    </Link>
  );
}

export default function ComunicadosPage() {
  const user = useCurrentUser();
  const [comunicados, setComunicados] = useState<ComunicadoItem[] | null>(null);

  function load() {
    apiJson<{ comunicados: ComunicadoItem[] }>("/api/comunicados").then((data) => setComunicados(data.comunicados));
  }

  useEffect(load, []);

  const podeCriar = user.role === "ADMIN" || user.role === "STAFF";
  const responsavel = user.role === "GUARDIAN";

  const ordenados = comunicados && responsavel ? ordenarParaResponsavel(comunicados) : comunicados;
  const pendentes = responsavel ? (ordenados ?? []).filter((c) => situacaoDoComunicado(c) === "PENDENTE") : [];
  const demais = responsavel ? (ordenados ?? []).filter((c) => situacaoDoComunicado(c) !== "PENDENTE") : (ordenados ?? []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Comunicados</h1>

      {podeCriar && <ComunicadoComposer onCreated={load} />}

      {comunicados === null && <p className="text-sm text-slate-500">Carregando comunicados...</p>}
      {comunicados?.length === 0 && <p className="text-sm text-slate-500">Nenhum comunicado publicado ainda.</p>}

      {responsavel && comunicados && comunicados.length > 0 && (
        <section aria-labelledby="titulo-pendentes" className="space-y-3">
          <h2 id="titulo-pendentes" className="font-semibold">
            Aguardando sua resposta {pendentes.length > 0 && `(${pendentes.length})`}
          </h2>
          {pendentes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
              ✓ Você está em dia — nenhum comunicado esperando resposta.
            </p>
          ) : (
            pendentes.map((c) => <ComunicadoCard key={c.id} c={c} situacao="PENDENTE" />)
          )}
        </section>
      )}

      {demais.length > 0 && (
        <section aria-labelledby={responsavel ? "titulo-demais" : undefined} className="space-y-3">
          {responsavel && (
            <h2 id="titulo-demais" className="pt-2 font-semibold">
              Respondidos e encerrados
            </h2>
          )}
          {demais.map((c) => (
            <ComunicadoCard key={c.id} c={c} situacao={responsavel ? situacaoDoComunicado(c) : undefined} />
          ))}
        </section>
      )}
    </div>
  );
}
