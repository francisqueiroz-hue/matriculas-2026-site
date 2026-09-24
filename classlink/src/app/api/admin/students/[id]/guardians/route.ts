import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { linkGuardianSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth";
import { isWhatsAppConfigured, normalizePhoneBR, sendWhatsAppTextMessage } from "@/lib/whatsapp";

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

    let guardian = email
      ? await prisma.user.findUnique({ where: { email } })
      : phone
        ? (
            await prisma.user.findMany({ where: { role: "GUARDIAN", schoolId: session.schoolId, phone: { not: null } } })
          ).find((candidate) => candidate.phone && normalizePhoneBR(candidate.phone) === phone) ?? null
        : null;
    let temporaryPassword: string | undefined;

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

    // Ao criar o acesso, já avisa a família pelo WhatsApp com o link e a senha provisória —
    // evita depender de alguém da escola copiar e colar isso manualmente numa conversa.
    let notificadoPorWhatsApp = false;
    if (temporaryPassword && phone && isWhatsAppConfigured()) {
      const login = guardian.email ?? phone;
      const mensagem = `Olá, ${guardian.name}! Seu acesso ao ClassLink (comunicação da escola) está pronto.\n\nAcesse: ${request.nextUrl.origin}/guia\nEntrar com: ${login}\nSenha provisória: ${temporaryPassword}\n\nAssim que entrar, troque a senha em Conta > Trocar senha.`;
      try {
        await sendWhatsAppTextMessage(phone, mensagem);
        notificadoPorWhatsApp = true;
      } catch (err) {
        console.error("Falha ao enviar convite por WhatsApp", err);
      }
    }

    return NextResponse.json(
      {
        link,
        guardian: { id: guardian.id, email: guardian.email, name: guardian.name },
        temporaryPassword,
        notificadoPorWhatsApp,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
