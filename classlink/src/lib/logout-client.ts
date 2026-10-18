"use client";

import { apiFetch } from "@/lib/api-client";
import { desligarPushDoAparelho, tokenPushExistente } from "@/lib/firebase-client";

/**
 * Sai da conta e limpa o aparelho: avisa o servidor (que revoga a sessão e apaga o token de
 * push deste aparelho), desliga o push no navegador e apaga as caches do app.
 * Cada limpeza é independente e nunca lança erro: quem chama redireciona para o login sempre.
 */
export async function sairDaConta(): Promise<void> {
  let pushToken: string | null = null;
  try {
    pushToken = await tokenPushExistente();
  } catch (err) {
    console.warn("[logout] não foi possível ler o token de push do aparelho", err);
  }

  try {
    await apiFetch("/api/auth/logout", {
      method: "POST",
      ...(pushToken && { body: JSON.stringify({ pushToken }) }),
    });
  } catch (err) {
    console.warn("[logout] falha ao avisar o servidor", err);
  }

  try {
    await desligarPushDoAparelho(pushToken !== null);
  } catch (err) {
    console.warn("[logout] falha ao desligar o push do aparelho", err);
  }

  await limparCachesDoApp();
}

/** Apaga todas as caches (Cache Storage) do app neste aparelho. */
export async function limparCachesDoApp(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const nomes = await caches.keys();
    await Promise.all(nomes.map((nome) => caches.delete(nome)));
  } catch (err) {
    console.warn("[logout] falha ao limpar as caches do app", err);
  }
}
