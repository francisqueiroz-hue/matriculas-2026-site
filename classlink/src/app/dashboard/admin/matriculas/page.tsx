"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";

type Tipo = "PRE_MATRICULA" | "REMATRICULA";
type Status = "NOVA" | "EM_ATENDIMENTO" | "VISITA_AGENDADA" | "MATRICULADO" | "DESISTIU";

interface Solicitacao {
  id: string;
  tipo: Tipo;
  status: Status;
  origem: "SITE" | "CLASSLINK";
  responsavelNome: string;
  telefone: string;
  alunoNome: string;
  serie: string | null;
  periodoVisita: string | null;
  escolaAtual: string | null;
  observacoes: string | null;
  observacoesInternas: string | null;
  responsavelId: string | null;
  createdAt: string;
}

interface Resumo {
  tipo: Tipo;
  status: Status;
  total: number;
}

const TIPO_LABEL: Record<Tipo, string> = { PRE_MATRICULA: "Pré-matrícula", REMATRICULA: "Rematrícula" };
const STATUS_LABEL: Record<Status, string> = {
  NOVA: "Nova",
  EM_ATENDIMENTO: "Em atendimento",
  VISITA_AGENDADA: "Visita agendada",
  MATRICULADO: "Matriculado",
  DESISTIU: "Desistiu",
};
const STATUS_COR: Record<Status, string> = {
  NOVA: "bg-amber-100 text-amber-900",
  EM_ATENDIMENTO: "bg-sky-100 text-sky-900",
  VISITA_AGENDADA: "bg-indigo-100 text-indigo-900",
  MATRICULADO: "bg-emerald-100 text-emerald-900",
  DESISTIU: "bg-slate-200 text-slate-700",
};

function formatarTelefone(telefone: string) {
  const d = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone || "—";
}

