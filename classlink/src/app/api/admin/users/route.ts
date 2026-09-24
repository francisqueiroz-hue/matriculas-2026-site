import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createUserSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth";
import { normalizePhoneBR, sendAccessViaWhatsApp } from "@/lib/whatsapp";
import { telefoneEmUso } from "@/lib/usuarios";
import { linkWhatsAppManual, mensagemAcesso, parametrosModeloAcesso } from "@/lib/acesso";
import { perfilDaFuncao } from "@/lib/equipe";


export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const role = request.nextUrl.searchParams.get("role") ?? undefined;

    const users = await prisma.user.findMany({
      where: {
        schoolId: session.schoolId,
        deletedAt: null,
        ...(role ? { role: role as "ADMIN" | "STAFF" | "GUARDIAN" } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        active: true,
        isCoordenacao: true,
        funcao: true,
        classesTeaching: { select: { class: { select: { id: true, name: true } } } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Cadastra alguém da equipe no mesmo formato dos responsáveis: nome, celular e/ou e-mail e
 * função. Sem senha informada, gera uma provisória e — como no vínculo de responsável —
 * tenta enviar pelo modelo aprovado do WhatsApp e devolve o link wa.me para a escola
 * enviar do próprio WhatsApp.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = createUserSchema.parse(await request.json());

    const email = body.email?.toLowerCase();
    let phone: string | undefined;
    if (body.phone) {
      phone = normalizePhoneBR(body.phone) ?? undefined;
      if (!phone) return NextResponse.json({ error: "Celular inválido. Use o DDD, ex.: (21) 98765-4321." }, { status: 400 });
    }
    if (email && (await prisma.user.findUnique({ where: { email } }))) {
      return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
    }
    if (phone && (await telefoneEmUso(phone))) {
      return NextResponse.json({ error: "Celular já cadastrado para outro usuário" }, { status: 409 });
    }

    const { role, isCoordenacao } = perfilDaFuncao(body.funcao);
    const senha = body.password ?? randomBytes(6).toString("hex");

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email,
        phone,
        role,
        isCoordenacao,
        funcao: body.funcao,
        schoolId: session.schoolId,
        passwordHash: await hashPassword(senha),
        ...(role === "STAFF" && body.classIds?.length
          ? { classesTeaching: { create: body.classIds.map((classId) => ({ classId })) } }
          : {}),
      },
    });

    const dados = { nome: user.name, url: `${request.nextUrl.origin}/login`, login: email ?? phone ?? "", senha };
    const whatsappManual = linkWhatsAppManual(phone, mensagemAcesso(dados));
    let notificadoPorWhatsApp = false;
    if (phone) {
      try {
        notificadoPorWhatsApp = await sendAccessViaWhatsApp(phone, parametrosModeloAcesso(dados));
      } catch (err) {
        console.error("Falha ao enviar acesso da equipe por WhatsApp", err);
      }
    }

    return NextResponse.json(
      {
        user: { id: user.id, name: user.name, email: user.email, role: user.role, funcao: user.funcao },
        temporaryPassword: senha,
        notificadoPorWhatsApp,
        whatsappManual,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
