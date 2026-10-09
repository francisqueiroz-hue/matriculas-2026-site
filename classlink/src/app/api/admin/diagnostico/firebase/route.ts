import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { conferirMesmoProjeto, testarChaveNoGoogle, type ResultadoTesteFirebase } from "@/lib/firebase-config-publica";
import { origemPublica } from "@/lib/push";

/** Botão "Testar chave do Firebase" do diagnóstico: confere o projeto e faz o pedido real ao Google. */
export async function POST(request: NextRequest) {
  try {
    await requireRole("ADMIN");
    const env = {
      NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    };
    const itens = [...conferirMesmoProjeto(env), await testarChaveNoGoogle(env, origemPublica() ?? request.nextUrl.origin)];
    const resultado: ResultadoTesteFirebase = { ok: itens.every((i) => i.ok), itens };
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
