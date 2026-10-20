import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extrairViolacao, resumirRelatorioCsp } from "@/lib/csp-relatorio";

const LIMITE_BYTES = 8 * 1024;
/** O endpoint é público: acima disso, só violações já conhecidas somam; novas são ignoradas. */
const LIMITE_GRUPOS = 500;

/**
 * Recebe os relatórios da CSP em modo Report-Only. Público de propósito (o navegador envia sem
 * cookies); por isso grava só campos conhecidos, reduzidos e agrupados (contador por violação)
 * e sempre responde 204. A Vercel Hobby guarda só 1 hora de logs, então o banco é o histórico.
 */
export async function POST(request: NextRequest) {
  try {
    const texto = await request.text();
    if (texto.length <= LIMITE_BYTES) {
      const corpo = JSON.parse(texto);
      const linha = resumirRelatorioCsp(corpo);
      if (linha) console.warn(`[csp-report] ${linha}`);
      const v = extrairViolacao(corpo);
      if (v) await registrar(v);
    }
  } catch {
    // Corpo inválido ou banco indisponível: o relatório é um extra e nunca deve dar erro.
  }
  return new NextResponse(null, { status: 204 });
}

async function registrar(v: NonNullable<ReturnType<typeof extrairViolacao>>) {
  const atualizado = await prisma.cspViolacao.updateMany({
    where: { chave: v.chave },
    data: { total: { increment: 1 }, ultimaVez: new Date() },
  });
  if (atualizado.count > 0) return;
  if ((await prisma.cspViolacao.count()) >= LIMITE_GRUPOS) return;
  await prisma.cspViolacao
    .create({ data: { chave: v.chave, diretiva: v.diretiva, bloqueado: v.bloqueado, pagina: v.pagina } })
    // Duas violações iguais ao mesmo tempo: a segunda cai aqui; soma no registro que já existe.
    .catch(() => prisma.cspViolacao.updateMany({ where: { chave: v.chave }, data: { total: { increment: 1 }, ultimaVez: new Date() } }));
}
