import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDirecao } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { novoContratoSchema } from "@/lib/validators";
import { CONTRATO_LIMITE_ENVIO_SERVIDOR, ContratoErro, nomeArquivoPdfSeguro, validarPdf } from "@/lib/contratos";
import { destinoDoAluno, sha256Hex } from "@/lib/contratos-server";
import { MOTIVO_SEM_FINANCEIRO } from "@/lib/responsavel-financeiro";
import { getClientIp } from "@/lib/solicitacoes-matricula";
import { notifyUsers } from "@/lib/push";

/**
 * Direção envia o contrato (PDF já preenchido com os dados do aluno) para a família
 * assinar. O responsável financeiro (ou o único responsável) recebe notificação no app.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireDirecao();
    const form = await request.formData();
    const dados = novoContratoSchema.parse({
      studentId: form.get("studentId"),
      anoLetivo: form.get("anoLetivo"),
      titulo: form.get("titulo"),
    });

    const arquivo = form.get("file");
    if (!(arquivo instanceof File)) return NextResponse.json({ error: "Anexe o PDF do contrato" }, { status: 400 });
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    try {
      validarPdf(bytes, CONTRATO_LIMITE_ENVIO_SERVIDOR);
    } catch (e) {
      if (e instanceof ContratoErro) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }

    const aluno = await prisma.student.findFirst({
      where: { id: dados.studentId, schoolId: session.schoolId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!aluno) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    // Com mais de um responsável, o contrato vai só ao financeiro: se nada indica quem é, não envia.
    const destino = await destinoDoAluno(aluno.id);
    if (destino.situacao === "INDEFINIDO") {
      return NextResponse.json({ error: MOTIVO_SEM_FINANCEIRO, codigo: "SEM_RESPONSAVEL_FINANCEIRO" }, { status: 409 });
    }

    const sha256 = sha256Hex(bytes);
    const ipOrigem = getClientIp(request);

    const contrato = await prisma.$transaction(async (tx) => {
      const criado = await tx.contrato.create({
        data: {
          schoolId: session.schoolId,
          studentId: aluno.id,
          anoLetivo: dados.anoLetivo,
          titulo: dados.titulo,
          criadoPorId: session.sub,
          porResponsavelFinanceiro: true,
          destinatarioId: destino.ids[0] ?? null,
        },
        select: { id: true, titulo: true, anoLetivo: true, status: true },
      });
      await tx.contratoArquivo.create({
        data: {
          contratoId: criado.id,
          tipo: "MODELO",
          nomeArquivo: nomeArquivoPdfSeguro(arquivo.name),
          mimeType: "application/pdf",
          tamanhoBytes: bytes.byteLength,
          sha256,
          conteudo: bytes,
          enviadoPorId: session.sub,
          ipOrigem,
        },
      });
      await tx.contratoEvento.create({
        data: { contratoId: criado.id, tipo: "CRIADO", usuarioId: session.sub, ipOrigem, arquivoSha256: sha256 },
      });
      return criado;
    });

    await notifyUsers(destino.ids, {
      title: "Contrato de matrícula disponível",
      body: `O contrato de ${aluno.name.split(" ")[0]} está pronto para assinatura. Assine grátis pelo gov.br e envie pelo app.`,
      url: "/dashboard/contratos",
    }).catch((err) => console.error("push notify failed", err));

    return NextResponse.json({ contrato }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
