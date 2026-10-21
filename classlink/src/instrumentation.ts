import type { Instrumentation } from "next";

/**
 * Erros que escapam de páginas e rotas (não passam pelo handleApiError) também vão para o
 * histórico do Painel, com o caminho onde aconteceram.
 */
export const onRequestError: Instrumentation.onRequestError = async (erro, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // redirect()/notFound() do Next viajam como erros "NEXT_*": não são falhas.
  const digest = typeof erro === "object" && erro !== null && "digest" in erro ? String(erro.digest) : "";
  if (digest.startsWith("NEXT_")) return;
  const { registrarErroServidor } = await import("@/lib/erros-servidor");
  const caminho = (request.path ?? "").split("?")[0].replace(/\/c[a-z0-9]{20,}/g, "/[id]");
  await registrarErroServidor(erro, `${request.method} ${caminho}`);
};
