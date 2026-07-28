"use client";

import { useEffect, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";

interface ClassItem {
  id: string;
  name: string;
  year: number;
  _count: { students: number };
}

function TurmasContent() {
  const [classes, setClasses] = useState<ClassItem[] | null>(null);
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiJson<{ classes: ClassItem[] }>("/api/admin/classes").then((data) => setClasses(data.classes));
  }
  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiJson("/api/admin/classes", { method: "POST", body: JSON.stringify({ name, year }) });
      setName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar turma");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta turma? Alunos vinculados também serão removidos.")) return;
    await apiJson(`/api/admin/classes/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Turmas</h1>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label className="mb-1 block text-xs font-medium">Nome</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: 3º Ano A"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Ano letivo</label>
          <input
            required
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          Criar turma
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <ul className="space-y-2">
        {classes?.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <span>
              {c.name} <span className="text-xs text-slate-500">({c.year}) · {c._count.students} aluno(s)</span>
            </span>
            <button onClick={() => handleDelete(c.id)} className="text-xs text-red-600 hover:underline">
              Remover
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TurmasPage() {
  return (
    <AdminGuard>
      <TurmasContent />
    </AdminGuard>
  );
}
