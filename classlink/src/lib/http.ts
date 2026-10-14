import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/session";
import { mensagemViolacaoUnica } from "@/lib/erro-unico";
import { ErroDeUsuario, MENSAGEM_ERRO_GENERICO } from "@/lib/erros";

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Dados inválidos", issues: error.issues },
      { status: 400 },
    );
  }
  const duplicado = mensagemViolacaoUnica(error);
  if (duplicado) {
    return NextResponse.json({ error: duplicado }, { status: 409 });
  }
  if (error instanceof ErroDeUsuario) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  // Qualquer outro erro (banco, provedores, configuração) pode conter detalhes técnicos:
  // fica só no log do servidor e o navegador recebe uma mensagem genérica.
  console.error(error);
  return NextResponse.json({ error: MENSAGEM_ERRO_GENERICO }, { status: 500 });
}
