"use client";

import { apiFetch } from "@/lib/api-client";

/**
 * Baixar, abrir e compartilhar PDFs privados (contratos) no navegador.
 *
 * Um link comum (<a href>) para a rota do PDF falha em silêncio quando o token de acesso
 * (15 min) já venceu: o navegador baixa a resposta de erro no lugar do PDF. E no app
 * instalado no iPhone um link em nova aba abre no Safari, que não tem a sessão do app.
 * Aqui o PDF vem por fetch (que renova a sessão sozinho), é conferido pelos bytes e só então
 * é salvo, aberto ou entregue ao menu de compartilhar do celular (WhatsApp, e-mail, Arquivos,
 * gov.br…).
 */

export class PdfErro extends Error {}

const MENSAGEM_SEM_CONEXAO = "Não foi possível baixar o PDF. Verifique a internet e tente de novo.";

/** O começo do arquivo tem a marca "%PDF-"? (mesma regra da conferência no servidor). */
export function pareceComPdf(inicio: Uint8Array): boolean {
  return new TextDecoder("latin1").decode(inicio.subarray(0, 1024)).includes("%PDF-");
}

/** Baixa o PDF com a sessão do app e devolve um File pronto para salvar ou compartilhar. */
export async function obterPdf(url: string, nome: string): Promise<File> {
  let resposta: Response;
  try {
    resposta = await apiFetch(url, { cache: "no-store" });
  } catch {
    throw new PdfErro(MENSAGEM_SEM_CONEXAO);
  }
  if (resposta.status === 401) {
    throw new PdfErro("Sua sessão expirou. Saia e entre de novo no app para baixar o PDF.");
  }
  if (!resposta.ok) {
    const dados = (await resposta.json().catch(() => ({}))) as { error?: string };
    throw new PdfErro(dados.error ?? MENSAGEM_SEM_CONEXAO);
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await resposta.arrayBuffer();
  } catch {
    throw new PdfErro(MENSAGEM_SEM_CONEXAO);
  }
  if (!pareceComPdf(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 1024)))) {
    throw new PdfErro("O arquivo recebido não é um PDF. Tente de novo ou fale com a secretaria em Mensagens.");
  }
  return new File([bytes], nome, { type: "application/pdf" });
}

/** O navegador sabe entregar arquivos ao menu de compartilhar (celulares, e alguns computadores)? */
export function podeCompartilharArquivos(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    return navigator.canShare({ files: [new File([new Uint8Array([37, 80, 68, 70])], "teste.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}

/** Salva o arquivo no aparelho (pasta Downloads / app Arquivos). */
export function salvarArquivo(arquivo: File): void {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo.name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Abre o PDF numa aba nova. Retorna false se o navegador bloqueou a aba (aí quem chamou salva
 * o arquivo no lugar).
 */
export function abrirArquivo(arquivo: File): boolean {
  const url = URL.createObjectURL(arquivo);
  // Sem "noopener": com ele o navegador sempre devolve null e não daria para saber se abriu.
  // O endereço é um blob do próprio app, então a aba nova não expõe nada de fora.
  const aba = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  if (!aba) URL.revokeObjectURL(url);
  return aba !== null;
}

export type ResultadoCompartilhar = "compartilhado" | "cancelado" | "toque-de-novo";

/**
 * Abre o menu de compartilhar do aparelho com o PDF anexado. O Safari só permite isso logo
 * depois do toque: se o PDF demorou a chegar, devolve "toque-de-novo" (o arquivo já fica
 * guardado e o segundo toque abre o menu na hora).
 */
export async function compartilharArquivo(arquivo: File, titulo: string, texto?: string): Promise<ResultadoCompartilhar> {
  try {
    await navigator.share({ files: [arquivo], title: titulo, ...(texto ? { text: texto } : {}) });
    return "compartilhado";
  } catch (e) {
    const nome = e instanceof Error || e instanceof DOMException ? e.name : "";
    if (nome === "AbortError") return "cancelado";
    if (nome === "NotAllowedError") return "toque-de-novo";
    throw new PdfErro("O aparelho não conseguiu compartilhar o PDF. Use “Baixar PDF” e envie o arquivo salvo.");
  }
}
