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
