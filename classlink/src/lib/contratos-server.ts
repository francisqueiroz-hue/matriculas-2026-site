import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AccessTokenPayload } from "@/lib/auth";
import { juntarPartes, lerDoBlob } from "@/lib/blob-storage";
import { ContratoErro, mensagemArquivoGrande } from "@/lib/contratos";
import { destinoContrato, responsavelVeContrato, type DestinoContrato, type VinculoResponsavel } from "@/lib/responsavel-financeiro";

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
    // Com mais de um responsável, só o financeiro (quem assina) vê o contrato.
    const vinculos = await vinculosDoAluno(contrato.studentId);
    return responsavelVeContrato(vinculos, session.sub) ? contrato : null;
  }
  return null;
}

const vinculoSelect = {
  studentId: true,
  guardianId: true,
  responsavelFinanceiro: true,
  guardian: { select: { active: true, deletedAt: true, role: true } },
} as const;

function paraVinculo(v: {
  guardianId: string;
  responsavelFinanceiro: boolean;
  guardian: { active: boolean; deletedAt: Date | null; role: string };
}): VinculoResponsavel {
  return {
    guardianId: v.guardianId,
    responsavelFinanceiro: v.responsavelFinanceiro,
    ativo: v.guardian.active && !v.guardian.deletedAt && v.guardian.role === "GUARDIAN",
  };
}

/** Vínculos responsável–aluno no formato da regra do responsável financeiro. */
export async function vinculosDoAluno(studentId: string): Promise<VinculoResponsavel[]> {
  const vinculos = await prisma.guardianStudent.findMany({ where: { studentId }, select: vinculoSelect });
  return vinculos.map(paraVinculo);
}

/** Quem recebe o contrato de cada aluno (ver lib/responsavel-financeiro.ts). */
export async function destinosDosAlunos(studentIds: string[]): Promise<Map<string, DestinoContrato>> {
  const vinculos = studentIds.length
    ? await prisma.guardianStudent.findMany({ where: { studentId: { in: studentIds } }, select: vinculoSelect })
    : [];
  const porAluno = new Map<string, VinculoResponsavel[]>(studentIds.map((id) => [id, []]));
  for (const v of vinculos) porAluno.get(v.studentId)?.push(paraVinculo(v));
  return new Map([...porAluno].map(([id, lista]) => [id, destinoContrato(lista)]));
}

export async function destinoDoAluno(studentId: string): Promise<DestinoContrato> {
  return destinoContrato(await vinculosDoAluno(studentId));
}

/**
 * Ids de quem recebe os avisos do contrato do aluno: o responsável financeiro (ou o único
 * responsável). Sem financeiro indicado num aluno com dois ou mais responsáveis, ninguém: a
 * tela Contratos mostra o aviso para a direção indicar.
 */
export async function responsaveisDoAluno(studentId: string): Promise<string[]> {
  return (await destinoDoAluno(studentId)).ids;
}

/**
 * Ids da direção ativa da escola (para avisar que chegou contrato assinado). Só a Direção: a
 * Secretaria é ADMIN, mas não tem acesso aos contratos (ver lib/equipe.ts, ehDirecao).
 */
export async function direcaoDaEscola(schoolId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { schoolId, role: "ADMIN", active: true, deletedAt: null, OR: [{ funcao: null }, { funcao: "DIRECAO" }] },
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
  return juntarPartes(partes, total);
}
