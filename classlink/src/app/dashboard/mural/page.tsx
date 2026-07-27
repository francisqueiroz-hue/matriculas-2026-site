"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { PostCard, type PostItem } from "@/components/PostCard";
import { PostComposer } from "@/components/PostComposer";

export default function MuralPage() {
  const user = useCurrentUser();
  const [posts, setPosts] = useState<PostItem[] | null>(null);

  useEffect(() => {
    apiJson<{ posts: PostItem[] }>("/api/posts").then((data) => setPosts(data.posts));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mural de avisos</h1>

      {(user.role === "ADMIN" || user.role === "STAFF") && (
        <PostComposer onCreated={(post) => setPosts((prev) => [post, ...(prev ?? [])])} />
      )}

      {posts === null && <p className="text-sm text-slate-500">Carregando avisos...</p>}
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
    </div>
  );
}
