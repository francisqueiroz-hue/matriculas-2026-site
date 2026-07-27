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

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const user = useCurrentUser();
  const [data, setData] = useState<ConversationData | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    apiJson<ConversationData>(`/api/messages/conversations/${id}`).then(setData);
  }

  useEffect(load, [id]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await apiJson<{ message: Message }>(`/api/messages/conversations/${id}`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      setData((prev) => (prev ? { ...prev, messages: [...prev.messages, res.message] } : prev));
      setText("");
    } finally {
      setSending(false);
    }
  }

  if (!data) return <p className="text-sm text-slate-500">Carregando conversa...</p>;

  const counterpart = user.id === data.conversation.staff.id ? data.conversation.guardian.name : data.conversation.staff.name;

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col">
      <h1 className="mb-3 text-lg font-bold">{counterpart}</h1>

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
                <p>{m.body}</p>
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
