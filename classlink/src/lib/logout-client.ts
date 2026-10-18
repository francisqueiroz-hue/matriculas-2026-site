"use client";

import { apiFetch } from "@/lib/api-client";
import { desligarPushDoAparelho, tokenPushExistente } from "@/lib/firebase-client";

/**
 * Prazo de cada etapa do logout. Somados, limitam o pior caso a 10 s: depois disso quem
 * chama redireciona para o login, mesmo que alguma etapa nunca termine. O aviso ao servidor
 * tem o maior prazo porque é ele que apaga os cookies da sessão.
 */
export const PRAZOS_LOGOUT_MS = { token: 2_000, servidor: 4_000, push: 3_000, caches: 1_000 } as const;

/** Espera a promessa até `ms`; depois disso (ou se ela falhar) segue com `null`, sem lançar. */
async function noPrazo<T>(promessa: () => Promise<T>, ms: number, etapa: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<null>((resolver) => {
    timer = setTimeout(() => {
      console.warn(`[logout] tempo esgotado: ${etapa}`);
      resolver(null);
    }, ms);
  });
  try {
    return await Promise.race([promessa(), prazo]);
  } catch (err) {
    console.warn(`[logout] falha: ${etapa}`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sai da conta e limpa o aparelho: avisa o servidor (que revoga a sessão e apaga o token de
 * push deste aparelho), desliga o push no navegador e apaga as caches do app.
 * Cada etapa tem prazo próprio e nunca lança erro: quem chama redireciona para o login sempre.
 */
export async function sairDaConta(): Promise<void> {
  const pushToken = await noPrazo(() => tokenPushExistente(), PRAZOS_LOGOUT_MS.token, "token de push do aparelho");

  // Aborta a requisição se o prazo vencer, para não ficar pendurada em segundo plano.
  const controle = new AbortController();
  await noPrazo(
    () =>
      apiFetch("/api/auth/logout", {
        method: "POST",
        signal: controle.signal,
        ...(pushToken && { body: JSON.stringify({ pushToken }) }),
      }),
    PRAZOS_LOGOUT_MS.servidor,
    "aviso ao servidor",
  );
  controle.abort();

  await noPrazo(() => desligarPushDoAparelho(pushToken !== null), PRAZOS_LOGOUT_MS.push, "desligar o push do aparelho");

  await limparCachesDoApp();
}

/** Apaga todas as caches (Cache Storage) do app neste aparelho (com prazo, sem lançar). */
export async function limparCachesDoApp(): Promise<void> {
  if (typeof caches === "undefined") return;
  await noPrazo(
    async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.map((nome) => caches.delete(nome)));
    },
    PRAZOS_LOGOUT_MS.caches,
    "limpar as caches do app",
  );
}
