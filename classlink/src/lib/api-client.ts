"use client";

/** Fetch autenticado por cookie, com uma tentativa de refresh automático em caso de 401. */
export async function apiFetch(path: string, init?: RequestInit) {
  const doFetch = () =>
    fetch(path, {
      ...init,
      credentials: "include",
      headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });

  let response = await doFetch();

  if (response.status === 401 && path !== "/api/auth/refresh") {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    if (refreshed.ok) {
      response = await doFetch();
    }
  }

  return response;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? `Erro ${response.status}`);
  }
  return data as T;
}
