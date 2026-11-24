import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AccessTokenPayload } from "@/lib/auth";
import { juntarPartes, lerDoBlob } from "@/lib/blob-storage";
import { ContratoErro, mensagemArquivoGrande } from "@/lib/contratos";
import {
  avisadosDoItem,
  destinoContrato,
  responsavelVeItem,
  type DestinoContrato,
  type ItemComDestinatario,
  type VinculoResponsavel,
} from "@/lib/responsavel-financeiro";

/** Impressão digital SHA-256 (hex) do arquivo — comprova que o PDF guardado é o mesmo que foi enviado. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Carrega o contrato garantindo o acesso: direção (ADMIN) vê os da própria escola;
 * responsável só vê contratos de alunos vinculados a ele e, nos contratos da regra do
 * responsável financeiro, só se for o destinatário. Retorna null quando não há acesso — a rota
 * responde 404 para não revelar que o contrato existe.
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
    return responsavelVeItem(contrato, !!vinculo, session.sub) ? contrato : null;
  }
  return null;
}

const vinculoSelect = {
  studentId: true,
  guardianId: true,
  responsavelFinanceiro: true,
  guardian: { select: { active: true, deletedAt: true, role: true, cpf: true } },
} as const;

/**
 * Vínculos responsável–aluno no formato da regra do responsável financeiro (na ordem em que
 * foram cadastrados), com o que o cadastro já diz de cada um: quem enviou o último contrato
 * assinado do aluno e quem preencheu o CPF de cobrança.
 */
export async function vinculosDosAlunos(studentIds: string[]): Promise<Map<string, VinculoResponsavel[]>> {
  const porAluno = new Map<string, VinculoResponsavel[]>(studentIds.map((id) => [id, []]));
  if (studentIds.length === 0) return porAluno;
  const [vinculos, assinados] = await Promise.all([
    prisma.guardianStudent.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { createdAt: "asc" },
      select: vinculoSelect,
    }),
    prisma.contratoArquivo.findMany({
      where: { tipo: "ASSINADO", enviadoPorId: { not: null }, contrato: { studentId: { in: studentIds } } },
      orderBy: { createdAt: "desc" },
      select: { enviadoPorId: true, contrato: { select: { studentId: true } } },
    }),
  ]);
  // Último contrato assinado de cada aluno enviado por um responsável dele (a direção também
  // anexa contratos; esses não contam).
  const doAluno = new Map<string, Set<string>>();
  for (const v of vinculos) {
    if (!doAluno.has(v.studentId)) doAluno.set(v.studentId, new Set());
    doAluno.get(v.studentId)!.add(v.guardianId);
  }
  const contratante = new Map<string, string>();
  for (const a of assinados) {
    const aluno = a.contrato.studentId;
    if (!contratante.has(aluno) && a.enviadoPorId && doAluno.get(aluno)?.has(a.enviadoPorId)) {
      contratante.set(aluno, a.enviadoPorId);
    }
  }
  for (const v of vinculos) {
    porAluno.get(v.studentId)?.push({
      guardianId: v.guardianId,
      responsavelFinanceiro: v.responsavelFinanceiro,
      ativo: v.guardian.active && !v.guardian.deletedAt && v.guardian.role === "GUARDIAN",
      assinouUltimoContrato: contratante.get(v.studentId) === v.guardianId,
      temCpf: Boolean(v.guardian.cpf),
    });
  }
  return porAluno;
}

export async function vinculosDoAluno(studentId: string): Promise<VinculoResponsavel[]> {
  return (await vinculosDosAlunos([studentId])).get(studentId) ?? [];
}

/** Quem é o responsável financeiro de cada aluno (ver lib/responsavel-financeiro.ts). */
export async function destinosDosAlunos(studentIds: string[]): Promise<Map<string, DestinoContrato>> {
  const vinculos = await vinculosDosAlunos(studentIds);
  return new Map([...vinculos].map(([id, lista]) => [id, destinoContrato(lista)]));
}

export async function destinoDoAluno(studentId: string): Promise<DestinoContrato> {
  return destinoContrato(await vinculosDoAluno(studentId));
}

/**
 * Ids de quem recebe os avisos deste contrato: pela regra nova, só o destinatário; contrato
 * anterior à regra, todos os responsáveis ativos do aluno, como era.
 */
export async function avisadosDoContrato(contrato: ItemComDestinatario & { studentId: string }): Promise<string[]> {
  const vinculos = await vinculosDoAluno(contrato.studentId);
  return avisadosDoItem(contrato, vinculos, vinculos.filter((v) => v.ativo).map((v) => v.guardianId));
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
