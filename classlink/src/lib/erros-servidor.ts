import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const LIMITE_GRUPOS = 500;
const MAX_MENSAGEM = 300;

/**
 * Resumo de um erro sem dados pessoais: só a 1ª linha da mensagem, com e-mails, telefones,
 * CPFs, números longos e ids mascarados. Erros do banco às vezes trazem valores da consulta.
 */
export function resumirErro(erro: unknown): { origem: string; mensagem: string } {
  const e = erro as { name?: string; code?: string; message?: string };
  const nome = e?.name && e.name !== "Error" ? e.name : "Erro";
  const origem = [nome, typeof e?.code === "string" ? e.code : null].filter(Boolean).join(" ").slice(0, 80);
  const primeiraLinha = String(e?.message ?? erro ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "(sem mensagem)";
  const mensagem = primeiraLinha
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/\bc[a-z0-9]{20,}\b/g, "[id]") // ids cuid
    .replace(/\d[\d.\-/ ()]{5,}\d/g, "[número]")
    .slice(0, MAX_MENSAGEM);
  return { origem, mensagem };
}

export function chaveDoErro(origem: string, mensagem: string): string {
  return createHash("sha256").update(`${origem}\n${mensagem}`).digest("hex").slice(0, 40);
}

/** Grava (agrupado) um erro inesperado. Nunca lança: o registro é um extra. */
export async function registrarErroServidor(erro: unknown, origemExtra?: string): Promise<void> {
  try {
    const r = resumirErro(erro);
    const origem = origemExtra ? `${origemExtra} · ${r.origem}`.slice(0, 120) : r.origem;
    const chave = chaveDoErro(origem, r.mensagem);
    const somar = () =>
      prisma.erroServidor.updateMany({ where: { chave }, data: { total: { increment: 1 }, ultimaVez: new Date() } });
    if ((await somar()).count > 0) return;
    if ((await prisma.erroServidor.count()) >= LIMITE_GRUPOS) return;
    // Dois iguais ao mesmo tempo: o segundo create falha pela chave única e soma no existente.
    await prisma.erroServidor.create({ data: { chave, origem, mensagem: r.mensagem } }).catch(somar);
  } catch {
    // Banco fora do ar (ou o próprio erro é do banco): fica só no log da Vercel.
  }
}
