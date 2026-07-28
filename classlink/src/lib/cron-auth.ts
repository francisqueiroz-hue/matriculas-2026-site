import { NextRequest } from "next/server";
import { AuthError } from "@/lib/session";

/**
 * Autoriza chamadas de jobs agendados (Vercel Cron ou scheduler externo) via
 * segredo compartilhado — nunca aceita a chamada sem CRON_SECRET configurado.
 */
export function requireCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new AuthError("CRON_SECRET não configurado", 500);

  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) throw new AuthError("Não autorizado", 401);
}
