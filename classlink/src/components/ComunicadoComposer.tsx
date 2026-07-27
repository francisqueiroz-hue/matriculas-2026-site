"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";

interface ClassOption {
  id: string;
  name: string;
}

const TIPOS = [
  { value: "AUTORIZACAO_PASSEIO", label: "Autorização de passeio" },
  { value: "CONFIRMACAO_REUNIAO", label: "Confirmação de reunião" },
  { value: "CIRCULAR", label: "Circular (confirmação de leitura)" },
];

export function ComunicadoComposer({ onCreated }: { onCreated: () => void }) {
  const user = useCurrentUser();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [tipo, setTipo] = useState("CIRCULAR");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [audience, setAudience] = useState<"SCHOOL" | "CLASS">(user.role === "STAFF" ? "CLASS" : "SCHOOL");
  const [classId, setClassId] = useState("");
  const [prazoResposta, setPrazoResposta] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ classes: ClassOption[] }>("/api/admin/classes")
      .then((data) => {
        setClasses(data.classes);
        if (data.classes.length && user.role === "STAFF") setClassId(data.classes[0].id);
      })
      .catch(() => {});
  }, [user.role]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiJson("/api/comunicados", {
        method: "POST",
        body: JSON.stringify({
          tipo,
          titulo,
          descricao,
          audience,
          classId: audience === "CLASS" ? classId : undefined,
          prazoResposta: prazoResposta ? new Date(prazoResposta).toISOString() : undefined,
        }),
      });
      setTitulo("");
      setDescricao("");
      setPrazoResposta("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar comunicado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-sm font-semibold text-slate-500">Novo comunicado</h2>

      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
      >
        {TIPOS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <input
        required
        placeholder="Título"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
      />
      <textarea
        required
        placeholder="Descrição"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
      />

      <div className="flex flex-wrap items-center gap-3">
        {user.role === "ADMIN" && (
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as "SCHOOL" | "CLASS")}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="SCHOOL">Toda a escola</option>
            <option value="CLASS">Turma específica</option>
          </select>
        )}

        {audience === "CLASS" && (
          <select
            required
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">Selecione a turma</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 text-xs text-slate-500">
          Prazo de resposta (opcional)
          <input
            type="datetime-local"
            value={prazoResposta}
            onChange={(e) => setPrazoResposta(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {loading ? "Publicando..." : "Publicar comunicado"}
      </button>
    </form>
  );
}