function linkWhatsApp(s: Solicitacao) {
  const primeiroNome = s.responsavelNome.split(" ")[0];
  const texto =
    s.tipo === "REMATRICULA"
      ? `Olá, ${primeiroNome}! Aqui é da secretaria. Recebemos a confirmação da rematrícula de ${s.alunoNome}.`
      : `Olá, ${primeiroNome}! Aqui é da secretaria. Recebemos a pré-matrícula de ${s.alunoNome}.`;
  const numero = s.telefone.replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function SolicitacaoCard({ s, onChange, onDelete }: { s: Solicitacao; onChange: (s: Solicitacao) => void; onDelete: (id: string) => void }) {
  const [notas, setNotas] = useState(s.observacoesInternas ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function atualizar(data: Partial<Pick<Solicitacao, "status" | "observacoesInternas">>) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await apiJson<{ solicitacao: Solicitacao }>(`/api/admin/matriculas/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      onChange({ ...s, ...res.solicitacao, createdAt: s.createdAt });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir definitivamente a solicitação de ${s.responsavelNome}? Esta ação não pode ser desfeita.`)) return;
    try {
      await apiJson(`/api/admin/matriculas/${s.id}`, { method: "DELETE" });
      onDelete(s.id);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  const temTelefone = s.telefone.replace(/\D/g, "").length >= 10;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                s.tipo === "REMATRICULA" ? "bg-orange-100 text-orange-900" : "bg-purple-100 text-purple-900"
              }`}
            >
              {TIPO_LABEL[s.tipo]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COR[s.status]}`}>{STATUS_LABEL[s.status]}</span>
            <span className="text-xs text-slate-500">
              {new Date(s.createdAt).toLocaleString("pt-BR")} · {s.origem === "SITE" ? "site da escola" : "ClassLink"}
              {s.responsavelId && " · responsável já cadastrado"}
            </span>
          </div>
          <p className="text-base font-semibold text-slate-900">{s.alunoNome}</p>
          <p className="text-slate-600">
            {s.serie ?? "Série não informada"}
            {s.periodoVisita && ` · visita: ${s.periodoVisita}`}
            {s.escolaAtual && ` · escola atual: ${s.escolaAtual}`}
          </p>
          <p className="mt-1 text-slate-700">
            <span className="font-medium">{s.responsavelNome}</span> · {formatarTelefone(s.telefone)}
          </p>
          {s.observacoes && <p className="mt-1 rounded-md bg-slate-50 p-2 text-slate-700">“{s.observacoes}”</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <label className="sr-only" htmlFor={`status-${s.id}`}>
            Situação
          </label>
          <select
            id={`status-${s.id}`}
            value={s.status}
            disabled={salvando}
            onChange={(e) => atualizar({ status: e.target.value as Status })}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {(Object.keys(STATUS_LABEL) as Status[]).map((st) => (
              <option key={st} value={st}>
                {STATUS_LABEL[st]}
              </option>
            ))}
          </select>
          {temTelefone && (
            <a
              href={linkWhatsApp(s)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Chamar no WhatsApp
            </a>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`notas-${s.id}`} className="mb-1 block text-xs font-medium text-slate-500">
            Anotações internas (não aparecem para a família)
          </label>
          <textarea
            id={`notas-${s.id}`}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={salvando || notas === (s.observacoesInternas ?? "")}
          onClick={() => atualizar({ observacoesInternas: notas })}
          className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar anotação"}
        </button>
        <button type="button" onClick={excluir} className="px-2 py-2 text-xs text-red-600 hover:underline">
          Excluir
        </button>
      </div>
      {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}
    </li>
  );
}

function MatriculasContent() {
  const [ano, setAno] = useState<number | null>(null);
  const [tipo, setTipo] = useState<Tipo | "">("");
  const [status, setStatus] = useState<Status | "">("");
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[] | null>(null);
  const [resumo, setResumo] = useState<Resumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ ...(ano && { ano: String(ano) }), ...(tipo && { tipo }), ...(status && { status }), ...extra });
      return params.toString();
    },
    [ano, tipo, status],
  );

  useEffect(() => {
    apiJson<{ ano: number; solicitacoes: Solicitacao[]; resumo: Resumo[] }>(`/api/admin/matriculas?${query()}`)
      .then((data) => {
        setAno(data.ano);
        setSolicitacoes(data.solicitacoes);
        setResumo(data.resumo);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar"));
  }, [query]);

  const total = (filtro: (r: Resumo) => boolean) => resumo.filter(filtro).reduce((acc, r) => acc + r.total, 0);
  const indicadores = [
    { label: "Pré-matrículas", valor: total((r) => r.tipo === "PRE_MATRICULA") },
    { label: "Rematrículas", valor: total((r) => r.tipo === "REMATRICULA") },
    { label: "Aguardando contato", valor: total((r) => r.status === "NOVA") },
    { label: "Matriculados", valor: total((r) => r.status === "MATRICULADO") },
  ];

  function atualizarItem(item: Solicitacao) {
    setSolicitacoes((prev) => prev?.map((s) => (s.id === item.id ? item : s)) ?? null);
    const anterior = solicitacoes?.find((s) => s.id === item.id);
    if (anterior && anterior.status !== item.status) {
      setResumo((prev) => {
        const next = prev.map((r) =>
          r.tipo === item.tipo && r.status === anterior.status ? { ...r, total: r.total - 1 } : r,
        );
        const alvo = next.find((r) => r.tipo === item.tipo && r.status === item.status);
        return alvo
          ? next.map((r) => (r === alvo ? { ...r, total: r.total + 1 } : r))
          : [...next, { tipo: item.tipo, status: item.status, total: 1 }];
      });
    }
  }

  function removerItem(id: string) {
    const item = solicitacoes?.find((s) => s.id === id);
    setSolicitacoes((prev) => prev?.filter((s) => s.id !== id) ?? null);
    if (item) {
      setResumo((prev) => prev.map((r) => (r.tipo === item.tipo && r.status === item.status ? { ...r, total: r.total - 1 } : r)));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Matrículas {ano ?? ""}</h1>
          <p className="text-sm text-slate-500">Pré-matrículas e rematrículas enviadas pelo site da escola e pelo ClassLink.</p>
        </div>
        <a
          href={`/api/admin/matriculas?${query({ format: "csv" })}`}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Exportar planilha (CSV)
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {indicadores.map((i) => (
          <div key={i.label} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-2xl font-bold text-slate-900">{i.valor}</p>
            <p className="text-xs text-slate-500">{i.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["", "PRE_MATRICULA", "REMATRICULA"] as const).map((t) => (
          <button
            key={t || "todas"}
            type="button"
            onClick={() => setTipo(t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tipo === t ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t ? TIPO_LABEL[t] : "Todas"}
          </button>
        ))}
        <label htmlFor="filtro-status" className="sr-only">
          Filtrar por situação
        </label>
        <select
          id="filtro-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status | "")}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">Todas as situações</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((st) => (
            <option key={st} value={st}>
              {STATUS_LABEL[st]}
            </option>
          ))}
        </select>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {solicitacoes === null && !erro && <p className="text-sm text-slate-500">Carregando...</p>}
      {solicitacoes?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Nenhuma solicitação encontrada. Os envios dos formulários de pré-matrícula e rematrícula aparecem aqui.
        </p>
      )}

      <ul className="space-y-3">
        {solicitacoes?.map((s) => (
          <SolicitacaoCard key={s.id} s={s} onChange={atualizarItem} onDelete={removerItem} />
        ))}
      </ul>
    </div>
  );
}

export default function MatriculasAdminPage() {
  return (
    <AdminGuard>
      <MatriculasContent />
    </AdminGuard>
  );
}
