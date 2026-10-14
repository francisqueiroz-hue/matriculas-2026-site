"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { juntarPaginas } from "@/lib/paginacao";
import { PostCard, type PostItem } from "@/components/PostCard";
import { PostComposer } from "@/components/PostComposer";

type PaginaPosts = { posts: PostItem[]; nextCursor: string | null };

export default function MuralPage() {
  const user = useCurrentUser();
  const [posts, setPosts] = useState<PostItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiJson<PaginaPosts>("/api/posts")
      .then((data) => {
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
      })
      .catch(() => setErro("Não foi possível carregar os avisos. Atualize a página."));
  }, []);

  async function carregarMais() {
    if (!nextCursor || carregandoMais) return;
    setCarregandoMais(true);
    setErro(null);
    try {
      const data = await apiJson<PaginaPosts>(`/api/posts?cursor=${encodeURIComponent(nextCursor)}`);
      setPosts((prev) => juntarPaginas(prev ?? [], data.posts));
      setNextCursor(data.nextCursor);
    } catch {
      setErro("Não foi possível carregar mais avisos. Tente novamente.");
    } finally {
      setCarregandoMais(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mural de avisos</h1>

      {(user.role === "ADMIN" || user.role === "STAFF") && (
        <PostComposer onCreated={(post) => setPosts((prev) => [post, ...(prev ?? [])])} />
      )}

      {posts === null && !erro && <p className="text-sm text-slate-500">Carregando avisos...</p>}
      {posts?.length === 0 && <p className="text-sm text-slate-500">Nenhum aviso publicado ainda.</p>}

      <div className="space-y-3">
        {posts?.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onDeleted={(id) => setPosts((prev) => prev?.filter((p) => p.id !== id) ?? null)}
          />
        ))}
      </div>

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={carregarMais}
          disabled={carregandoMais}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {carregandoMais ? "Carregando..." : "Carregar mais avisos"}
        </button>
      )}
    </div>
  );
}
