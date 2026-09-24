import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { updateUserSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth";
import { normalizePhoneBR, sendAccessViaWhatsApp } from "@/lib/whatsapp";
import { telefoneEmUso } from "@/lib/usuarios";
import { perfilDaFuncao } from "@/lib/equipe";
import { linkWhatsAppManual, mensagemAcesso, parametrosModeloAcesso } from "@/lib/acesso";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = updateUserSchema.parse(await request.json());

    const existing = await prisma.user.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existing) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    // Telefone sempre padronizado (55 + DDD + número): o login por telefone compara exatamente.
    let phone: string | null | undefined;
    if (body.phone !== undefined) {
      if (body.phone.trim() === "") {
        phone = null;
      } else {
        phone = normalizePhoneBR(body.phone);
        if (!phone) return NextResponse.json({ error: "Celular inválido. Use o DDD, ex.: (21) 98765-4321." }, { status: 400 });
        if (await telefoneEmUso(phone, id)) {
          return NextResponse.json({ error: "Celular já cadastrado para outro usuário" }, { status: 409 });
        }
      }
    }

    // Função da equipe (Direção/Coordenação/Professor/Auxiliar) define perfil e coordenação.
    let perfil: { role: "ADMIN" | "STAFF"; isCoordenacao: boolean } | undefined;
    if (body.funcao && existing.role !== "GUARDIAN") {
      const novo = perfilDaFuncao(body.funcao);
      if (id === session.sub && novo.role !== "ADMIN") {
        return NextResponse.json({ error: "Você não pode tirar de si mesmo o acesso de Direção." }, { status: 400 });
      }
      perfil = { role: novo.role as "ADMIN" | "STAFF", isCoordenacao: novo.isCoordenacao };
    }

    const temporaryPassword = body.resetPassword ? randomBytes(6).toString("hex") : undefined;

    const user = await prisma.$transaction(async (tx) => {
      if (body.classIds && (perfil?.role ?? existing.role) === "STAFF") {
        await tx.classTeacher.deleteMany({ where: { teacherId: id } });
        await tx.classTeacher.createMany({
          data: body.classIds.map((classId) => ({ classId, teacherId: id })),
        });
      }
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
          ...(perfil
            ? { role: perfil.role, isCoordenacao: perfil.isCoordenacao, funcao: body.funcao }
            : body.isCoordenacao !== undefined && existing.role === "STAFF"
              ? { isCoordenacao: body.isCoordenacao }
              : {}),
          ...(temporaryPassword ? { passwordHash: await hashPassword(temporaryPassword) } : {}),
        },
      });
      if (temporaryPassword) {
        await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return updated;
    });

    // Nova senha: tenta enviar pelo modelo aprovado no WhatsApp e sempre devolve o link
    // wa.me para a escola repassar do próprio WhatsApp.
    let notificadoPorWhatsApp = false;
    let whatsappManual: string | null = null;
    if (temporaryPassword) {
      const dados = {
        nome: user.name,
        // Famílias caem no guia de primeiro acesso; a equipe, direto no login.
        url: `${request.nextUrl.origin}${user.role === "GUARDIAN" ? "/guia" : "/login"}`,
        login: user.email ?? user.phone ?? "",
        senha: temporaryPassword,
      };
      whatsappManual = linkWhatsAppManual(user.phone, mensagemAcesso(dados));
      if (user.phone) {
        try {
          notificadoPorWhatsApp = await sendAccessViaWhatsApp(user.phone, parametrosModeloAcesso(dados));
        } catch (err) {
          console.error("Falha ao enviar nova senha por WhatsApp", err);
        }
      }
    }

    return NextResponse.json({
      user: { id: user.id, name: user.name, active: user.active },
      temporaryPassword,
      notificadoPorWhatsApp,
      whatsappManual,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Exclusão lógica de conta gerida pelo admin (ex.: funcionário desligado). */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const existing = await prisma.user.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existing) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    if (existing.id === session.sub) {
      return NextResponse.json({ error: "Use a exclusão de conta para remover seu próprio usuário" }, { status: 400 });
    }

    await prisma.user.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
