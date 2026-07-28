"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";

interface Message {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string; role: string };
}

interface ConversationData {
  conversation: { id: string; staff: { id: string; name: string }; guardian: { id: string; name: string } };
  messages: Message[];
}

const ITENS_REQUISICAO = [
  "Lenço umedecido",
  "Fraldas",
  "Pomada de assadura",
  "Shampoo",
  "Pasta de dente",
  "Escova de dente",
  "Troca de roupa",
];

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const user = useCurrentUser();
  const [data, setData] = useState<ConversationData | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showRequisicao, setShowRequisicao] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState<string[]>([]);
  const [itemOutro, setItemOutro] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    apiJson<ConversationData>(`/api/messages/conversations/${id}`).then(setData);
  }

  useEffect(load, [id]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  async function enviarMensagem(body: string) {
    setSending(true);
    try {
      const res = await apiJson<{ message: Message }>(`/api/messages/conversations/${id}`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setData((prev) => (prev ? { ...prev, messages: [...prev.messages, res.message] } : prev));
    } finally {
      setSending(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await enviarMensagem(text);
    setText("");
  }

  function toggleItem(item: string) {
    setItensSelecionados((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  }

  async function handleEnviarRequisicao(e: React.FormEvent) {
    e.preventDefault();
    const itens = [...itensSelecionados, ...(itemOutro.trim() ? [itemOutro.trim()] : [])];
    if (itens.length === 0) return;
    const corpo = `📋 Requisição de itens pessoais:\n${itens.map((i) => `- ${i}`).join("\n")}\n\nPor favor, providencie o quanto antes. Obrigado!`;
    await enviarMensagem(corpo);
    setItensSelecionados([]);
    setItemOutro("");
    setShowRequisicao(false);
  }

  if (!data) return <p className="text-sm text-slate-500">Carregando conversa...</p>;

  const souStaff = user.id === data.conversation.staff.id;
  const counterpart = souStaff ? data.conversation.guardian.name : data.conversation.staff.name;

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">{counterpart}</h1>
        {souStaff && (
          <button
            onClick={() => setShowRequisicao((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
          >
            📋 Requisição
          </button>
        )}
      </div>

      {showRequisicao && (
        <form
          onSubmit={handleEnviarRequisicao}
          className="mb-3 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40"
        >
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Solicitar itens de uso pessoal à família
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ITENS_REQUISICAO.map((item) => (
              <label key={item} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={itensSelecionados.includes(item)} onChange={() => toggleItem(item)} />
                {item}
              </label>
            ))}
          </div>
          <input
            value={itemOutro}
            onChange={(e) => setItemOutro(e.target.value)}
            placeholder="Outro item (opcional)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={sending || (itensSelecionados.length === 0 && !itemOutro.trim())}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Enviar requisição
            </button>
            <button
              type="button"
              onClick={() => setShowRequisicao(false)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        {data.messages.map((m) => {
          const mine = m.sender.id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? "text-indigo-100" : "text-slate-400"}`}>
                  {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva uma mensagem..."
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
