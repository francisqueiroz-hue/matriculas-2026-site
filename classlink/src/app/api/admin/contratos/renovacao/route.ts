import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { confirmarRenovacaoDiretoSchema, confirmarRenovacaoSchema } from "@/lib/validators";
import {
  CONTRATO_LIMITE_ENVIO_SERVIDOR,
  CONTRATO_MAX_BYTES,
  ContratoErro,
  METODO_LABEL,
  alunoDoCaminhoRenovacao,
  dataIsoParaBr,
  nomeArquivoPdfSeguro,
  MOTIVO_SUBSTITUICAO_MIN,
  ehSubstituicaoDeAssinado,
  statusAposConfirmacaoEscola,
  validarPdf,
} from "@/lib/contratos";
import { lerPdfDoBlob, responsaveisDoAluno, sha256Hex } from "@/lib/contratos-server";
import { apagarDoBlob } from "@/lib/blob-storage";
import { getClientIp } from "@/lib/solicitacoes-matricula";
import { notifyUsers } from "@/lib/push";

const CAMPOS = ["studentId", "contratoId", "anoLetivo", "titulo", "metodo", "originalNaEscola", "dataAssinatura", "observacao", "declaracao"] as const;

/** Lê os campos do formulário como texto; campos vazios ficam de fora (opcionais). */
function camposDoForm(form: FormData) {
  const dados: Record<string, string> = {};
  for (const c of CAMPOS) {
    const v = form.get(c);
    if (typeof v === "string" && v !== "") dados[c] = v;
  }
  return dados;
}

/**
 * Direção confirma a renovação de um contrato assinado FORA do app (papel na secretaria, PDF do
 * gov.br recebido por WhatsApp ou e-mail…) anexando o documento, para o registro ficar completo
 * no app. Quem confirmou, data/hora, IP e o SHA-256 do arquivo vêm sempre do servidor e entram
 * na trilha de auditoria. Com `contratoId`, completa o contrato já enviado à família; sem ele,
 * registra um contrato novo para o aluno (renovação que nunca passou pelo app).
 *
 * Mesmos dois formatos do envio da família: multipart com o PDF (até 4 MB, no banco) ou JSON
 * com o caminho do PDF que o navegador já mandou ao Blob privado (até 20 MB; ver ./envio).
 */
