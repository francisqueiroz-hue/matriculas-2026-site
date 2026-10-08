import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AccessTokenPayload } from "@/lib/auth";

/** Impressão digital SHA-256 (hex) do arquivo — comprova que o PDF guardado é o mesmo que foi enviado. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Carrega o contrato garantindo o acesso: direção (ADMIN) vê os da própria escola;
 * responsável só vê contratos de alunos vinculados a ele. Retorna null quando não há
 * acesso — a rota responde 404 para não revelar que o contrato existe.
 */
export async function carregarContratoComAcesso(contratoId: string, session: AccessTokenPayload) {
  const contrato = await prisma.contrato.findFirst({
    where: { id: contratoId, schoolId: session.schoolId, student: { deletedAt: null } },
  });
  if (!contrato) return null;
  if (session.role === "ADMIN") return contrato;
  if (session.role === "GUARDIAN") {
    const vinculo = await prisma.guardianStudent.findUnique({
      where: { guardianId_studentId: { guardianId: session.sub, studentId: contrato.studentId } },
    });
    return vinculo ? contrato : null;
  }
  return null;
}

/** Ids dos responsáveis vinculados ao aluno (para notificação). */
export async function responsaveisDoAluno(studentId: string): Promise<string[]> {
  const vinculos = await prisma.guardianStudent.findMany({ where: { studentId }, select: { guardianId: true } });
  return vinculos.map((v) => v.guardianId);
}

/** Ids da direção ativa da escola (para avisar que chegou contrato assinado). */
export async function direcaoDaEscola(schoolId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { schoolId, role: "ADMIN", active: true, deletedAt: null },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}
