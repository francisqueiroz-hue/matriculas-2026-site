import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/session";
import { cargoParaExibir } from "@/lib/permissoes-mensagens";

/**
 * Mensagens para toda a equipe (regra da escola, 18/11/2026):
 *  - a direção ou a coordenação escreve para a equipe toda;
 *  - todos da equipe (direção, secretaria, coordenação, professores e auxiliares) leem e
 *    respondem no mesmo assunto, e todos veem as respostas;
 *  - famílias nunca acessam (as rotas exigem ADMIN ou STAFF).
 * Mensagens individuais continuam nas conversas da equipe (TeamConversation): só as duas
 * pessoas da conversa veem.
 */

export const novaMensagemEquipeSchema = z.object({
  titulo: z.string().trim().min(1, "Escreva o assunto").max(120),
  corpo: z.string().trim().min(1, "Escreva a mensagem").max(4000),
});

export const respostaMensagemEquipeSchema = z.object({
  corpo: z.string().trim().min(1, "Escreva a resposta").max(4000),
});

/** Equipe ativa da escola: quem participa das mensagens para toda a equipe. */
export const ONDE_EQUIPE_ATIVA = (schoolId: string) => ({
  schoolId,
  active: true,
  deletedAt: null,
  role: { in: ["ADMIN" as const, "STAFF" as const] },
});

export const SELECT_AUTOR = { id: true, name: true, role: true, isCoordenacao: true, funcao: true } as const;

export function autorParaExibir(u: { id: string; name: string; role: "ADMIN" | "STAFF" | "GUARDIAN"; isCoordenacao: boolean; funcao: Parameters<typeof cargoParaExibir>[0]["funcao"] }) {
  return { id: u.id, name: u.name, cargo: cargoParaExibir(u) };
}

/** Assunto da escola da sessão, ou 404. */
export async function carregarMensagemEquipe(id: string, schoolId: string) {
  const mensagem = await prisma.mensagemEquipe.findFirst({ where: { id, schoolId }, select: { id: true, autorId: true, titulo: true } });
  if (!mensagem) throw new AuthError("Mensagem não encontrada", 404);
  return mensagem;
}

/** Não lida: houve atividade depois da última leitura da pessoa (o que ela mesma escreveu não conta). */
export function estaNaoLida(m: { ultimaAtividadeEm: Date; autorId: string }, lidaEm: Date | null | undefined, userId: string): boolean {
  if (!lidaEm) return m.autorId !== userId;
  return m.ultimaAtividadeEm.getTime() > lidaEm.getTime();
}
