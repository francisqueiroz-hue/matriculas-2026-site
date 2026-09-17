import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/session";

/** Verifica se um funcionário/admin e um responsável compartilham ao menos uma turma (via aluno). */
export async function shareClass(staffId: string, guardianId: string, staffRole: "ADMIN" | "STAFF") {
  if (staffRole === "ADMIN") return true; // admin pode falar com qualquer responsável da escola

  const teachingClassIds = await prisma.classTeacher.findMany({
    where: { teacherId: staffId },
    select: { classId: true },
  });
  if (teachingClassIds.length === 0) return false;

  const overlap = await prisma.guardianStudent.findFirst({
    where: {
      guardianId,
      student: { classId: { in: teachingClassIds.map((c) => c.classId) }, deletedAt: null },
    },
  });
  return Boolean(overlap);
}

export async function assertConversationParticipant(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || (conversation.staffId !== userId && conversation.guardianId !== userId)) {
    throw new AuthError("Conversa não encontrada", 404);
  }
  return conversation;
}

/**
 * Ordena uma dupla de ids de usuário de forma determinística (ordem lexicográfica), para
 * que TeamConversation.userAId/userBId nunca gravem a mesma dupla duas vezes em ordem
 * trocada (A-B e B-A seriam conversas diferentes sem essa normalização).
 */
export function ordenarDupla(userId1: string, userId2: string): [string, string] {
  return userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
}

export async function assertTeamConversationParticipant(conversationId: string, userId: string) {
  const conversation = await prisma.teamConversation.findUnique({ where: { id: conversationId } });
  if (!conversation || (conversation.userAId !== userId && conversation.userBId !== userId)) {
    throw new AuthError("Conversa não encontrada", 404);
  }
  return conversation;
}
