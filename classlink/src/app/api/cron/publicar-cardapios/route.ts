import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/http";
import { requireCronSecret } from "@/lib/cron-auth";
import { publicarCardapiosDevidos } from "@/lib/cardapios";

/**
 * Job semanal (segunda, 9h UTC = 6h de Brasília; ver vercel.json): publica no Mural o
 * cardápio da semana de cada escola e notifica as famílias. Idempotente — a abertura do
 * app depois das 6h faz o mesmo, como reserva.
 */
// Vercel Cron só invoca via GET; POST para schedulers externos.
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  try {
    requireCronSecret(request);
    const publicados = await publicarCardapiosDevidos();
    return NextResponse.json({ ok: true, publicados });
  } catch (error) {
    return handleApiError(error);
  }
}
