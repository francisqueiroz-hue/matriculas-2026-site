"use client";

import { apiFetch } from "@/lib/api-client";
import { cancelarInscricaoCapturada, inscricaoPushAtual, tokenPushExistente } from "@/lib/firebase-client";

/**
 * Prazo de cada etapa do logout. Somados, limitam o pior caso a 16 s: depois disso quem
 * chama redireciona para o login, mesmo que alguma etapa nunca termine. O aviso ao servidor
 * tem o maior prazo porque é ele que apaga os cookies da sessão — se a resposta se perder
 * (ex.: função da Vercel iniciando a frio), a pessoa continuaria logada no aparelho.
 */
export const PRAZOS_LOGOUT_MS = { inscricao: 1_000, token: 2_000, servidor: 10_000, push: 2_000, caches: 1_000 } as const;

/** Pior caso total do logout (soma dos prazos). */
export const PIOR_CASO_LOGOUT_MS = Object.values(PRAZOS_LOGOUT_MS).reduce((a, b) => a + b, 0);

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
 * push deste aparelho), cancela a inscrição de push e apaga as caches do app.
 * Cada etapa tem prazo próprio e nunca lança erro: quem chama redireciona para o login sempre.
 */
export async function sairDaConta(): Promise<void> {
  // Captura a inscrição de push de AGORA: é ela (e só ela) que será cancelada no fim.
  const inscricao = await noPrazo(() => inscricaoPushAtual(), PRAZOS_LOGOUT_MS.inscricao, "inscrição de push do aparelho");
  const pushToken = inscricao
    ? await noPrazo(() => tokenPushExistente(), PRAZOS_LOGOUT_MS.token, "token de push do aparelho")
    : null;

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

  await noPrazo(() => cancelarInscricaoCapturada(inscricao), PRAZOS_LOGOUT_MS.push, "cancelar a inscrição de push");

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
