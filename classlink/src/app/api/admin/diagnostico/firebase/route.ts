import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { conferirMesmoProjeto, testarChaveNoGoogle, type ResultadoTesteFirebase } from "@/lib/firebase-config-publica";
import { origemPublica } from "@/lib/push";
import { testarContaDeServico } from "@/lib/firebase-admin";

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
    const conta = await testarContaDeServico();
    const itens = [
      ...conferirMesmoProjeto(env),
      await testarChaveNoGoogle(env, origemPublica() ?? request.nextUrl.origin),
      {
        titulo: "Google aceita a conta de serviço (envio das notificações)",
        ok: conta.ok,
        detalhe: conta.ok
          ? undefined
          : `${conta.detalhe} — No Firebase: Configurações do projeto → Contas de serviço → Gerar nova chave privada. Do MESMO arquivo JSON, cadastre client_email em FIREBASE_CLIENT_EMAIL e private_key em FIREBASE_PRIVATE_KEY (Type Secret) e faça Redeploy.`,
      },
    ];
    const resultado: ResultadoTesteFirebase = { ok: itens.every((i) => i.ok), itens };
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
