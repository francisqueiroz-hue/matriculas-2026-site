"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { formatarDataHora } from "@/lib/datas";

interface Comunicado {
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
}

interface AlunoResposta {
  aluno: { id: string; name: string };
  resposta: { resposta: string; dataHoraResposta: string } | null;
}

interface PendenteEntry {
  guardian: { id: string; name: string; email: string };
  aluno: { id: string; name: string };
}

// "negativa": resposta de recusa — mesmo peso de toque, mas visual secundário para não ser
// confundida com a resposta afirmativa.
const RESPOSTAS_POR_TIPO: Record<string, { value: string; label: string; negativa?: boolean }[]> = {
  AUTORIZACAO_PASSEIO: [
    { value: "AUTORIZADO", label: "Autorizo" },
    { value: "NAO_AUTORIZADO", label: "Não autorizo", negativa: true },
  ],
  CONFIRMACAO_REUNIAO: [
    { value: "CONFIRMADO", label: "Confirmo presença" },
    { value: "NAO_COMPARECERA", label: "Não poderei comparecer", negativa: true },
  ],
  CIRCULAR: [{ value: "LIDO", label: "Confirmar leitura" }],
};

const RESPOSTA_LABEL: Record<string, string> = {
  AUTORIZADO: "Autorizado",
  NAO_AUTORIZADO: "Não autorizado",
  CONFIRMADO: "Confirmado",
  NAO_COMPARECERA: "Não comparecerá",
  LIDO: "Lido",
  PENDENTE_EXPIRADO: "Prazo expirado sem resposta",
};

export default function ComunicadoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useCurrentUser();

  const [comunicado, setComunicado] = useState<Comunicado | null>(null);
  const [alunos, setAlunos] = useState<AlunoResposta[] | null>(null);
  const [stats, setStats] = useState<{ totalRespostas: number; totalPublicoAlvo: number } | null>(null);
  const [pendentes, setPendentes] = useState<PendenteEntry[] | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [erroResposta, setErroResposta] = useState<string | null>(null);

  function loadGuardianView() {
    apiJson<{ comunicado: Comunicado; alunos: AlunoResposta[] }>(`/api/comunicados/${id}`).then((data) => {
      setComunicado(data.comunicado);
      setAlunos(data.alunos);
    });
  }

  function loadStaffView() {
    apiJson<{ comunicado: Comunicado; totalRespostas: number; totalPublicoAlvo: number }>(`/api/comunicados/${id}`).then(
      (data) => {
        setComunicado(data.comunicado);
        setStats({ totalRespostas: data.totalRespostas, totalPublicoAlvo: data.totalPublicoAlvo });
      },
    );
    apiJson<{ pendentes: PendenteEntry[] }>(`/api/comunicados/${id}/pendentes`).then((data) => setPendentes(data.pendentes));
  }

  useEffect(() => {
    if (user.role === "GUARDIAN") loadGuardianView();
    else loadStaffView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function responder(alunoId: string, resposta: string) {
    setRespondendo(alunoId);
    setErroResposta(null);
    try {
      await apiJson(`/api/comunicados/${id}/responder`, { method: "POST", body: JSON.stringify({ alunoId, resposta }) });
      loadGuardianView();
    } catch (err) {
      setErroResposta(err instanceof Error ? err.message : "Não foi possível enviar a resposta. Tente de novo.");
    } finally {
      setRespondendo(null);
    }
  }

  async function reenviar(guardianId: string) {
    setEnviando(guardianId);
    try {
      await apiJson(`/api/comunicados/${id}/reenviar/${guardianId}`, { method: "POST" });
      setFeedback("Notificação reenviada.");
    } finally {
      setEnviando(null);
    }
  }

  if (!comunicado) return <p className="text-sm text-slate-500">Carregando comunicado...</p>;

  const opcoes = RESPOSTAS_POR_TIPO[comunicado.tipo] ?? [];

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">{comunicado.titulo}</h1>
        <p className="text-xs text-slate-500">
          {comunicado.criadoPor.name} ·{" "}
          {comunicado.audience === "SCHOOL"
            ? "Toda a escola"
            : comunicado.audience === "STUDENT"
              ? `Individual — ${comunicado.aluno?.name}`
              : comunicado.class?.name}{" "}
          ·{" "}
          {formatarDataHora(comunicado.dataCriacao)}
          {comunicado.prazoResposta && <> · responder até {formatarDataHora(comunicado.prazoResposta)}</>}
        </p>
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{comunicado.descricao}</p>
      </div>

      {user.role === "GUARDIAN" && alunos && (
        <div className="space-y-3">
          {erroResposta && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {erroResposta}
            </p>
          )}
          {alunos.map(({ aluno, resposta }) => (
            <div key={aluno.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="font-medium">{aluno.name}</p>
              {resposta ? (
                <p
                  className={`mt-1 text-sm ${
                    ["NAO_AUTORIZADO", "NAO_COMPARECERA", "PENDENTE_EXPIRADO"].includes(resposta.resposta)
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {RESPOSTA_LABEL[resposta.resposta] ?? resposta.resposta} em {formatarDataHora(resposta.dataHoraResposta)}
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {opcoes.map((op) => (
                    <button
                      key={op.value}
                      type="button"
                      disabled={respondendo === aluno.id}
                      onClick={() => responder(aluno.id, op.value)}
                      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60 ${
                        op.negativa
                          ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {respondendo === aluno.id ? "Enviando…" : op.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(user.role === "ADMIN" || user.role === "STAFF") && (
        <div className="space-y-4">
          {stats && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <span className="text-sm font-medium">
                {stats.totalRespostas} de {stats.totalPublicoAlvo} responderam
              </span>
              <a
                href={`/api/comunicados/${id}/export`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Exportar CSV
              </a>
            </div>
          )}

          <div>
            <h2 className="mb-2 font-semibold">Ainda não responderam</h2>
            {feedback && <p className="mb-2 text-xs text-green-600">{feedback}</p>}
            {pendentes?.length === 0 && <p className="text-sm text-slate-500">Todos já responderam.</p>}
            <ul className="space-y-2">
              {pendentes?.map((p) => (
                <li
                  key={`${p.guardian.id}-${p.aluno.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span className="text-sm">
                    {p.guardian.name} <span className="text-slate-500">— {p.aluno.name}</span>
                  </span>
                  <button
                    disabled={enviando === p.guardian.id}
                    onClick={() => reenviar(p.guardian.id)}
                    className="rounded-md border border-indigo-600 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                  >
                    Reenviar notificação
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
