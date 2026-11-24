import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDirecao } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { destinosDosAlunos } from "@/lib/contratos-server";

const ativo = { active: true, deletedAt: null, role: "GUARDIAN" as const };

/**
 * Alunos com dois ou mais responsáveis ativos em que nada indica o responsável financeiro (nem
 * indicação da direção, nem contrato assinado, nem CPF de cobrança de um só): enquanto
 * estiverem aqui, contrato novo não é enviado e boleto novo sai sem aviso
 * (ver lib/responsavel-financeiro.ts).
 */
export async function GET() {
  try {
    const session = await requireDirecao();
    const alunos = await prisma.student.findMany({
      where: { schoolId: session.schoolId, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        class: { select: { name: true } },
        guardians: {
          where: { guardian: ativo },
          orderBy: { createdAt: "asc" },
          select: { relation: true, guardian: { select: { id: true, name: true } } },
        },
      },
    });
    const candidatos = alunos.filter((a) => a.guardians.length > 1);
    const destinos = await destinosDosAlunos(candidatos.map((a) => a.id));
    const pendentes = candidatos
      .filter((a) => destinos.get(a.id)?.situacao === "INDEFINIDO")
      .map((a) => ({
        id: a.id,
        name: a.name,
        turma: a.class.name,
        responsaveis: a.guardians.map((g) => ({ id: g.guardian.id, name: g.guardian.name, relation: g.relation })),
      }));
    return NextResponse.json({ pendentes });
  } catch (error) {
    return handleApiError(error);
  }
}

const corpoSchema = z.object({ studentId: z.string().min(1), guardianId: z.string().min(1) });

/**
 * A direção indica o responsável financeiro do aluno (quem recebe, preenche e assina o
 * contrato e recebe o boleto). Só um por aluno: marcar um desmarca o outro. Fica no histórico
 * do cadastro. Contratos e boletos em aberto criados pela regra nova passam para ele; os
 * anteriores à regra continuam como estavam.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireDirecao();
    const { studentId, guardianId } = corpoSchema.parse(await request.json());

    const aluno = await prisma.student.findFirst({
      where: { id: studentId, schoolId: session.schoolId, deletedAt: null },
      select: {
        id: true,
        guardians: { select: { guardianId: true, responsavelFinanceiro: true, guardian: { select: { name: true, active: true, deletedAt: true, role: true } } } },
      },
    });
    if (!aluno) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    const escolhido = aluno.guardians.find((g) => g.guardianId === guardianId);
    if (!escolhido || !escolhido.guardian.active || escolhido.guardian.deletedAt || escolhido.guardian.role !== "GUARDIAN") {
      return NextResponse.json({ error: "Responsável não encontrado neste aluno" }, { status: 404 });
    }
    const anterior = aluno.guardians.find((g) => g.responsavelFinanceiro);

    await prisma.$transaction(async (tx) => {
      if (anterior?.guardianId !== guardianId) {
        await tx.guardianStudent.updateMany({ where: { studentId, responsavelFinanceiro: true }, data: { responsavelFinanceiro: false } });
        await tx.guardianStudent.update({
          where: { guardianId_studentId: { guardianId, studentId } },
          data: { responsavelFinanceiro: true },
        });
        await tx.alteracaoCadastro.create({
          data: {
            schoolId: session.schoolId,
            entidade: "ALUNO",
            entidadeId: studentId,
            campo: "responsavelFinanceiro",
            valorAnterior: anterior?.guardian.name ?? null,
            valorNovo: escolhido.guardian.name,
            porUserId: session.sub,
            porNome: session.name,
          },
        });
      }
      // O que ainda espera a família passa para o financeiro (só os itens da regra nova).
      await tx.contrato.updateMany({
        where: { studentId, porResponsavelFinanceiro: true, status: { in: ["AGUARDANDO_ASSINATURA", "DEVOLVIDO"] } },
        data: { destinatarioId: guardianId },
      });
      // Boleto já emitido no banco tem o pagador fixado lá: fica como está.
      await tx.boleto.updateMany({
        where: { studentId, porResponsavelFinanceiro: true, status: { in: ["PENDENTE", "VENCIDO"] }, codigoSolicitacao: null },
        data: { destinatarioId: guardianId },
      });
    });
    return NextResponse.json({ ok: true, guardianId });
  } catch (error) {
    return handleApiError(error);
  }
}
