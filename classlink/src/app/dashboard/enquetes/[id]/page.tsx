"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { formatarDataHora } from "@/lib/datas";

interface Pergunta {
  id: string;
  tipo: string;
  texto: string;
  obrigatoria: boolean;
  opcoes: { escolhas?: string[] } | null;
}
interface Enquete {
  id: string;
  titulo: string;
  descricao: string | null;
  audience: "SCHOOL" | "CLASS" | "STUDENT";
  anonima: boolean;
  prazo: string | null;
  encerradaEm: string | null;
  aberta: boolean;
  class: { id: string; name: string } | null;
  aluno: { id: string; name: string } | null;
  perguntas: Pergunta[];
}
interface Resultado {
  perguntaId: string;
  texto: string;
  tipo: string;
  respondentes: number;
  media?: number;
  distribuicao?: { valor: string; total: number }[];
  textos?: string[];
}
interface Resultados {
  totalRespostas: number;
  totalPublico: number;
  anonima: boolean;
  detalhesLiberados: boolean;
  aviso?: string;
  resultados: Resultado[];
}

type Valores = Record<string, string | number>;

const chaveRascunho = (id: string) => `enquete-rascunho:${id}`;

function lerRascunho(id: string): Valores {
  try {
    const bruto = localStorage.getItem(chaveRascunho(id));
    return bruto ? (JSON.parse(bruto) as Valores) : {};
  } catch {
    return {};
  }
}
function gravarRascunho(id: string, valores: Valores) {
  try {
    localStorage.setItem(chaveRascunho(id), JSON.stringify(valores));
  } catch {
    // sem armazenamento (janela privada etc.): o rascunho simplesmente não é guardado
  }
}
function apagarRascunho(id: string) {
  try {
    localStorage.removeItem(chaveRascunho(id));
  } catch {
    // ignora
  }
}

