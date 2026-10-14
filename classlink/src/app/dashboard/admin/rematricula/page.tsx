"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";
import {
  ORDEM_ETAPAS,
  ROTULO_ETAPA,
  linkWhatsApp,
  mensagemCobranca,
  type EtapaRematricula,
} from "@/lib/rematricula-funil";

interface Linha {
  id: string;
  nome: string;
  turma: { id: string; nome: string } | null;
  etapa: EtapaRematricula;
  responsaveis: { id: string; nome: string; telefone: string | null }[];
}
interface Dados {
  ano: number;
  resumo: { total: number; rematriculados: number; faltam: number; porEtapa: Record<EtapaRematricula, number> };
  alunos: Linha[];
}

const COR: Record<EtapaRematricula, string> = {
  NAO_CONFIRMOU: "bg-amber-100 text-amber-900",
  CONFIRMOU: "bg-sky-100 text-sky-900",
  CONTRATO_ENVIADO: "bg-indigo-100 text-indigo-900",
  CONTRATO_EM_CONFERENCIA: "bg-violet-100 text-violet-900",
  CONTRATO_ASSINADO: "bg-emerald-100 text-emerald-900",
};

function Conteudo() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<EtapaRematricula | "">("");
  const [turma, setTurma] = useState("");

  useEffect(() => {
    apiJson<Dados>("/api/admin/rematricula")
      .then(setDados)
      .catch(() => setErro("Não foi possível carregar a rematrícula. Atualize a página para tentar de novo."));
  }, []);

  const turmas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const a of dados?.alunos ?? []) if (a.turma) mapa.set(a.turma.id, a.turma.nome);
    return [...mapa.entries()];
  }, [dados]);

  const visiveis = (dados?.alunos ?? []).filter((a) => (!etapa || a.etapa === etapa) && (!turma || a.turma?.id === turma));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Rematrícula {dados?.ano ?? ""}</h1>
        <p className="text-sm text-slate-500">Confirmar a rematrícula já conta como matrícula. O contrato assinado é o passo seguinte.</p>
      </div>

      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-slate-500">Carregando...</p>}

      {dados && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-2xl font-bold">{dados.resumo.rematriculados}<span className="text-sm font-normal text-slate-500"> de {dados.resumo.total}</span></p>
              <p className="text-xs text-slate-500">alunos já contam como rematriculados</p>
            </div>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-2xl font-bold text-amber-900">{dados.resumo.faltam}</p>
              <p className="text-xs text-amber-900">ainda não confirmaram</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-2xl font-bold">{dados.resumo.porEtapa.CONTRATO_ENVIADO}</p>
              <p className="text-xs text-slate-500">contratos aguardando assinatura</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-2xl font-bold">{dados.resumo.porEtapa.CONTRATO_ASSINADO}</p>
              <p className="text-xs text-slate-500">contratos assinados</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <select aria-label="Filtrar por situação" value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaRematricula | "")} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">Todas as situações</option>
              {ORDEM_ETAPAS.map((e) => (
                <option key={e} value={e}>{ROTULO_ETAPA[e]} ({dados.resumo.porEtapa[e]})</option>
              ))}
            </select>
            <select aria-label="Filtrar por turma" value={turma} onChange={(e) => setTurma(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">Todas as turmas</option>
              {turmas.map(([id, nome]) => (
                <option key={id} value={id}>{nome}</option>
              ))}
            </select>
          </div>

          <ul className="space-y-2">
            {visiveis.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.nome}</p>
                    <p className="text-xs text-slate-500">{a.turma?.nome ?? "Sem turma"}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${COR[a.etapa]}`}>{ROTULO_ETAPA[a.etapa]}</span>
                </div>
                {a.responsaveis.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {a.responsaveis.map((r) => {
                      const texto = mensagemCobranca(r.nome, a.nome, dados.ano, a.etapa);
                      const link = texto ? linkWhatsApp(r.telefone, texto) : null;
                      return (
                        <li key={r.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs">
                          <span>{r.nome}</span>
                          {link ? (
                            <a href={link} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">
                              Chamar no WhatsApp
                            </a>
                          ) : (
                            <span className="text-slate-400">{texto ? "sem telefone" : "nada a cobrar"}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
            {visiveis.length === 0 && <li className="text-sm text-slate-500">Nenhum aluno neste filtro.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

export default function RematriculaPage() {
  return (
    <AdminGuard>
      <Conteudo />
    </AdminGuard>
  );
}
