import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Contrato assinado acima de 4 MB: vai direto do navegador ao Blob privado e o servidor
// confere o conteúdo antes de registrar o envio.

const blob = vi.hoisted(() => ({ issueSignedToken: vi.fn(), get: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
const cliente = vi.hoisted(() => ({ handleUploadPresigned: vi.fn() }));
vi.mock("@vercel/blob/client", () => cliente);

const banco = vi.hoisted(() => {
  const tx = {
    contrato: { updateMany: vi.fn() },
    contratoArquivo: { create: vi.fn() },
    contratoEvento: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      contrato: { findFirst: vi.fn() },
      guardianStudent: { findUnique: vi.fn() },
      contratoArquivo: { findFirst: vi.fn() },
      student: { findUnique: vi.fn(async () => ({ name: "Ana Souza" })) },
      user: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: banco.prisma }));
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn(async () => undefined) }));
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor: vi.fn() }));
const sessao = vi.hoisted(() => ({ role: "GUARDIAN" }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async (...roles: string[]) => {
    if (!roles.includes(sessao.role)) {
      const { AuthError } = await import("@/lib/session");
      throw new AuthError("Acesso negado para este perfil", 403);
    }
    return { sub: "resp1", role: sessao.role, schoolId: "escola1", name: "Maria" };
  }),
  AuthError: class AuthError extends Error {
    constructor(
      m: string,
      readonly status = 401,
    ) {
      super(m);
    }
  },
}));

import { CONTRATO_MAX_BYTES, caminhoContratoValido } from "@/lib/contratos";
import { POST as autorizar } from "@/app/api/contratos/[id]/assinado/envio/route";
import { POST as enviar } from "@/app/api/contratos/[id]/assinado/route";
import { GET as baixar } from "@/app/api/contratos/[id]/arquivos/[arquivoId]/route";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const CAMINHO = `classlink/escola1/contratos/c1/${UUID}.pdf`;
const ctx = (id = "c1") => ({ params: Promise.resolve({ id }) }) as never;
const json = (url: string, corpo: unknown) =>
  new NextRequest(`http://t${url}`, { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } });

function pdfGrande(tamanho: number): Uint8Array {
  const bytes = new Uint8Array(tamanho);
  bytes.set(new TextEncoder().encode("%PDF-1.7"));
  return bytes;
}

/** Simula o Blob devolvendo o arquivo em pedaços de 1 MB. */
function noBlob(bytes: Uint8Array) {
  const pedaco = 1024 * 1024;
  blob.get.mockResolvedValue({
    statusCode: 200,
    blob: { size: bytes.byteLength, contentType: "application/pdf" },
    stream: new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.byteLength; i += pedaco) c.enqueue(bytes.slice(i, i + pedaco));
        c.close();
      },
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessao.role = "GUARDIAN";
  process.env.BLOB_STORE_ID = "store_teste";
  banco.prisma.contrato.findFirst.mockResolvedValue({ id: "c1", schoolId: "escola1", studentId: "a1", status: "AGUARDANDO_ASSINATURA" });
  banco.prisma.guardianStudent.findUnique.mockResolvedValue({ guardianId: "resp1", studentId: "a1" });
  banco.tx.contrato.updateMany.mockResolvedValue({ count: 1 });
  blob.issueSignedToken.mockResolvedValue({ delegationToken: "d", clientSigningToken: "c", validUntil: Date.now() + 1000 });
  blob.del.mockResolvedValue(undefined);
  cliente.handleUploadPresigned.mockImplementation(async ({ body, getSignedToken }) => {
    const r = await getSignedToken(body.payload.pathname, null, false);
    return { type: "blob.generate-presigned-url", presignedUrlPayload: r };
  });
});

describe("caminho do contrato no armazenamento", () => {
  it("só na pasta do próprio contrato da escola, com uuid e .pdf", () => {
    expect(caminhoContratoValido(CAMINHO, "escola1", "c1")).toBe(true);
    expect(caminhoContratoValido(`classlink/escola2/contratos/c1/${UUID}.pdf`, "escola1", "c1")).toBe(false);
    expect(caminhoContratoValido(`classlink/escola1/contratos/c2/${UUID}.pdf`, "escola1", "c1")).toBe(false);
    expect(caminhoContratoValido(`classlink/escola1/contratos/c1/${UUID}.exe`, "escola1", "c1")).toBe(false);
    expect(caminhoContratoValido(`classlink/escola1/contratos/c1/../${UUID}.pdf`, "escola1", "c1")).toBe(false);
    expect(caminhoContratoValido(CAMINHO, "escola1", "c1/../x")).toBe(false);
  });
});

