"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { formatarDataHora } from "@/lib/datas";

interface MensagemResumo {
  id: string;
  titulo: string;
  resumo: string;
  ultimaAtividadeEm: string;
  autor: { id: string; name: string; cargo: string };
  respostas: number;
  naoLida: boolean;
}

/**
 * "Para toda a equipe": assuntos que a direção ou a coordenação escrevem para a equipe; todos
 * da equipe leem e respondem. Só aparece para a equipe (o servidor bloqueia famílias).
 */
export function MensagensEquipeGeral() {
  const router = useRouter();
  const [mensagens, setMensagens] = useState<MensagemResumo[] | null>(null);
  const [podeEscrever, setPodeEscrever] = useState(false);
  const [escrevendo, setEscrevendo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ mensagens: MensagemResumo[]; podeEscrever: boolean }>("/api/team-messages/geral")
      .then((d) => {
        setMensagens(d.mensagens);
        setPodeEscrever(d.podeEscrever);
      })
      .catch(() => setMensagens([]));
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const d = await apiJson<{ mensagem: { id: string } }>("/api/team-messages/geral", {
        method: "POST",
        body: JSON.stringify({ titulo, corpo }),
      });
      router.push(`/dashboard/mensagens/geral/${d.mensagem.id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar. Tente de novo.");
      setEnviando(false);
    }
  }

  if (mensagens === null) return null;
  if (mensagens.length === 0 && !podeEscrever) return null;

  const campo = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

  return (
    <section aria-labelledby="titulo-equipe-geral" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-equipe-geral" className="font-semibold">Para toda a equipe</h2>
        {podeEscrever && !escrevendo && (
          <button type="button" onClick={() => setEscrevendo(true)} className="rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950">
            Escrever para toda a equipe
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">A direção e a coordenação escrevem aqui. Toda a equipe vê e pode responder; as famílias não veem.</p>

      {escrevendo && (
        <form onSubmit={enviar} className="space-y-2">
          <input required maxLength={120} aria-label="Assunto" placeholder="Assunto (ex.: Reunião pedagógica de sexta)" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
          <textarea required maxLength={4000} aria-label="Mensagem para toda a equipe" placeholder="Mensagem" rows={4} value={corpo} onChange={(e) => setCorpo(e.target.value)} className={campo} />
          {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={enviando} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {enviando ? "Enviando..." : "Enviar para toda a equipe"}
            </button>
            <button type="button" onClick={() => setEscrevendo(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {mensagens.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma mensagem para a equipe ainda.</p>
      ) : (
        <ul className="space-y-2">
          {mensagens.map((m) => (
            <li key={m.id}>
              <Link
                href={`/dashboard/mensagens/geral/${m.id}`}
                className={`flex items-center justify-between gap-2 rounded-lg border p-3 hover:bg-slate-50 dark:hover:bg-slate-800 ${m.naoLida ? "border-indigo-300 dark:border-indigo-800" : "border-slate-200 dark:border-slate-800"}`}
              >
                <div className="min-w-0">
                  <p className="font-medium">{m.titulo}</p>
                  <p className="truncate text-xs text-slate-500">
                    {m.autor.cargo} · {m.respostas} {m.respostas === 1 ? "resposta" : "respostas"} · {formatarDataHora(m.ultimaAtividadeEm)}
                  </p>
                </div>
                {m.naoLida && <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">Nova</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
