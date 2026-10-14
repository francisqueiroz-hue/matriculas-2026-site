import { NextRequest, NextResponse } from "next/server";
import { resumirRelatorioCsp } from "@/lib/csp-relatorio";

const LIMITE_BYTES = 8 * 1024;

/**
 * Recebe os relatórios da CSP em modo Report-Only. Público de propósito (o navegador envia sem
 * cookies); por isso só registra uma linha curta e sanitizada e sempre responde 204.
 */
export async function POST(request: NextRequest) {
  try {
    const texto = await request.text();
    if (texto.length <= LIMITE_BYTES) {
      const linha = resumirRelatorioCsp(JSON.parse(texto));
      if (linha) console.warn(`[csp-report] ${linha}`);
    }
  } catch {
    // Corpo inválido: ignora em silêncio.
  }
  return new NextResponse(null, { status: 204 });
}
