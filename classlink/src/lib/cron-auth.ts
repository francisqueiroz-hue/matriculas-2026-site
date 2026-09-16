import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { AuthError } from "@/lib/session";

/**
 * Autoriza chamadas de jobs agendados (Vercel Cron ou scheduler externo) via
 * segredo compartilhado — nunca aceita a chamada sem CRON_SECRET configurado.
 * Comparação em tempo constante (mesmo padrão usado nos webhooks do WhatsApp/Mailgun),
 * para não vazar o segredo por diferença de tempo de resposta (timing attack).
 */
export function requireCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new AuthError("CRON_SECRET não configurado", 500);

  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.replace(/^Bearer\s+/i, "");
  if (!provided) throw new AuthError("Não autorizado", 401);

  const expectedBuf = Buffer.from(secret);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    throw new AuthError("Não autorizado", 401);
  }
}