function PerguntaCampo({ p, indice, valor, onChange }: { p: Pergunta; indice: number; valor: string | number | undefined; onChange: (v: string | number) => void }) {
  const opcoesRadio = p.tipo === "NOTA" ? [1, 2, 3, 4, 5] : p.tipo === "SIM_NAO" ? ["Sim", "Não"] : p.tipo === "ESCOLHA" ? (p.opcoes?.escolhas ?? []) : [];
  return (
    <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <legend className="px-1 text-sm font-medium">
        {indice}. {p.texto} {!p.obrigatoria && <span className="text-xs font-normal text-slate-500">(opcional)</span>}
      </legend>
      {p.tipo === "TEXTO" ? (
        <textarea
          aria-label={`Resposta da pergunta ${indice}`}
          rows={3}
          maxLength={2000}
          value={typeof valor === "string" ? valor : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
      ) : (
        <div className={p.tipo === "NOTA" ? "flex flex-wrap gap-2" : "space-y-1"}>
          {opcoesRadio.map((o) => (
            <label
              key={String(o)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
                valor === o ? "border-indigo-600 bg-indigo-50 font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200" : "border-slate-300 dark:border-slate-700"
              }`}
            >
              <input type="radio" name={`p-${p.id}`} checked={valor === o} onChange={() => onChange(o)} />
              {o}
            </label>
          ))}
        </div>
      )}
      {p.tipo === "NOTA" && <p className="text-xs text-slate-500">1 = muito insatisfeito · 5 = muito satisfeito</p>}
    </fieldset>
  );
}

function FormularioFamilia({ enquete, onEnviada }: { enquete: Enquete; onEnviada: () => void }) {
  // O formulário só aparece depois que a enquete carrega no navegador, então ler o rascunho aqui é seguro.
  const [valores, setValores] = useState<Valores>(() => lerRascunho(enquete.id));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function mudar(perguntaId: string, valor: string | number) {
    setValores((atual) => {
      const novo = { ...atual, [perguntaId]: valor };
      gravarRascunho(enquete.id, novo);
      return novo;
    });
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await apiJson(`/api/enquetes/${enquete.id}/responder`, { method: "POST", body: JSON.stringify({ respostas: valores }) });
      apagarRascunho(enquete.id);
      onEnviada();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {enquete.anonima
          ? "Esta enquete é anônima: a escola sabe quantas famílias responderam, mas não vê quem escreveu cada resposta. Depois de enviada, a resposta não pode ser alterada. Enquanto você não envia, o que preencheu fica guardado neste aparelho."
          : "Esta enquete é identificada: a escola vê o seu nome junto das respostas. Depois de enviada, a resposta não pode ser alterada. Enquanto você não envia, o que preencheu fica guardado neste aparelho."}
      </p>
      {enquete.perguntas.map((p, i) => (
        <PerguntaCampo key={p.id} p={p} indice={i + 1} valor={valores[p.id]} onChange={(v) => mudar(p.id, v)} />
      ))}
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      <button type="submit" disabled={enviando} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
        {enviando ? "Enviando…" : "Enviar respostas"}
      </button>
    </form>
  );
}

function Barras({ r }: { r: Resultado }) {
  const total = (r.distribuicao ?? []).reduce((a, d) => a + d.total, 0);
  return (
    <ul className="space-y-1">
      {(r.distribuicao ?? []).map((d) => {
        const pct = total ? Math.round((d.total / total) * 100) : 0;
        return (
          <li key={d.valor} className="text-sm">
            <div className="flex justify-between">
              <span>{d.valor}</span>
              <span className="text-slate-500">{d.total} ({pct}%)</span>
            </div>
            <div className="h-2 rounded bg-slate-100 dark:bg-slate-800" aria-hidden="true">
              <div className="h-2 rounded bg-indigo-600" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PainelEscola({ enquete }: { enquete: Enquete }) {
  const [res, setRes] = useState<Resultados | null>(null);
  const [pendentes, setPendentes] = useState<{ id: string; name: string }[] | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aberta, setAberta] = useState(enquete.aberta);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Resultados>(`/api/enquetes/${enquete.id}/resultados`).then(setRes).catch(() => setErro("Não foi possível carregar os resultados."));
    if (!enquete.anonima) {
      apiJson<{ pendentes: { id: string; name: string }[] }>(`/api/enquetes/${enquete.id}/pendentes`).then((d) => setPendentes(d.pendentes)).catch(() => setPendentes([]));
    }
  }, [enquete.id, enquete.anonima]);

  async function encerrar() {
    try {
      await apiJson(`/api/enquetes/${enquete.id}/encerrar`, { method: "POST" });
      setAberta(false);
      setConfirmando(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível encerrar.");
    }
  }

  return (
    <div className="space-y-4">
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      {res && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-sm font-medium">
            {res.totalRespostas} de {res.totalPublico} famílias responderam · {res.anonima ? "Anônima" : "Identificada"} · {aberta ? "Aberta" : "Encerrada"}
          </span>
          <span className="flex gap-2">
            {res.detalhesLiberados && (
              <a href={`/api/enquetes/${enquete.id}/export`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                Exportar CSV
              </a>
            )}
            {aberta && !confirmando && (
              <button type="button" onClick={() => setConfirmando(true)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                Encerrar enquete
              </button>
            )}
            {aberta && confirmando && (
              <>
                <button type="button" onClick={encerrar} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white">Confirmar encerramento</button>
                <button type="button" onClick={() => setConfirmando(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">Voltar</button>
              </>
            )}
          </span>
        </div>
      )}

      {res && !res.detalhesLiberados && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{res.aviso}</p>}

      {res?.resultados.map((r, i) => (
        <section key={r.perguntaId} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-medium">{i + 1}. {r.texto}</h3>
          <p className="text-xs text-slate-500">
            {r.respondentes} {r.respondentes === 1 ? "resposta" : "respostas"}
            {r.tipo === "NOTA" && r.respondentes > 0 && <> · média <strong>{r.media?.toLocaleString("pt-BR")}</strong> de 5</>}
          </p>
          {r.distribuicao && <Barras r={r} />}
          {r.textos && (r.textos.length === 0 ? <p className="text-sm text-slate-500">Nenhum comentário.</p> : (
            <ul className="space-y-2">
              {r.textos.map((t, k) => <li key={k} className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">{t}</li>)}
            </ul>
          ))}
        </section>
      ))}

      {!enquete.anonima && pendentes && (
        <div>
          <h2 className="mb-2 font-semibold">Ainda não responderam</h2>
          {pendentes.length === 0 ? <p className="text-sm text-slate-500">Todos já responderam.</p> : (
            <ul className="space-y-1">
              {pendentes.map((p) => <li key={p.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-800 dark:bg-slate-900">{p.name}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function EnqueteDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const user = useCurrentUser();
  const [enquete, setEnquete] = useState<Enquete | null>(null);
  const [respondidaEm, setRespondidaEm] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function load() {
    apiJson<{ enquete: Enquete; respondidaEm?: string | null }>(`/api/enquetes/${id}`)
      .then((d) => {
        setEnquete(d.enquete);
        setRespondidaEm(d.respondidaEm ?? null);
      })
      .catch(() => setErro("Não foi possível abrir esta enquete."));
  }
  useEffect(load, [id]);

  if (erro) return <p role="alert" className="text-sm text-red-600">{erro}</p>;
  if (!enquete) return <p className="text-sm text-slate-500">Carregando enquete...</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">{enquete.titulo}</h1>
        <p className="text-xs text-slate-500">
          {enquete.audience === "SCHOOL" ? "Toda a escola" : enquete.audience === "STUDENT" ? `Individual — ${enquete.aluno?.name}` : enquete.class?.name}
          {enquete.prazo && <> · responder até {formatarDataHora(enquete.prazo)}</>}
        </p>
        {enquete.descricao && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{enquete.descricao}</p>}
      </div>

      {user.role === "GUARDIAN" ? (
        respondidaEm ? (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
            ✓ Resposta enviada em {formatarDataHora(respondidaEm)}. Obrigado por participar!
          </p>
        ) : !enquete.aberta ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Esta enquete foi encerrada.</p>
        ) : (
          <FormularioFamilia enquete={enquete} onEnviada={load} />
        )
      ) : (
        <PainelEscola enquete={enquete} />
      )}
    </div>
  );
}
