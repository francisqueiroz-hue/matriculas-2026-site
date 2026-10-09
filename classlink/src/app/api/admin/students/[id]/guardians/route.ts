import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { linkGuardianSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth";
import { normalizePhoneBR, samePhoneBR } from "@/lib/whatsapp";
import { descreverEnvio, enviarAcessoPeloApp } from "@/lib/envio-acesso";
import { responsaveisSemelhantes } from "@/lib/nomes-semelhantes";

/** Vincula um responsável (existente ou novo) a um aluno. Vínculo explícito e revogável (LGPD). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/students/[id]/guardians">) {
  try {
    const session = await requireRole("ADMIN");
    const { id: studentId } = await ctx.params;
    const body = linkGuardianSchema.parse(await request.json());

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: session.schoolId } });
    if (!student) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    const email = body.guardianEmail?.toLowerCase();
    // Nem toda família tem e-mail — quando não informado, o cadastro é feito só com
    // telefone (login também funciona por telefone, ver /api/auth/login).
    const phone = body.guardianPhone ? normalizePhoneBR(body.guardianPhone) ?? body.guardianPhone : undefined;

    let guardian = body.guardianId
      ? await prisma.user.findFirst({ where: { id: body.guardianId, schoolId: session.schoolId, role: "GUARDIAN", deletedAt: null } })
      : email
      ? await prisma.user.findUnique({ where: { email } })
      : phone
        ? (
            await prisma.user.findMany({ where: { role: "GUARDIAN", schoolId: session.schoolId, phone: { not: null } } })
          ).find((candidate) => candidate.phone && samePhoneBR(candidate.phone, phone)) ?? null
        : null;
    let temporaryPassword: string | undefined;

    if (!guardian && body.guardianId) {
      return NextResponse.json({ error: "Responsável não encontrado" }, { status: 404 });
    }

    // Antes de criar outro login: já existe responsável com nome parecido? Pode ser a mesma
    // pessoa com outro celular/e-mail (ex.: cadastrando o segundo filho). A tela pergunta.
    if (!guardian && !body.confirmarNovo) {
      const semelhantes = await responsaveisSemelhantes(session.schoolId, body.guardianName);
      if (semelhantes.length > 0) {
        return NextResponse.json(
          {
            error: "Já existe responsável com nome parecido. Confira se é a mesma pessoa.",
            codigo: "RESPONSAVEL_SEMELHANTE",
            semelhantes,
          },
          { status: 409 },
        );
      }
    }

    if (!guardian) {
      temporaryPassword = body.password ?? randomBytes(6).toString("hex");
      guardian = await prisma.user.create({
        data: {
          email,
          name: body.guardianName,
          phone,
          role: "GUARDIAN",
          schoolId: session.schoolId,
          passwordHash: await hashPassword(temporaryPassword),
        },
      });
    } else if (guardian.schoolId !== session.schoolId || guardian.role !== "GUARDIAN") {
      return NextResponse.json({ error: "Contato já usado por outro usuário nesta ou noutra escola" }, { status: 409 });
    }

    const link = await prisma.guardianStudent.upsert({
      where: { guardianId_studentId: { guardianId: guardian.id, studentId } },
      update: { relation: body.relation },
      create: { guardianId: guardian.id, studentId, relation: body.relation },
    });

    // Ao criar o acesso, envia pelo WhatsApp da escola (pelo próprio ClassLink): convite
    // com o botão ACESSO ou, se a conversa estiver aberta, login e senha direto.
    const envio = temporaryPassword ? await enviarAcessoPeloApp(guardian.id, request.nextUrl.origin, temporaryPassword) : null;

    return NextResponse.json(
      {
        link,
        guardian: { id: guardian.id, email: guardian.email, name: guardian.name },
        // A senha só aparece no painel se não deu para enviar (para repassar pessoalmente).
        temporaryPassword: envio && !envio.enviado ? temporaryPassword : undefined,
        novoAcesso: Boolean(temporaryPassword),
        envio: envio && { enviado: envio.enviado, mensagem: descreverEnvio(envio) },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
