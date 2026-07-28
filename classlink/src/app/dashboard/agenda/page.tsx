"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";

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

      <ul className="space-y-2">
        {events?.map((ev) => (
          <li
            key={ev.id}
            className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <p className="font-medium">{ev.title}</p>
              <p className="text-xs text-slate-500">
                {new Date(ev.startsAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                {ev.class?.name ?? "Toda a escola"}
              </p>
              {ev.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{ev.description}</p>}
            </div>
            {(user.role === "ADMIN" || user.id === ev.author.id) && (
              <button onClick={() => handleDelete(ev.id)} className="text-xs text-red-600 hover:underline">
                Remover
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