export async function POST(request: NextRequest) {
  let blobPath: string | null = null;
  try {
    const session = await requireRole("ADMIN");

    let bruto: Record<string, unknown>;
    let nomeArquivo: string;
    let bytes: Uint8Array<ArrayBuffer> | null = null;

    if (request.headers.get("content-type")?.includes("application/json")) {
      bruto = (await request.json()) as Record<string, unknown>;
      const direto = confirmarRenovacaoDiretoSchema.parse(bruto);
      const alunoDoCaminho = alunoDoCaminhoRenovacao(direto.path, session.schoolId);
      if (!alunoDoCaminho || alunoDoCaminho !== bruto.studentId) {
        return NextResponse.json({ error: "Caminho de arquivo inválido." }, { status: 400 });
      }
      blobPath = direto.path;
      nomeArquivo = direto.nomeArquivo;
    } else {
      const form = await request.formData();
      bruto = camposDoForm(form);
      const arquivo = form.get("file");
      if (!(arquivo instanceof File)) return NextResponse.json({ error: "Anexe o PDF do contrato assinado" }, { status: 400 });
      bytes = new Uint8Array(await arquivo.arrayBuffer());
      nomeArquivo = arquivo.name;
    }

    const dados = confirmarRenovacaoSchema.parse(bruto);

    const aluno = await prisma.student.findFirst({
      where: { id: dados.studentId, schoolId: session.schoolId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!aluno) throw new ErroRecusa("Aluno não encontrado", 404);

    // Contrato já enviado pelo app: a direção anexa o assinado em qualquer situação; em contrato
    // completo que já tem PDF assinado é uma substituição, que exige motivo.
    const existente = dados.contratoId
      ? await prisma.contrato.findFirst({
          where: { id: dados.contratoId, schoolId: session.schoolId, studentId: aluno.id },
          select: { id: true, status: true, anoLetivo: true, titulo: true, _count: { select: { arquivos: { where: { tipo: "ASSINADO" } } } } },
        })
      : null;
    if (dados.contratoId) {
      if (!existente) throw new ErroRecusa("Contrato não encontrado", 404);
      if (ehSubstituicaoDeAssinado(existente.status, existente._count.arquivos > 0) && (dados.observacao ?? "").length < MOTIVO_SUBSTITUICAO_MIN) {
        throw new ErroRecusa("Informe o motivo da substituição do contrato assinado (ex.: o arquivo aprovado não tinha assinatura).", 400);
      }
    } else {
      // Renovação sem contrato no app: se o aluno já tem contrato do ano, o documento vai no
      // cartão desse contrato (evita duplicar e deixar lembretes rodando).
      const jaTem = await prisma.contrato.findFirst({
        where: { schoolId: session.schoolId, studentId: aluno.id, anoLetivo: dados.anoLetivo },
        select: { id: true },
      });
      if (jaTem) {
        throw new ErroRecusa(
          `${aluno.name} já tem contrato ${dados.anoLetivo} no app. Anexe o documento pelo botão no cartão desse contrato.`,
          409,
        );
      }
    }

    if (blobPath) {
      bytes = await lerPdfDoBlob(blobPath, CONTRATO_MAX_BYTES);
      if (!bytes) throw new ErroRecusa("O arquivo não chegou ao armazenamento. Envie de novo.", 404);
    }
    validarPdf(bytes!, blobPath ? CONTRATO_MAX_BYTES : CONTRATO_LIMITE_ENVIO_SERVIDOR);

    const pdf = bytes!;
    const sha256 = sha256Hex(pdf);
    const ipOrigem = getClientIp(request);
    const agora = new Date();
    // Contrato já aprovado (só faltava o PDF guardado) continua completo: anexar não reabre pendência.
    const novoStatus = existente?.status === "COMPLETO" ? "COMPLETO" : statusAposConfirmacaoEscola(dados.metodo, dados.originalNaEscola);
    const substituicao = !!existente && ehSubstituicaoDeAssinado(existente.status, existente._count.arquivos > 0);
    const detalhe = [
      substituicao ? "Substitui o PDF assinado anterior (que continua guardado)" : null,
      `${METODO_LABEL[dados.metodo]} · assinado em ${dataIsoParaBr(dados.dataAssinatura)}`,
      dados.metodo === "MANUSCRITA" ? (dados.originalNaEscola ? "via original arquivada na escola" : "falta a via original") : null,
      dados.observacao ? `${substituicao ? "Motivo" : "Obs."}: ${dados.observacao}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const contrato = await prisma.$transaction(async (tx) => {
      const camposStatus = {
        status: novoStatus,
        metodoAssinatura: dados.metodo,
        assinadoEnviadoEm: agora,
        motivoDevolucao: null,
        confirmadoPelaEscola: true,
      };
      let contratoId: string;
      if (existente) {
        // Só se o status ainda for o lido acima (a família pode ter enviado nesse meio-tempo).
        const { count } = await tx.contrato.updateMany({ where: { id: existente.id, status: existente.status }, data: camposStatus });
        if (count === 0) throw new ErroRecusa("O contrato acabou de ser atualizado (a família pode ter enviado). Recarregue a página.", 409);
        contratoId = existente.id;
      } else {
        const criado = await tx.contrato.create({
          data: {
            schoolId: session.schoolId,
            studentId: aluno.id,
            anoLetivo: dados.anoLetivo,
            titulo: dados.titulo!,
            criadoPorId: session.sub,
            ...camposStatus,
          },
          select: { id: true },
        });
        contratoId = criado.id;
      }
      await tx.contratoArquivo.create({
        data: {
          contratoId,
          tipo: "ASSINADO",
          nomeArquivo: nomeArquivoPdfSeguro(nomeArquivo),
          mimeType: "application/pdf",
          tamanhoBytes: pdf.byteLength,
          sha256,
          ...(blobPath ? { blobPath } : { conteudo: pdf }),
          enviadoPorId: session.sub,
          ipOrigem,
          createdAt: agora,
        },
      });
      await tx.contratoEvento.create({
        data: { contratoId, tipo: "RENOVACAO_CONFIRMADA", usuarioId: session.sub, ipOrigem, arquivoSha256: sha256, detalhe, createdAt: agora },
      });
      return { id: contratoId, status: novoStatus, anoLetivo: existente?.anoLetivo ?? dados.anoLetivo };
    });
    blobPath = null; // registrado: o arquivo fica

    const primeiroNome = aluno.name.split(" ")[0];
    await notifyUsers(await responsaveisDoAluno(aluno.id), {
      title: "Contrato registrado pela escola",
      body:
        novoStatus === "COMPLETO"
          ? `A secretaria registrou o contrato ${contrato.anoLetivo} de ${primeiroNome} assinado. A cópia fica em Contratos.`
          : `A secretaria registrou o contrato ${contrato.anoLetivo} de ${primeiroNome}. Falta entregar a via original assinada na secretaria.`,
      url: "/dashboard/contratos",
    }).catch((err) => console.error("push notify failed", err));

    return NextResponse.json({ contrato, sha256 }, { status: 201 });
  } catch (error) {
    // Nada registrado: não deixa o PDF solto no armazenamento.
    if (blobPath) await apagarDoBlob(blobPath).catch(() => undefined);
    if (error instanceof ErroRecusa) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ContratoErro) return NextResponse.json({ error: error.message }, { status: 400 });
    return handleApiError(error);
  }
}

class ErroRecusa extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
