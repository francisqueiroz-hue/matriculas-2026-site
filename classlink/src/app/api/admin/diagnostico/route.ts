import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";
import { getAccessTemplate, getNoticeTemplate, isWhatsAppConfigured } from "@/lib/whatsapp";

/**
 * O que está configurado para os avisos (push do Firebase e WhatsApp), sem expor
 * nenhum valor secreto — só "configurado ou não". Ajuda a escola a conferir a Vercel.
 */
export async function GET() {
  try {
    const session = await requireRole("ADMIN");
    const env = (nome: string) => Boolean(process.env[nome]?.trim());

    const [dispositivosPush, equipeComAvisoWhatsApp] = await Promise.all([
      prisma.pushToken.count({ where: { user: { schoolId: session.schoolId } } }),
      prisma.user.count({ where: { schoolId: session.schoolId, avisosWhatsApp: true, deletedAt: null } }),
    ]);

    return NextResponse.json({
      push: {
        navegador:
          env("NEXT_PUBLIC_FIREBASE_API_KEY") &&
          env("NEXT_PUBLIC_FIREBASE_PROJECT_ID") &&
          env("NEXT_PUBLIC_FIREBASE_APP_ID") &&
          env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
        chaveVapid: env("NEXT_PUBLIC_FIREBASE_VAPID_KEY"),
        servidor: getFirebaseAdminApp() !== null,
        dispositivosRegistrados: dispositivosPush,
      },
      whatsapp: {
        api: isWhatsAppConfigured(),
        webhookAssinatura: env("WHATSAPP_APP_SECRET"),
        webhookVerificacao: env("WHATSAPP_VERIFY_TOKEN"),
        modeloAcesso: getAccessTemplate()?.name ?? null,
        modeloAviso: getNoticeTemplate()?.name ?? null,
        equipeComAvisoWhatsApp,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
