"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { formatarDataHora, rotuloDiaRelativo } from "@/lib/datas";
import { separarEventos } from "@/lib/agenda";

interface ClassOption {
  id: string;
  name: string;
}

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  class: { id: string; name: string } | null;
  author: { id: string; name: string };
}

function EventoItem({
  ev,
  destaque = false,
  passado = false,
  podeRemover,
  onRemover,
}: {
  ev: EventItem;
  destaque?: boolean;
  passado?: boolean;
  podeRemover: boolean;
  onRemover: (id: string) => void;
}) {
  const relativo = passado ? null : rotuloDiaRelativo(ev.startsAt);
  return (
    <li
      className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${
        destaque
          ? "border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/40"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      } ${passado ? "opacity-80" : ""}`}
    >
      <div className="min-w-0">
        {destaque && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Próximo evento</p>}
        <h3 className={destaque ? "text-base font-semibold" : "font-medium"}>{ev.title}</h3>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
          {relativo && <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">{relativo}</span>}
          {formatarDataHora(ev.startsAt)} · {ev.class?.name ?? "Toda a escola"}
        </p>
        {ev.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{ev.description}</p>}
      </div>
      {podeRemover && (
        <button type="button" onClick={() => onRemover(ev.id)} className="shrink-0 px-2 py-1 text-xs text-red-600 hover:underline">
          Remover
        </button>
      )}
    </li>
  );
}

export default function AgendaPage() {
  const user = useCurrentUser();
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [classId, setClassId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiJson<{ events: EventItem[] }>("/api/events").then((data) => setEvents(data.events));
  }

  useEffect(load, []);
  useEffect(() => {
    if (user.role === "ADMIN" || user.role === "STAFF") {
      apiJson<{ classes: ClassOption[] }>("/api/admin/classes").then((data) => setClasses(data.classes));
    }
  }, [user.role]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiJson("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: description || undefined,
          startsAt: new Date(startsAt).toISOString(),
          classId: classId || undefined,
        }),
      });
      setTitle("");
      setDescription("");
      setStartsAt("");
      setClassId("");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar evento");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este evento?")) return;
    await apiJson(`/api/events/${id}`, { method: "DELETE" });
    load();
  }

  const canCreate = user.role === "ADMIN" || user.role === "STAFF";
  const { proximos, anteriores } = separarEventos(events ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Agenda escolar</h1>
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {showForm ? "Cancelar" : "Novo evento"}
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <input
            required
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
          <textarea
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
          <div className="flex flex-wrap gap-3">
            <input
              required
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">Toda a escola</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Criar evento
          </button>
        </form>
      )}

      {events === null && <p className="text-sm text-slate-500">Carregando agenda...</p>}
      {events?.length === 0 && <p className="text-sm text-slate-500">Nenhum evento cadastrado.</p>}

      {events && events.length > 0 && (
        <>
          <section aria-labelledby="titulo-proximos" className="space-y-2">
            <h2 id="titulo-proximos" className="font-semibold">
              Próximos eventos
            </h2>
            {proximos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                Nenhum evento marcado daqui para a frente.
              </p>
            ) : (
              <ul className="space-y-2">
                {proximos.map((ev, i) => (
                  <EventoItem key={ev.id} ev={ev} destaque={i === 0} podeRemover={user.role === "ADMIN" || user.id === ev.author.id} onRemover={handleDelete} />
                ))}
              </ul>
            )}
          </section>

          {anteriores.length > 0 && (
            <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Eventos anteriores ({anteriores.length})</span>
                <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <ul className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">
                {anteriores.map((ev) => (
                  <EventoItem key={ev.id} ev={ev} passado podeRemover={user.role === "ADMIN" || user.id === ev.author.id} onRemover={handleDelete} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
