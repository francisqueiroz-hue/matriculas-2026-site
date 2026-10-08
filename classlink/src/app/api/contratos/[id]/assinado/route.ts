import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { envioAssinadoSchema } from "@/lib/validators";
import { ContratoErro, METODO_LABEL, nomeArquivoPdfSeguro, proximoStatus, validarPdf } from "@/lib/contratos";
import { carregarContratoComAcesso, direcaoDaEscola, sha256Hex } from "@/lib/contratos-server";
import { getClientIp } from "@/lib/solicitacoes-matricula";
import { notifyUsers } from "@/lib/push";

/**
 * Responsável envia o PDF do contrato assinado (gov.br ou à mão). Quem enviou, data/hora,
 * IP e o hash SHA-256 do arquivo são sempre atribuídos pelo servidor — nunca aceitos do
 * cliente — e ficam na trilha de auditoria. Reenvios (após devolução) guardam o arquivo
 * anterior, que continua no histórico.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/contratos/[id]/assinado">) {
  try {
    const session = await requireRole("GUARDIAN");
    const { id } = await ctx.params;

    const contrato = await carregarContratoComAcesso(id, session);
    if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });

    const form = await request.formData();
    const dados = envioAssinadoSchema.parse({ metodo: form.get("metodo"), declaracao: form.get("declaracao") });

    const arquivo = form.get("file");
    if (!(arquivo instanceof File)) return NextResponse.json({ error: "Anexe o PDF do contrato assinado" }, { status: 400 });
    const bytes = new Uint8Array(await arquivo.arrayBuffer());

    let novoStatus;
    try {
      validarPdf(bytes);
      novoStatus = proximoStatus(contrato.status, "ENVIAR_ASSINADO");
    } catch (e) {
      if (e instanceof ContratoErro) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }

    const sha256 = sha256Hex(bytes);
    const ipOrigem = getClientIp(request);
    const agora = new Date();

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.contrato.updateMany({
        where: { id, status: contrato.status },
        data: { status: novoStatus, metodoAssinatura: dados.metodo, assinadoEnviadoEm: agora, motivoDevolucao: null },
      });
      if (count === 0) throw new ContratoErro("Este contrato acabou de ser atualizado. Recarregue a página.");
      await tx.contratoArquivo.create({
        data: {
          contratoId: id,
          tipo: "ASSINADO",
          nomeArquivo: nomeArquivoPdfSeguro(arquivo.name),
          mimeType: "application/pdf",
          tamanhoBytes: bytes.byteLength,
          sha256,
          conteudo: bytes,
          enviadoPorId: session.sub,
          ipOrigem,
          createdAt: agora,
        },
      });
      await tx.contratoEvento.create({
        data: {
          contratoId: id,
          tipo: "ASSINADO_ENVIADO",
          usuarioId: session.sub,
          ipOrigem,
          arquivoSha256: sha256,
          detalhe: `${METODO_LABEL[dados.metodo]} · declaração de responsável marcada`,
          createdAt: agora,
        },
      });
    });

    const aluno = await prisma.student.findUnique({ where: { id: contrato.studentId }, select: { name: true } });
    await notifyUsers(await direcaoDaEscola(session.schoolId), {
      title: "Contrato assinado recebido",
      body: `${session.name} enviou o contrato de ${aluno?.name ?? "um aluno"} (${METODO_LABEL[dados.metodo]}). Confira em Contratos.`,
      url: "/dashboard/admin/contratos",
    }).catch((err) => console.error("push notify failed", err));

    return NextResponse.json({ ok: true, status: novoStatus, sha256, enviadoEm: agora.toISOString() }, { status: 201 });
  } catch (error) {
    if (error instanceof ContratoErro) return NextResponse.json({ error: error.message }, { status: 409 });
    return handleApiError(error);
  }
}
