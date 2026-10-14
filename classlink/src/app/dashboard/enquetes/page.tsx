"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { EnqueteComposer } from "@/components/EnqueteComposer";
import { formatarDataHora } from "@/lib/datas";

interface EnqueteItem {
  id: string;
  titulo: string;
  audience: "SCHOOL" | "CLASS" | "STUDENT";
  anonima: boolean;
  prazo: string | null;
  aberta: boolean;
  dataCriacao: string;
  class: { id: string; name: string } | null;
  aluno: { id: string; name: string } | null;
  totalPerguntas: number;
  respondida?: boolean;
  totalRespostas?: number;
}

function publico(e: EnqueteItem) {
  return e.audience === "SCHOOL" ? "Toda a escola" : e.audience === "STUDENT" ? `Individual — ${e.aluno?.name}` : e.class?.name;
}

function Cartao({ e, responsavel }: { e: EnqueteItem; responsavel: boolean }) {
  const pendente = responsavel && e.aberta && !e.respondida;
  return (
    <Link
      href={`/dashboard/enquetes/${e.id}`}
      className={`block rounded-xl border bg-white p-4 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-slate-900 dark:hover:bg-slate-800 ${
        pendente ? "border-amber-300 dark:border-amber-800" : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{e.titulo}</h3>
          <p className="text-xs text-slate-500">
            {publico(e)} · {e.totalPerguntas} {e.totalPerguntas === 1 ? "pergunta" : "perguntas"} · {e.anonima ? "Anônima" : "Identificada"}
          </p>
        </div>
        {responsavel ? (
          <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${e.respondida ? "bg-emerald-100 text-emerald-900" : e.aberta ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300" : "bg-slate-100 text-slate-600"}`}>
            {e.respondida ? "✓ Respondida" : e.aberta ? "Aguardando você" : "Encerrada"}
          </span>
        ) : (
          <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {e.aberta ? `${e.totalRespostas ?? 0} respostas` : `Encerrada · ${e.totalRespostas ?? 0} respostas`}
          </span>
        )}
      </div>
      {e.prazo && e.aberta && <p className="mt-2 text-xs font-medium text-slate-500">Responder até {formatarDataHora(e.prazo)}</p>}
    </Link>
  );
}

export default function EnquetesPage() {
  const user = useCurrentUser();
  const [enquetes, setEnquetes] = useState<EnqueteItem[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function load() {
    apiJson<{ enquetes: EnqueteItem[] }>("/api/enquetes")
      .then((data) => setEnquetes(data.enquetes))
      .catch(() => setErro("Não foi possível carregar as enquetes. Atualize a página para tentar de novo."));
  }
  useEffect(load, []);

  const responsavel = user.role === "GUARDIAN";
  const podeCriar = user.role === "ADMIN" || user.role === "STAFF";
  const aguardando = responsavel ? (enquetes ?? []).filter((e) => e.aberta && !e.respondida) : [];
  const demais = responsavel ? (enquetes ?? []).filter((e) => !(e.aberta && !e.respondida)) : (enquetes ?? []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Enquetes</h1>
      {podeCriar && <EnqueteComposer onCreated={load} />}
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      {enquetes === null && !erro && <p className="text-sm text-slate-500">Carregando enquetes...</p>}
      {enquetes?.length === 0 && <p className="text-sm text-slate-500">Nenhuma enquete por aqui ainda.</p>}

      {aguardando.length > 0 && (
        <section aria-labelledby="titulo-aguardando" className="space-y-3">
          <h2 id="titulo-aguardando" className="font-semibold">Aguardando sua resposta ({aguardando.length})</h2>
          {aguardando.map((e) => <Cartao key={e.id} e={e} responsavel />)}
        </section>
      )}

      {demais.length > 0 && (
        <section className="space-y-3">
          {responsavel && <h2 className="pt-2 font-semibold">Respondidas e encerradas</h2>}
          {demais.map((e) => <Cartao key={e.id} e={e} responsavel={responsavel} />)}
        </section>
      )}
    </div>
  );
}
