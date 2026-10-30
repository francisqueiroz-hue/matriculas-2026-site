"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { partesComLinks } from "@/lib/texto-links";
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

interface Abertura {
  abriram: { guardian: { id: string; name: string }; lidoEm: string }[];
  naoAbriram: { id: string; name: string }[];
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
  // Circular é só leitura: não há o que responder, o app registra sozinho quando a família abre.
  CIRCULAR: [],
};

/** Explica o que vale a resposta: autorização só para passeio/evento; reunião confirma presença. */
const AVISO_VALOR_DA_RESPOSTA: Record<string, string> = {
  AUTORIZACAO_PASSEIO:
    "Sua resposta vale como autorização (ou recusa) para a participação do aluno neste passeio ou evento da escola. Fica registrada com data, hora e IP.",
  CONFIRMACAO_REUNIAO: "Sua resposta confirma (ou não) a presença na reunião. Fica registrada com data e hora.",
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
  const [abertura, setAbertura] = useState<Abertura | null>(null);
  const [leituraEm, setLeituraEm] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<PendenteEntry[] | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [erroResposta, setErroResposta] = useState<string | null>(null);

  function loadGuardianView() {
    apiJson<{ comunicado: Comunicado; alunos: AlunoResposta[]; leituraEm: string | null }>(`/api/comunicados/${id}`).then((data) => {
      setComunicado(data.comunicado);
      setAlunos(data.alunos);
      setLeituraEm(data.leituraEm);
    });
  }

  function loadStaffView() {
    apiJson<{ comunicado: Comunicado; totalRespostas: number; totalPublicoAlvo: number; abertura: Abertura }>(
      `/api/comunicados/${id}`,
    ).then((data) => {
      setComunicado(data.comunicado);
      setStats({ totalRespostas: data.totalRespostas, totalPublicoAlvo: data.totalPublicoAlvo });
      setAbertura(data.abertura);
    });
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
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
          <TextoComLinks texto={comunicado.descricao} />
        </p>
      </div>

      {user.role === "GUARDIAN" && alunos && (
        <div className="space-y-3">
          {erroResposta && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {erroResposta}
            </p>
          )}
          {AVISO_VALOR_DA_RESPOSTA[comunicado.tipo] && (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {AVISO_VALOR_DA_RESPOSTA[comunicado.tipo]}
            </p>
          )}
          {comunicado.tipo === "CIRCULAR" && (
            <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
              {leituraEm
                ? `✓ Leitura registrada em ${formatarDataHora(leituraEm)}. Não é preciso responder.`
                : "Esta é uma circular: basta abrir para a leitura ficar registrada."}
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
              ) : opcoes.length > 0 ? (
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
              ) : null}
            </div>
          ))}
        </div>
      )}

      {(user.role === "ADMIN" || user.role === "STAFF") && (
        <div className="space-y-4">
          {stats && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <span className="text-sm font-medium">
                {comunicado.tipo === "CIRCULAR"
                  ? `${abertura?.abriram.length ?? 0} de ${abertura ? abertura.abriram.length + abertura.naoAbriram.length : stats.totalPublicoAlvo} famílias abriram`
                  : `${stats.totalRespostas} de ${stats.totalPublicoAlvo} responderam`}
              </span>
              <a
                href={`/api/comunicados/${id}/export`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Exportar CSV
              </a>
            </div>
          )}

          {abertura && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-2 font-semibold">Abertura</h2>
              <ul className="space-y-1 text-sm">
                {abertura.abriram.length === 0 && <li className="text-slate-500">Nenhuma família abriu ainda.</li>}
                {abertura.abriram.map((a) => (
                  <li key={a.guardian.id}>
                    <span className="font-medium text-green-700 dark:text-green-400">✓ Abriu</span> · {a.guardian.name} — {formatarDataHora(a.lidoEm)}
                  </li>
                ))}
              </ul>
              {abertura.naoAbriram.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Ainda não abriram ({abertura.naoAbriram.length})</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {abertura.naoAbriram.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span>{p.name}</span>
                        <button
                          type="button"
                          disabled={enviando === p.id}
                          onClick={() => reenviar(p.id)}
                          className="rounded-md border border-indigo-600 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                        >
                          Reenviar notificação
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {feedback && <p className="mt-2 text-xs text-green-600">{feedback}</p>}
            </div>
          )}

          {comunicado.tipo !== "CIRCULAR" && (
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
                  <button type="button"
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
          )}
        </div>
      )}
    </div>
  );
}

/** Texto do comunicado com os endereços https:// clicáveis (ex.: o link do Guia do app). */
function TextoComLinks({ texto }: { texto: string }) {
  return (
    <>
      {partesComLinks(texto).map((parte, i) =>
        parte.link ? (
          <a key={i} href={parte.texto} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-indigo-700 underline dark:text-indigo-300">
            {parte.texto}
          </a>
        ) : (
          <span key={i}>{parte.texto}</span>
        ),
      )}
    </>
  );
}
