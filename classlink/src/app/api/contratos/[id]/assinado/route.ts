import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { envioAssinadoDiretoSchema, envioAssinadoSchema } from "@/lib/validators";
import {
  CONTRATO_LIMITE_ENVIO_SERVIDOR,
  CONTRATO_MAX_BYTES,
  ContratoErro,
  METODO_LABEL,
  caminhoContratoValido,
  nomeArquivoPdfSeguro,
  proximoStatus,
  validarPdf,
  type ContratoMetodo,
} from "@/lib/contratos";
import { carregarContratoComAcesso, direcaoDaEscola, lerPdfDoBlob, sha256Hex } from "@/lib/contratos-server";
import { apagarDoBlob } from "@/lib/blob-storage";
import { getClientIp } from "@/lib/solicitacoes-matricula";
import { notifyUsers } from "@/lib/push";

/**
 * Responsável envia o PDF do contrato assinado (gov.br ou à mão). Quem enviou, data/hora,
 * IP e o hash SHA-256 do arquivo são sempre atribuídos pelo servidor — nunca aceitos do
 * cliente — e ficam na trilha de auditoria. Reenvios (após devolução) guardam o arquivo
 * anterior, que continua no histórico.
 *
 * Dois formatos: multipart com o PDF (até 4 MB, guardado no banco) ou JSON com o caminho do
 * PDF que o navegador já enviou direto ao Blob privado (até 20 MB; ver ./envio). No segundo,
 * o servidor lê o arquivo do Blob e faz as mesmas conferências; se recusar, apaga o arquivo.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/contratos/[id]/assinado">) {
  try {
    const session = await requireRole("GUARDIAN");
    const { id } = await ctx.params;

    const contrato = await carregarContratoComAcesso(id, session);
    if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });

    let dados: { metodo: ContratoMetodo };
    let nomeArquivo: string;
    let bytes: Uint8Array<ArrayBuffer>;
    let blobPath: string | null = null;

    if (request.headers.get("content-type")?.includes("application/json")) {
      const corpo = envioAssinadoDiretoSchema.parse(await request.json());
      if (!caminhoContratoValido(corpo.path, session.schoolId, id)) {
        return NextResponse.json({ error: "Caminho de arquivo inválido." }, { status: 400 });
      }
      blobPath = corpo.path;
      try {
        const lido = await lerPdfDoBlob(blobPath, CONTRATO_MAX_BYTES);
        if (!lido) return NextResponse.json({ error: "O arquivo não chegou ao armazenamento. Envie de novo." }, { status: 404 });
        bytes = lido;
      } catch (e) {
        if (!(e instanceof ContratoErro)) throw e;
        await apagarDoBlob(blobPath).catch(() => undefined);
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      dados = corpo;
      nomeArquivo = corpo.nomeArquivo;
    } else {
      const form = await request.formData();
      dados = envioAssinadoSchema.parse({ metodo: form.get("metodo"), declaracao: form.get("declaracao") });
      const arquivo = form.get("file");
      if (!(arquivo instanceof File)) return NextResponse.json({ error: "Anexe o PDF do contrato assinado" }, { status: 400 });
      bytes = new Uint8Array(await arquivo.arrayBuffer());
      nomeArquivo = arquivo.name;
    }

    let novoStatus;
    try {
      validarPdf(bytes, blobPath ? CONTRATO_MAX_BYTES : CONTRATO_LIMITE_ENVIO_SERVIDOR);
      novoStatus = proximoStatus(contrato.status, "ENVIAR_ASSINADO");
    } catch (e) {
      if (blobPath) await apagarDoBlob(blobPath).catch(() => undefined);
      if (e instanceof ContratoErro) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }

    const sha256 = sha256Hex(bytes);
    const ipOrigem = getClientIp(request);
    const agora = new Date();

    const caminhoEnviado = blobPath;
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
          nomeArquivo: nomeArquivoPdfSeguro(nomeArquivo),
          mimeType: "application/pdf",
          tamanhoBytes: bytes.byteLength,
          sha256,
          // Acima de 4 MB o PDF fica só no Blob privado: o banco guarda o caminho e o hash.
          ...(blobPath ? { blobPath } : { conteudo: bytes }),
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
    }).catch(async (e) => {
      // Envio não registrado (ex.: contrato atualizado ao mesmo tempo): não deixa o PDF solto no Blob.
      if (caminhoEnviado) await apagarDoBlob(caminhoEnviado).catch(() => undefined);
      throw e;
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
