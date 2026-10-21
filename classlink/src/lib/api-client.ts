"use client";

/**
 * Renovação de sessão em andamento (uma só por vez: vários 401 ao mesmo tempo esperam a
 * mesma) e trava usada pelo logout, para que nenhuma renovação reabra a sessão enquanto
 * a pessoa sai da conta.
 */
let renovacaoEmAndamento: Promise<boolean> | null = null;
let renovacaoSuspensa = false;

function renovarSessao(): Promise<boolean> {
  if (renovacaoSuspensa) return Promise.resolve(false);
  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        renovacaoEmAndamento = null;
      });
  }
  return renovacaoEmAndamento;
}

/** Logout: impede novas renovações (ou volta a permitir, se o logout não se confirmou). */
export function suspenderRenovacaoDeSessao(suspensa: boolean) {
  renovacaoSuspensa = suspensa;
}

/** Espera a renovação que já estava em andamento terminar (o logout só sai depois dela). */
export async function aguardarRenovacaoEmAndamento(): Promise<void> {
  if (renovacaoEmAndamento) await renovacaoEmAndamento;
}

/** Fetch autenticado por cookie, com uma tentativa de refresh automático em caso de 401. */
export async function apiFetch(path: string, init?: RequestInit) {
  const doFetch = () =>
    fetch(path, {
      ...init,
      credentials: "include",
      headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });

  let response = await doFetch();

  if (response.status === 401 && path !== "/api/auth/refresh" && path !== "/api/auth/login") {
    if (await renovarSessao()) {
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
