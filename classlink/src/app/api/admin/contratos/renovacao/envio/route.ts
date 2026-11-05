import { NextRequest, NextResponse } from "next/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { isBlobConfigured } from "@/lib/blob-storage";
import { CONTRATO_MAX_BYTES, alunoDoCaminhoRenovacao } from "@/lib/contratos";

/**
 * Confirmação de renovação com PDF acima de 4 MB (contrato em papel digitalizado): autoriza o
 * navegador da direção a enviar o arquivo direto ao Vercel Blob privado. Link válido por 15
 * minutos, só para a pasta de renovação de um aluno da própria escola, só PDF e até 20 MB.
 * Depois, POST /api/admin/contratos/renovacao confere o conteúdo e registra.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    if (!isBlobConfigured()) {
      throw new ErroDeUsuario("Arquivos acima de 4 MB ainda não podem ser recebidos. Digitalize em resolução menor (150 dpi).", 400);
    }

    const body = (await request.json()) as HandleUploadPresignedBody;
    const tipos = ["application/pdf"];
    const resultado = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        const alunoId = alunoDoCaminhoRenovacao(pathname, session.schoolId);
        if (!alunoId) throw new ErroDeUsuario("Caminho de arquivo inválido.", 400);
        const aluno = await prisma.student.findFirst({ where: { id: alunoId, schoolId: session.schoolId, deletedAt: null }, select: { id: true } });
        if (!aluno) throw new ErroDeUsuario("Aluno não encontrado", 404);
        const validUntil = Date.now() + 15 * 60 * 1000;
        const token = await issueSignedToken({ pathname, operations: ["put"], allowedContentTypes: tipos, maximumSizeInBytes: CONTRATO_MAX_BYTES, validUntil });
        return { token, urlOptions: { allowedContentTypes: tipos, maximumSizeInBytes: CONTRATO_MAX_BYTES, validUntil, addRandomSuffix: false } };
      },
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
