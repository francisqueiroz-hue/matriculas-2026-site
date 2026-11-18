"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { useConsultaAdaptativa } from "@/lib/consulta-adaptativa";
import { formatarDataHora } from "@/lib/datas";
import { ehGestao, perfilAcessoDe } from "@/lib/equipe";

interface Pessoa {
  id: string;
  name: string;
  cargo: string;
}
interface Resposta {
  id: string;
  corpo: string;
  createdAt: string;
  autor: Pessoa;
}
interface MensagemEquipe {
  id: string;
  titulo: string;
  corpo: string;
  createdAt: string;
  autor: Pessoa;
  respostas: Resposta[];
}

/** Assunto para toda a equipe: a mensagem da gestão e as respostas de todos, visíveis a toda a equipe. */
export default function MensagemEquipeGeralPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useCurrentUser();
  const [mensagem, setMensagem] = useState<MensagemEquipe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const carregouRef = useRef(false);
  const ultimaVistaRef = useRef<string | null>(null);

  /** Carrega o assunto; devolve true se apareceu resposta nova desde a última consulta. */
  async function carregar(): Promise<boolean> {
    try {
      const d = await apiJson<{ mensagem: MensagemEquipe }>(`/api/team-messages/geral/${id}`);
      carregouRef.current = true;
      setErro(null);
      setMensagem(d.mensagem);
      const ultima = d.mensagem.respostas[d.mensagem.respostas.length - 1]?.id ?? "";
      const mudou = ultima !== ultimaVistaRef.current;
      ultimaVistaRef.current = ultima;
      return mudou;
    } catch (err) {
      // Na primeira carga mostra o erro; depois, uma falha de rede passageira não apaga a conversa.
      if (!carregouRef.current) setErro(err instanceof Error ? err.message : "Não foi possível abrir a mensagem.");
      return false;
    }
  }

  // Respostas dos colegas aparecem sozinhas: consulta a cada 8 s e espaça até 30 s enquanto
  // ninguém responde; resposta nova, envio ou voltar para a aba trazem de volta aos 8 s.
  // Com a aba oculta não consulta (abrir é o que marca como lida).
  const reiniciarConsulta = useConsultaAdaptativa(
    async () => (document.visibilityState === "visible" ? carregar() : false),
    { baseMs: 8_000, maxMs: 30_000, ocultoMs: null },
  );

  // Trocou de assunto: começa do zero.
  useEffect(() => {
    carregouRef.current = false;
    ultimaVistaRef.current = null;
    reiniciarConsulta();
  }, [id, reiniciarConsulta]);

  async function responder(e: React.FormEvent) {
    e.preventDefault();
    setErroEnvio(null);
    setEnviando(true);
    try {
      const d = await apiJson<{ resposta: Resposta }>(`/api/team-messages/geral/${id}`, { method: "POST", body: JSON.stringify({ corpo: texto }) });
      setMensagem((m) => (m && !m.respostas.some((r) => r.id === d.resposta.id) ? { ...m, respostas: [...m.respostas, d.resposta] } : m));
      setTexto("");
      reiniciarConsulta();
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : "Não foi possível enviar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  async function excluir() {
    if (!confirm("Excluir esta mensagem e todas as respostas, para toda a equipe? Não será possível recuperar.")) return;
    try {
      await apiJson(`/api/team-messages/geral/${id}`, { method: "DELETE" });
      router.push("/dashboard/mensagens");
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  if (erro) return <p role="alert" className="text-sm text-red-600">{erro}</p>;
  if (!mensagem) return <p className="text-sm text-slate-500">Carregando mensagem...</p>;

  const podeExcluir = ehGestao(perfilAcessoDe(user));

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/dashboard/mensagens" className="text-sm text-indigo-600 hover:underline">← Mensagens</Link>
      <div>
        <p className="text-xs font-semibold uppercase text-slate-400">Para toda a equipe</p>
        <h1 className="text-xl font-bold">{mensagem.titulo}</h1>
        <p className="text-xs text-slate-500">
          {mensagem.autor.name} ({mensagem.autor.cargo}) · {formatarDataHora(mensagem.createdAt)}
        </p>
        <p className="mt-3 whitespace-pre-wrap text-sm">{mensagem.corpo}</p>
      </div>

      <section aria-labelledby="titulo-respostas" className="space-y-2">
        <h2 id="titulo-respostas" className="font-semibold">Respostas ({mensagem.respostas.length})</h2>
        {mensagem.respostas.length === 0 && <p className="text-sm text-slate-500">Ninguém respondeu ainda.</p>}
        <ul className="space-y-2">
          {mensagem.respostas.map((r) => (
            <li key={r.id} className={`rounded-lg border p-3 text-sm ${r.autor.id === user.id ? "border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/40" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
              <p className="text-xs text-slate-500">
                {r.autor.name} ({r.autor.cargo}) · {formatarDataHora(r.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{r.corpo}</p>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={responder} className="space-y-2">
        <label htmlFor="resposta-equipe" className="block text-sm font-medium">Sua resposta (toda a equipe vê)</label>
        <textarea id="resposta-equipe" required maxLength={4000} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
        {erroEnvio && <p role="alert" className="text-sm text-red-600">{erroEnvio}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={enviando} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {enviando ? "Enviando..." : "Responder"}
          </button>
          {podeExcluir && (
            <button type="button" onClick={excluir} className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50">
              Excluir mensagem
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
