import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { notifyUsers } from "@/lib/push";
import { erroFirebaseAdmin, getFirebaseAdminApp } from "@/lib/firebase-admin";

/** Manda uma notificação de teste para os aparelhos da própria pessoa (botão na página Conta). */
export async function POST() {
  try {
    const session = await requireSession();
    if (!getFirebaseAdminApp()) {
      return NextResponse.json({ ok: false, motivo: erroFirebaseAdmin() ?? "Notificações não configuradas no servidor." });
    }
    const r = await notifyUsers([session.sub], {
      title: "ClassLink",
      body: "Notificação de teste: está tudo certo neste aparelho. ✅",
      url: "/dashboard",
    });
    return NextResponse.json({ ok: r.enviados > 0, ...r });
  } catch (error) {
    return handleApiError(error);
  }
}
