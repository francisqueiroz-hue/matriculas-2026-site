import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { excluirAluno } from "@/lib/exclusao";
import { handleApiError } from "@/lib/http";
import { updateStudentSchema } from "@/lib/validators";
import { alteracoesAluno } from "@/lib/historico-cadastro";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/students/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = updateStudentSchema.parse(await request.json());

    const existing = await prisma.student.findFirst({
      where: { id, schoolId: session.schoolId, deletedAt: null },
      include: { class: { select: { name: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    // A turma precisa ser da mesma escola — o id vem do cliente.
    let novaTurma = existing.class.name;
    if (body.classId) {
      const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId: session.schoolId } });
      if (!cls) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
      novaTurma = cls.name;
    }

    const novoNascimento = body.birthDate ? new Date(body.birthDate) : existing.birthDate;
    const alteracoes = alteracoesAluno(
      { nome: existing.name, turma: existing.class.name, nascimento: existing.birthDate },
      { nome: body.name || existing.name, turma: novaTurma, nascimento: novoNascimento },
    );

    // Atualização e histórico na mesma transação: não há alteração de cadastro sem rastro.
    const student = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.student.update({
        where: { id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.classId ? { classId: body.classId } : {}),
          ...(body.birthDate ? { birthDate: novoNascimento } : {}),
        },
      });
      if (alteracoes.length > 0) {
        await tx.alteracaoCadastro.createMany({
          data: alteracoes.map((a) => ({
            ...a,
            schoolId: session.schoolId,
            entidade: "ALUNO",
            entidadeId: id,
            porUserId: session.sub,
            porNome: session.name,
          })),
        });
      }
      return atualizado;
    });
    return NextResponse.json({ student });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Exclusão lógica — mantém histórico de frequência/posts já vinculados. */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/admin/students/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    // Padrão: exclui também o acesso dos responsáveis sem outro aluno na escola.
    const excluirResponsaveis = request.nextUrl.searchParams.get("responsaveis") !== "manter";

    const resultado = await excluirAluno(id, session.schoolId, excluirResponsaveis);
    if (!resultado) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    return handleApiError(error);
  }
}
