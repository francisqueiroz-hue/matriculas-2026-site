"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";

export interface PostItem {
  id: string;
  title: string;
  body: string;
  mediaUrl: string | null;
  mediaType: string | null;
  audience: "SCHOOL" | "CLASS";
  createdAt: string;
  author: { id: string; name: string; role: string };
  class: { id: string; name: string } | null;
  _count: { reads: number };
  readByMe: boolean;
}

interface ReadEntry {
  id: string;
  readAt: string;
  user: { id: string; name: string; role: string };
}

export function PostCard({ post, onDeleted }: { post: PostItem; onDeleted?: (id: string) => void }) {
  const user = useCurrentUser();
  const [readByMe, setReadByMe] = useState(post.readByMe);
  const [showReaders, setShowReaders] = useState(false);
  const [readers, setReaders] = useState<ReadEntry[] | null>(null);

  const canModerate = user.role === "ADMIN" || user.id === post.author.id;
  const canSeeReaders = user.role === "ADMIN" || user.role === "STAFF";

  useEffect(() => {
    if (user.role === "GUARDIAN" && !readByMe) {
      apiJson(`/api/posts/${post.id}/read`, { method: "POST" })
        .then(() => setReadByMe(true))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  async function confirmRead() {
    await apiJson(`/api/posts/${post.id}/read`, { method: "POST" });
    setReadByMe(true);
  }

  async function toggleReaders() {
    if (showReaders) {
      setShowReaders(false);
      return;
    }
    if (!readers) {
      const data = await apiJson<{ reads: ReadEntry[] }>(`/api/posts/${post.id}/reads`);
      setReaders(data.reads);
    }
    setShowReaders(true);
  }

  async function handleDelete() {
    if (!confirm("Remover este aviso?")) return;
    await apiJson(`/api/posts/${post.id}`, { method: "DELETE" });
    onDeleted?.(post.id);
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{post.title}</h3>
          <p className="text-xs text-slate-500">
            {post.author.name} ·{" "}
            {post.audience === "SCHOOL" ? "Toda a escola" : post.class?.name ?? "Turma"} ·{" "}
            {new Date(post.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
        {canModerate && (
          <button onClick={handleDelete} className="text-xs text-red-600 hover:underline">
            Remover
          </button>
        )}
      </div>

      <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{post.body}</p>

      {post.mediaUrl && post.mediaType === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.mediaUrl} alt="" className="mt-3 max-h-96 w-full rounded-lg object-cover" />
      )}
      {post.mediaUrl && post.mediaType === "video" && (
        <video src={post.mediaUrl} controls className="mt-3 max-h-96 w-full rounded-lg" />
      )}

      <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
        {user.role === "GUARDIAN" ? (
          readByMe ? (
            <span className="text-green-600">✓ Lido</span>
          ) : (
            <button onClick={confirmRead} className="font-medium text-indigo-600 hover:underline">
              Confirmar leitura
            </button>
          )
        ) : null}

        {canSeeReaders && (
          <button onClick={toggleReaders} className="text-slate-500 hover:underline">
            {post._count.reads} confirmação(ões) · ver quem leu
          </button>
        )}
      </div>

      {showReaders && (
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          {readers?.length ? (
            readers.map((r) => (
              <li key={r.id}>
                {r.user.name} — {new Date(r.readAt).toLocaleString("pt-BR")}
              </li>
            ))
          ) : (
            <li>Ninguém confirmou leitura ainda.</li>
          )}
        </ul>
      )}
    </article>
  );
}