describe("autorização do envio direto do contrato", () => {
  const corpo = (pathname: string) => ({ type: "blob.generate-presigned-url", payload: { pathname, clientPayload: null, multipart: false } });

  it("responsável recebe link só para PDF de até 20 MB, no caminho do contrato", async () => {
    const res = await autorizar(json("/api/contratos/c1/assinado/envio", corpo(CAMINHO)), ctx());
    expect(res.status).toBe(200);
    expect(blob.issueSignedToken.mock.calls[0][0]).toMatchObject({
      pathname: CAMINHO,
      operations: ["put"],
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: 20 * 1024 * 1024,
    });
  });

  it("recusa responsável sem vínculo, outro caminho, contrato já enviado e equipe", async () => {
    banco.prisma.guardianStudent.findUnique.mockResolvedValueOnce(null);
    expect((await autorizar(json("/x", corpo(CAMINHO)), ctx())).status).toBe(404);

    expect((await autorizar(json("/x", corpo(`classlink/escola1/contratos/c9/${UUID}.pdf`)), ctx())).status).toBe(400);

    banco.prisma.contrato.findFirst.mockResolvedValueOnce({ id: "c1", schoolId: "escola1", studentId: "a1", status: "EM_CONFERENCIA" });
    expect((await autorizar(json("/x", corpo(CAMINHO)), ctx())).status).toBe(409);

    sessao.role = "STAFF";
    expect((await autorizar(json("/x", corpo(CAMINHO)), ctx())).status).toBe(403);
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });

  it("sem Blob conectado, explica em vez de falhar", async () => {
    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const res = await autorizar(json("/x", corpo(CAMINHO)), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/4 MB/);
  });
});

describe("registro do contrato enviado direto", () => {
  const corpo = { metodo: "MANUSCRITA", declaracao: "true", path: CAMINHO, nomeArquivo: "contrato assinado.pdf" };

  it("PDF de 12 MB: confere, calcula o hash no servidor e guarda só o caminho", async () => {
    noBlob(pdfGrande(12 * 1024 * 1024));
    const res = await enviar(json("/api/contratos/c1/assinado", corpo), ctx());
    expect(res.status).toBe(201);
    const dados = banco.tx.contratoArquivo.create.mock.calls[0][0].data;
    expect(dados).toMatchObject({ blobPath: CAMINHO, tamanhoBytes: 12 * 1024 * 1024, tipo: "ASSINADO", enviadoPorId: "resp1" });
    expect(dados.conteudo).toBeUndefined();
    expect(dados.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("arquivo que não é PDF é recusado e apagado do armazenamento", async () => {
    noBlob(new Uint8Array(5 * 1024 * 1024).fill(0xff));
    const res = await enviar(json("/api/contratos/c1/assinado", corpo), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/PDF/);
    expect(blob.del).toHaveBeenCalledWith(CAMINHO);
    expect(banco.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("acima de 20 MB é recusado com mensagem clara e apagado", async () => {
    noBlob(pdfGrande(CONTRATO_MAX_BYTES + 1));
    const res = await enviar(json("/api/contratos/c1/assinado", corpo), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/20 MB/);
    expect(blob.del).toHaveBeenCalledWith(CAMINHO);
  });

  it("caminho de outro contrato é recusado sem ler o armazenamento", async () => {
    const res = await enviar(json("/api/contratos/c1/assinado", { ...corpo, path: `classlink/escola1/contratos/c2/${UUID}.pdf` }), ctx());
    expect(res.status).toBe(400);
    expect(blob.get).not.toHaveBeenCalled();
  });

  it("se o contrato mudou ao mesmo tempo, não deixa o PDF solto no armazenamento", async () => {
    noBlob(pdfGrande(6 * 1024 * 1024));
    banco.tx.contrato.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await enviar(json("/api/contratos/c1/assinado", corpo), ctx());
    expect(res.status).toBe(409);
    expect(blob.del).toHaveBeenCalledWith(CAMINHO);
  });

  it("envio pelo formulário (até 4 MB) continua guardando no banco", async () => {
    const form = new FormData();
    form.append("metodo", "GOVBR");
    form.append("declaracao", "true");
    form.append("file", new File([pdfGrande(1024) as BlobPart], "contrato.pdf", { type: "application/pdf" }));
    const res = await enviar(new NextRequest("http://t/api/contratos/c1/assinado", { method: "POST", body: form }), ctx());
    expect(res.status).toBe(201);
    const dados = banco.tx.contratoArquivo.create.mock.calls[0][0].data;
    expect(dados.conteudo).toBeInstanceOf(Uint8Array);
    expect(dados.blobPath).toBeUndefined();
  });
});

describe("download do contrato guardado no armazenamento", () => {
  it("repassa o PDF do Blob em fluxo, sem link público", async () => {
    sessao.role = "ADMIN";
    banco.prisma.contratoArquivo.findFirst.mockResolvedValue({ nomeArquivo: "contrato.pdf", conteudo: null, blobPath: CAMINHO });
    noBlob(pdfGrande(6 * 1024 * 1024));
    const res = await baixar(new NextRequest("http://t/api/contratos/c1/arquivos/f1?download=1"), {
      params: Promise.resolve({ id: "c1", arquivoId: "f1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe(String(6 * 1024 * 1024));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(blob.get).toHaveBeenCalledWith(CAMINHO, { access: "private" });
    expect((await res.arrayBuffer()).byteLength).toBe(6 * 1024 * 1024);
  });
});
