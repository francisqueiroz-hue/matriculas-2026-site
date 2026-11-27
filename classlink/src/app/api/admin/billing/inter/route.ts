import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDirecao } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { origemPublica } from "@/lib/push";
import { agoraNoFusoDaEscola } from "@/lib/billing";
import { alunosPilotoInter, consultarWebhook, isBancoInterConfigured, registrarWebhook } from "@/lib/banco-inter";
import { emitirPendentesNoInter } from "@/lib/boleto-emissao";
import { prisma } from "@/lib/prisma";

// Emissão de vários boletos (uma chamada ao Inter por boleto) pode passar do limite padrão.
export const maxDuration = 60;

const PATH_WEBHOOK = "/api/webhooks/banco-inter";

/** Endereço do webhook sem o segredo, para mostrar na tela. */
function webhookSemSegredo(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Estado da integração com o Banco Inter, para a direção: se as credenciais estão na Vercel,
 * o ambiente (sandbox/produção) e se o webhook de pagamento está cadastrado no banco e aponta
 * para este app. Nunca devolve credenciais nem o segredo do webhook.
 */
export async function GET() {
  try {
    const session = await requireDirecao();
    const configurado = isBancoInterConfigured();
    const escola = await prisma.school.findUnique({ where: { id: session.schoolId }, select: { familiaEmiteBoletosAno: true } });
    const familiaEmiteBoletosAno = Boolean(escola?.familiaEmiteBoletosAno);
    const ambiente = process.env.BANCO_INTER_AMBIENTE === "producao" ? "producao" : "sandbox";
    const segredoDefinido = Boolean(process.env.BANCO_INTER_WEBHOOK_SECRET);
    // Quantos alunos estão no piloto (null = todos, só em produção). Nunca os ids.
    const piloto = alunosPilotoInter()?.size ?? null;
    if (!configurado) return NextResponse.json({ configurado, ambiente, segredoDefinido, piloto, familiaEmiteBoletosAno, webhook: null });

    try {
      const atual = await consultarWebhook();
      const esperado = origemPublica() ? `${origemPublica()}${PATH_WEBHOOK}` : null;
      const semSegredo = webhookSemSegredo(atual);
      const segredoConfere =
        !!atual && !!process.env.BANCO_INTER_WEBHOOK_SECRET && new URL(atual).searchParams.get("secret") === process.env.BANCO_INTER_WEBHOOK_SECRET;
      return NextResponse.json({
        configurado,
        ambiente,
        segredoDefinido,
        piloto,
        familiaEmiteBoletosAno,
        webhook: { cadastrado: !!atual, endereco: semSegredo, apontaParaEsteApp: !!esperado && semSegredo === esperado && segredoConfere },
      });
    } catch (err) {
      return NextResponse.json({
        configurado,
        ambiente,
        segredoDefinido,
        piloto,
        familiaEmiteBoletosAno,
        webhook: null,
        erro: err instanceof Error ? err.message.slice(0, 300) : "Falha ao falar com o Banco Inter",
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("REGISTRAR_WEBHOOK") }),
  z.object({ acao: z.literal("EMITIR_PENDENTES") }),
  // Liga/desliga a emissão dos boletos do ano pela própria família (Faturas).
  z.object({ acao: z.literal("FAMILIA_EMITE_ANO"), ativo: z.boolean() }),
]);

export async function POST(request: NextRequest) {
  try {
    const session = await requireDirecao();
    const corpo = schema.parse(await request.json());
    const { acao } = corpo;
    if (corpo.acao === "FAMILIA_EMITE_ANO") {
      // Desligar sempre pode; ligar exige o Inter configurado.
      if (corpo.ativo && !isBancoInterConfigured()) {
        throw new ErroDeUsuario("O Banco Inter ainda não está configurado (variáveis de ambiente na Vercel).", 409);
      }
      await prisma.school.update({ where: { id: session.schoolId }, data: { familiaEmiteBoletosAno: corpo.ativo } });
      console.info("familia emite boletos do ano", { schoolId: session.schoolId, ativo: corpo.ativo, por: session.sub });
      return NextResponse.json({ ok: true, familiaEmiteBoletosAno: corpo.ativo });
    }
    if (!isBancoInterConfigured()) {
      throw new ErroDeUsuario("O Banco Inter ainda não está configurado (variáveis de ambiente na Vercel).", 409);
    }

    if (acao === "REGISTRAR_WEBHOOK") {
      const origem = origemPublica();
      const secret = process.env.BANCO_INTER_WEBHOOK_SECRET;
      if (!origem) throw new ErroDeUsuario("Endereço público do app (APP_URL) não definido.", 409);
      if (!secret) throw new ErroDeUsuario("Defina BANCO_INTER_WEBHOOK_SECRET na Vercel antes de cadastrar o webhook.", 409);
      const url = `${origem}${PATH_WEBHOOK}?secret=${encodeURIComponent(secret)}`;
      await registrarWebhook(url);
      return NextResponse.json({ ok: true, endereco: `${origem}${PATH_WEBHOOK}` });
    }

    const resultado = await emitirPendentesNoInter(session.schoolId, agoraNoFusoDaEscola());
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    return handleApiError(error);
  }
}
