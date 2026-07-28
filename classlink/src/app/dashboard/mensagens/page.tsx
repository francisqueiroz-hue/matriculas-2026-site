"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";

interface Conversation {
  id: string;
  staff: { id: string; name: string; role: string };
  guardian: { id: string; name: string };
  messages: { body: string; createdAt: string }[];
  _count: { messages: number };
}

interface Contact {
  id: string;
  name: string;
  role: string;
}

export default function MensagensPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [starting, setStarting] = useState(false);

  function loadConversations() {
    apiJson<{ conversations: Conversation[] }>("/api/messages/conversations").then((data) =>
      setConversations(data.conversations),
    );
  }

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 8000);
    return () => clearInterval(interval);
  }, []);

  async function startConversation(counterpartUserId: string) {
    setStarting(true);
    try {
      const data = await apiJson<{ conversation: { id: string } }>("/api/messages/conversations", {
        method: "POST",
        body: JSON.stringify({ counterpartUserId }),
      });
      router.push(`/dashboard/mensagens/${data.conversation.id}`);
    } finally {
      setStarting(false);
    }
  }

  async function openNew() {
    if (contacts.length === 0) {
      const data = await apiJson<{ contacts: Contact[] }>("/api/messages/contacts");
      setContacts(data.contacts);
    }
    setShowNew(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mensagens</h1>
        <button onClick={openNew} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
          Nova conversa
        </button>
      </div>

      {showNew && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-2 text-sm font-medium">Com quem você quer falar?</p>
          {contacts.length === 0 && <p className="text-sm text-slate-500">Nenhum contato disponível.</p>}
          <ul className="space-y-1">
            {contacts.map((c) => (
              <li key={c.id}>
                <button
                  disabled={starting}
                  onClick={() => startConversation(c.id)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {c.name} <span className="text-xs text-slate-400">({c.role === "GUARDIAN" ? "responsável" : c.role === "STAFF" ? "professor(a)" : "direção"})</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {conversations === null && <p className="text-sm text-slate-500">Carregando conversas...</p>}
      {conversations?.length === 0 && <p className="text-sm text-slate-500">Nenhuma conversa ainda.</p>}

      <ul className="space-y-2">
        {conversations?.map((c) => {
          const counterpart = user.id === c.staff.id ? c.guardian.name : `${c.staff.name}`;
          const last = c.messages[0];
          return (
            <li key={c.id}>
              <a
                href={`/dashboard/mensagens/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <div>
                  <p className="font-medium">{counterpart}</p>
                  {last && <p className="truncate text-xs text-slate-500">{last.body}</p>}
                </div>
                {c._count.messages > 0 && (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">{c._count.messages}</span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
