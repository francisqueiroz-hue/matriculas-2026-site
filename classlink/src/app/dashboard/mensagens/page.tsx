"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";

interface GuardianConversation {
  id: string;
  staff: { id: string; name: string; role: string };
  guardian: { id: string; name: string };
  messages: { body: string; createdAt: string }[];
  _count: { messages: number };
}

interface TeamConversation {
  id: string;
  userA: { id: string; name: string; role: string };
  userB: { id: string; name: string; role: string };
  messages: { body: string; createdAt: string }[];
  _count: { messages: number };
}

interface Contact {
  id: string;
  name: string;
  role: string;
  /** "Direção", "Coordenação", "Professor(a)", "Responsável". */
  cargo?: string;
}

/** Item já normalizado para exibição na lista, seja ele uma conversa com responsável ou com colega de equipe. */
interface ConversaExibida {
  id: string;
  tipo: "responsavel" | "equipe";
  contraparte: string;
  ultimaMensagem: string | null;
  naoLidas: number;
  criadaEm: string;
}

const ROLE_LABEL: Record<string, string> = { GUARDIAN: "responsável", STAFF: "equipe", ADMIN: "direção" };

/** Regra da escola, mostrada ao abrir "Nova conversa" (a mesma aplicada pelo servidor). */
const REGRA_MENSAGENS: Record<string, string> = {
  familia: "As mensagens da família são atendidas pela direção e pela coordenação.",
  gestao: "Direção e coordenação conversam com as famílias e com toda a equipe.",
  professor: "Professores e auxiliares conversam com a direção e a coordenação. Assuntos com as famílias passam pela coordenação.",
};

export default function MensagensPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const podeFalarComEquipe = user.role === "ADMIN" || user.role === "STAFF";

  const [conversas, setConversas] = useState<ConversaExibida[] | null>(null);
  const [contatosResponsaveis, setContatosResponsaveis] = useState<Contact[]>([]);
  const [contatosEquipe, setContatosEquipe] = useState<Contact[]>([]);
  const [perfil, setPerfil] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [starting, setStarting] = useState(false);

  function loadConversations() {
    const pedidos: Promise<ConversaExibida[]>[] = [
      apiJson<{ conversations: GuardianConversation[] }>("/api/messages/conversations").then((data) =>
        data.conversations.map((c) => ({
          id: c.id,
          tipo: "responsavel" as const,
          contraparte: user.id === c.staff.id ? c.guardian.name : c.staff.name,
          ultimaMensagem: c.messages[0]?.body ?? null,
          naoLidas: c._count.messages,
          criadaEm: c.messages[0]?.createdAt ?? "",
        })),
      ),
    ];

    if (podeFalarComEquipe) {
      pedidos.push(
        apiJson<{ conversations: TeamConversation[] }>("/api/team-messages/conversations").then((data) =>
          data.conversations.map((c) => {
            const contraparte = user.id === c.userA.id ? c.userB : c.userA;
            return {
              id: c.id,
              tipo: "equipe" as const,
              contraparte: contraparte.name,
              ultimaMensagem: c.messages[0]?.body ?? null,
              naoLidas: c._count.messages,
              criadaEm: c.messages[0]?.createdAt ?? "",
            };
          }),
        ),
      );
    }

    Promise.all(pedidos).then((listas) => {
      const todas = listas.flat().sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : -1));
      setConversas(todas);
    });
  }

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startConversation(counterpartUserId: string, tipo: "responsavel" | "equipe") {
    setStarting(true);
    try {
      const path = tipo === "equipe" ? "/api/team-messages/conversations" : "/api/messages/conversations";
      const data = await apiJson<{ conversation: { id: string } }>(path, {
        method: "POST",
        body: JSON.stringify({ counterpartUserId }),
      });
      router.push(tipo === "equipe" ? `/dashboard/mensagens/${data.conversation.id}?tipo=equipe` : `/dashboard/mensagens/${data.conversation.id}`);
    } finally {
      setStarting(false);
    }
  }

  async function openNew() {
    if (contatosResponsaveis.length === 0 && contatosEquipe.length === 0) {
      const pedidos: Promise<void>[] = [
        apiJson<{ contacts: Contact[]; perfil: string }>("/api/messages/contacts").then((data) => {
          setContatosResponsaveis(data.contacts);
          setPerfil(data.perfil);
        }),
      ];
      if (podeFalarComEquipe) {
        pedidos.push(
          apiJson<{ contacts: Contact[] }>("/api/team-messages/contacts").then((data) => setContatosEquipe(data.contacts)),
        );
      }
      await Promise.all(pedidos);
    }
    setShowNew(true);
  }

  const semContatos = contatosResponsaveis.length === 0 && contatosEquipe.length === 0;

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
          <p className="text-sm font-medium">Com quem você quer falar?</p>
          {perfil && <p className="mb-2 text-xs text-slate-500">{REGRA_MENSAGENS[perfil]}</p>}
          {semContatos && <p className="text-sm text-slate-500">Nenhum contato disponível.</p>}

          {contatosEquipe.length > 0 && (
            <>
              <p className="mt-2 mb-1 text-xs font-semibold uppercase text-slate-400">Equipe</p>
              <ul className="space-y-1">
                {contatosEquipe.map((c) => (
                  <li key={`equipe-${c.id}`}>
                    <button
                      disabled={starting}
                      onClick={() => startConversation(c.id, "equipe")}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {c.name} <span className="text-xs text-slate-400">({(c.cargo ?? ROLE_LABEL[c.role] ?? c.role).toLowerCase()})</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {contatosResponsaveis.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-xs font-semibold uppercase text-slate-400">
                {user.role === "GUARDIAN" ? "Equipe da escola" : "Responsáveis"}
              </p>
              <ul className="space-y-1">
                {contatosResponsaveis.map((c) => (
                  <li key={`resp-${c.id}`}>
                    <button
                      disabled={starting}
                      onClick={() => startConversation(c.id, "responsavel")}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {c.name} <span className="text-xs text-slate-400">({(c.cargo ?? ROLE_LABEL[c.role] ?? c.role).toLowerCase()})</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {conversas === null && <p className="text-sm text-slate-500">Carregando conversas...</p>}
      {conversas?.length === 0 && <p className="text-sm text-slate-500">Nenhuma conversa ainda.</p>}

      <ul className="space-y-2">
        {conversas?.map((c) => (
          <li key={`${c.tipo}-${c.id}`}>
            <a
              href={c.tipo === "equipe" ? `/dashboard/mensagens/${c.id}?tipo=equipe` : `/dashboard/mensagens/${c.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <div>
                <p className="font-medium">
                  {c.contraparte}
                  {c.tipo === "equipe" && <span className="ml-2 text-xs font-normal text-slate-400">· equipe</span>}
                </p>
                {c.ultimaMensagem && <p className="truncate text-xs text-slate-500">{c.ultimaMensagem}</p>}
              </div>
              {c.naoLidas > 0 && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">{c.naoLidas}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
