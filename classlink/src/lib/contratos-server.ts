import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AccessTokenPayload } from "@/lib/auth";
import { lerDoBlob } from "@/lib/blob-storage";
import { ContratoErro, mensagemArquivoGrande } from "@/lib/contratos";

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

/**
 * Lê do Blob privado o PDF enviado direto pela família, sem passar de `maxBytes` (para de ler
 * e recusa com ContratoErro se passar). Null quando o arquivo não existe.
 */
export async function lerPdfDoBlob(caminho: string, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const arquivo = await lerDoBlob(caminho);
  if (!arquivo || arquivo.statusCode !== 200) return null;
  const leitor = arquivo.stream.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await leitor.read();
    if (done || !value) break;
    total += value.length;
    if (total > maxBytes) {
      await leitor.cancel().catch(() => undefined);
      throw new ContratoErro(mensagemArquivoGrande(maxBytes));
    }
    partes.push(value);
  }
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    junto.set(p, pos);
    pos += p.length;
  }
  return junto;
}
