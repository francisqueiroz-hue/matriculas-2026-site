"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { uploadMediaFile } from "@/lib/upload-client";
import type { PostItem } from "@/components/PostCard";

interface ClassOption {
  id: string;
  name: string;
}

export function PostComposer({ onCreated }: { onCreated: (post: PostItem) => void }) {
  const user = useCurrentUser();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"SCHOOL" | "CLASS">(user.role === "STAFF" ? "CLASS" : "SCHOOL");
  const [classId, setClassId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    apiJson<{ classes: ClassOption[] }>("/api/admin/classes")
      .then((data) => {
        setClasses(data.classes);
        if (data.classes.length && user.role === "STAFF") setClassId(data.classes[0].id);
      })
      .catch(() => setError("Não foi possível carregar as turmas. Atualize a página para tentar de novo."));
  }, [user.role]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let mediaUrl: string | undefined;
      let mediaType: "image" | "video" | undefined;
      if (file) {
        const uploaded = await uploadMediaFile(file).catch((err: unknown) => {
          throw new Error(`Não foi possível enviar o anexo: ${err instanceof Error ? err.message : String(err)}`);
        });
        mediaUrl = uploaded.path;
        mediaType = uploaded.mediaType;
      }

      const data = await apiJson<{ post: PostItem }>("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          title,
          body,
          audience,
          classId: audience === "CLASS" ? classId : undefined,
          mediaUrl,
          mediaType,
        }),
      });

      onCreated(data.post);
      setTitle("");
      setBody("");
      setFile(null);
      setAberto(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar");
    } finally {
      setLoading(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
      >
        <span aria-hidden="true">＋</span> Novo aviso
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">Publicar novo aviso</h2>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-slate-500 hover:underline">
          Cancelar
        </button>
      </div>
      <input
        required
        aria-label="Título do aviso"
        placeholder="Título"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
      />
      <textarea
        required
        aria-label="Mensagem do aviso"
        placeholder="Mensagem"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
      />

      <div className="flex flex-wrap items-center gap-3">
        {user.role === "ADMIN" && (
          <select
            aria-label="Quem recebe"
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
            aria-label="Turma"
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

        <label className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 focus-within:outline focus-within:outline-2 focus-within:outline-indigo-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          <span aria-hidden="true">📎</span>
          <span className="truncate">{file ? file.name : "Anexar foto ou vídeo"}</span>
          <input
            type="file"
            aria-label="Anexar foto ou vídeo"
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>
        {file && (
          <button type="button" onClick={() => setFile(null)} className="text-xs text-slate-500 hover:underline">
            Remover anexo
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {loading ? "Publicando..." : "Publicar"}
      </button>
    </form>
  );
}
