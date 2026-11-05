import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Direção confirma a renovação de contrato assinado fora do app, anexando o PDF.

const blob = vi.hoisted(() => ({ issueSignedToken: vi.fn(), get: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
const cliente = vi.hoisted(() => ({ handleUploadPresigned: vi.fn() }));
vi.mock("@vercel/blob/client", () => cliente);

const banco = vi.hoisted(() => {
  const tx = {
    contrato: { updateMany: vi.fn(), create: vi.fn() },
    contratoArquivo: { create: vi.fn() },
    contratoEvento: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      contrato: { findFirst: vi.fn() },
      student: { findFirst: vi.fn() },
      guardianStudent: { findMany: vi.fn(async () => [{ guardianId: "resp1" }]) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: banco.prisma }));
const push = vi.hoisted(() => ({ notifyUsers: vi.fn(async () => undefined) }));
vi.mock("@/lib/push", () => push);
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor: vi.fn() }));
const sessao = vi.hoisted(() => ({ role: "ADMIN" }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async (...roles: string[]) => {
    if (!roles.includes(sessao.role)) {
      const { AuthError } = await import("@/lib/session");
      throw new AuthError("Acesso negado para este perfil", 403);
    }
    return { sub: "dir1", role: sessao.role, schoolId: "escola1", name: "Direção" };
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

import { alunoDoCaminhoRenovacao, podeConfirmarPelaEscola, statusAposConfirmacaoEscola } from "@/lib/contratos";
import { POST as confirmar } from "@/app/api/admin/contratos/renovacao/route";
import { POST as autorizar } from "@/app/api/admin/contratos/renovacao/envio/route";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const CAMINHO = `classlink/escola1/contratos/renovacao/a1/${UUID}.pdf`;

function pdf(tamanho = 2048): Uint8Array {
  const bytes = new Uint8Array(tamanho);
  bytes.set(new TextEncoder().encode("%PDF-1.7"));
  return bytes;
}

function formulario(campos: Record<string, string>, arquivo: Uint8Array | null = pdf()) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.append(k, v);
  if (arquivo) form.append("file", new File([arquivo as BlobPart], "contrato assinado.pdf", { type: "application/pdf" }));
  return new NextRequest("http://t/api/admin/contratos/renovacao", { method: "POST", body: form });
}

const json = (url: string, corpo: unknown) =>
  new NextRequest(`http://t${url}`, { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } });

const base = { studentId: "a1", anoLetivo: "2027", metodo: "GOVBR", dataAssinatura: "2026-11-04", declaracao: "true" };

function noBlob(bytes: Uint8Array) {
  blob.get.mockResolvedValue({
    statusCode: 200,
    blob: { size: bytes.byteLength, contentType: "application/pdf" },
    stream: new ReadableStream({
      start(c) {
        c.enqueue(bytes);
        c.close();
      },
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessao.role = "ADMIN";
  process.env.BLOB_STORE_ID = "store_teste";
  banco.prisma.student.findFirst.mockResolvedValue({ id: "a1", name: "Ana Souza" });
  banco.prisma.contrato.findFirst.mockResolvedValue(null);
  banco.tx.contrato.updateMany.mockResolvedValue({ count: 1 });
  banco.tx.contrato.create.mockResolvedValue({ id: "novo1" });
  blob.del.mockResolvedValue(undefined);
  blob.issueSignedToken.mockResolvedValue({ delegationToken: "d", clientSigningToken: "c", validUntil: Date.now() + 1000 });
  cliente.handleUploadPresigned.mockImplementation(async ({ body, getSignedToken }) => {
    const r = await getSignedToken(body.payload.pathname, null, false);
    return { type: "blob.generate-presigned-url", presignedUrlPayload: r };
  });
});

describe("regras da confirmação pela escola", () => {
  it("só para contrato que ainda espera a família", () => {
    expect(podeConfirmarPelaEscola("AGUARDANDO_ASSINATURA")).toBe(true);
    expect(podeConfirmarPelaEscola("DEVOLVIDO")).toBe(true);
    expect(podeConfirmarPelaEscola("EM_CONFERENCIA")).toBe(false);
    expect(podeConfirmarPelaEscola("AGUARDANDO_ORIGINAL")).toBe(false);
    expect(podeConfirmarPelaEscola("COMPLETO")).toBe(false);
  });

  it("gov.br completa; à mão completa só com a via original na escola", () => {
    expect(statusAposConfirmacaoEscola("GOVBR", false)).toBe("COMPLETO");
    expect(statusAposConfirmacaoEscola("MANUSCRITA", true)).toBe("COMPLETO");
    expect(statusAposConfirmacaoEscola("MANUSCRITA", false)).toBe("AGUARDANDO_ORIGINAL");
  });

  it("caminho no armazenamento só na pasta de renovação da própria escola", () => {
    expect(alunoDoCaminhoRenovacao(CAMINHO, "escola1")).toBe("a1");
    expect(alunoDoCaminhoRenovacao(CAMINHO, "escola2")).toBeNull();
    expect(alunoDoCaminhoRenovacao(`classlink/escola1/contratos/renovacao/a1/../${UUID}.pdf`, "escola1")).toBeNull();
    expect(alunoDoCaminhoRenovacao(`classlink/escola1/contratos/renovacao/a1/${UUID}.exe`, "escola1")).toBeNull();
    expect(alunoDoCaminhoRenovacao(`classlink/escola1/contratos/c1/${UUID}.pdf`, "escola1")).toBeNull();
  });
});

describe("confirmar renovação de contrato já enviado pelo app", () => {
  beforeEach(() => {
    banco.prisma.contrato.findFirst.mockResolvedValue({ id: "c1", status: "AGUARDANDO_ASSINATURA", anoLetivo: 2027, titulo: "Contrato 2027" });
  });

  it("anexa o PDF, completa o contrato, registra auditoria e avisa a família", async () => {
    const res = await confirmar(formulario({ ...base, contratoId: "c1", observacao: "assinado na secretaria" }));
    expect(res.status).toBe(201);
    expect(banco.tx.contrato.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", status: "AGUARDANDO_ASSINATURA" },
      data: expect.objectContaining({ status: "COMPLETO", metodoAssinatura: "GOVBR", confirmadoPelaEscola: true, motivoDevolucao: null }),
    });
    const arquivo = banco.tx.contratoArquivo.create.mock.calls[0][0].data;
    expect(arquivo).toMatchObject({ contratoId: "c1", tipo: "ASSINADO", enviadoPorId: "dir1", nomeArquivo: "contrato assinado.pdf" });
    expect(arquivo.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(arquivo.conteudo).toBeDefined();
    const evento = banco.tx.contratoEvento.create.mock.calls[0][0].data;
    expect(evento).toMatchObject({ contratoId: "c1", tipo: "RENOVACAO_CONFIRMADA", usuarioId: "dir1", arquivoSha256: arquivo.sha256 });
    expect(evento.detalhe).toContain("assinado em 04/11/2026");
    expect(evento.detalhe).toContain("Obs.: assinado na secretaria");
    expect(banco.tx.contrato.create).not.toHaveBeenCalled();
    expect(push.notifyUsers).toHaveBeenCalledWith(["resp1"], expect.objectContaining({ title: "Contrato registrado pela escola" }));
  });

  it("assinado à mão sem a via original na escola fica aguardando a via original", async () => {
    const res = await confirmar(formulario({ ...base, contratoId: "c1", metodo: "MANUSCRITA", originalNaEscola: "false" }));
    expect(res.status).toBe(201);
    expect(banco.tx.contrato.updateMany.mock.calls[0][0].data.status).toBe("AGUARDANDO_ORIGINAL");
    expect(banco.tx.contratoEvento.create.mock.calls[0][0].data.detalhe).toContain("falta a via original");
  });

  it("recusa contrato em conferência ou concluído", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValueOnce({ id: "c1", status: "EM_CONFERENCIA", anoLetivo: 2027, titulo: "x" });
    const res = await confirmar(formulario({ ...base, contratoId: "c1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/aprove/);
    banco.prisma.contrato.findFirst.mockResolvedValueOnce({ id: "c1", status: "COMPLETO", anoLetivo: 2027, titulo: "x" });
    expect((await confirmar(formulario({ ...base, contratoId: "c1" }))).status).toBe(409);
    expect(banco.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("se a família enviou ao mesmo tempo, não sobrescreve", async () => {
    banco.tx.contrato.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await confirmar(formulario({ ...base, contratoId: "c1" }));
    expect(res.status).toBe(409);
    expect(push.notifyUsers).not.toHaveBeenCalled();
  });

  it("sem PDF válido, sem declaração, com data no futuro ou sem ser direção: recusa", async () => {
    expect((await confirmar(formulario({ ...base, contratoId: "c1" }, null))).status).toBe(400);
    expect((await confirmar(formulario({ ...base, contratoId: "c1" }, new Uint8Array(100).fill(0x41)))).status).toBe(400);
    const { declaracao: _d, ...semDeclaracao } = base;
    void _d;
    expect((await confirmar(formulario({ ...semDeclaracao, contratoId: "c1" }))).status).toBe(400);
    expect((await confirmar(formulario({ ...base, contratoId: "c1", dataAssinatura: "2099-01-01" }))).status).toBe(400);
    sessao.role = "GUARDIAN";
    expect((await confirmar(formulario({ ...base, contratoId: "c1" }))).status).toBe(403);
    expect(banco.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("aluno de outra escola não é encontrado", async () => {
    banco.prisma.student.findFirst.mockResolvedValueOnce(null);
    expect((await confirmar(formulario({ ...base, contratoId: "c1" }))).status).toBe(404);
  });
});

describe("renovação sem contrato no app", () => {
  it("cria o contrato já assinado com o PDF anexado", async () => {
    const res = await confirmar(formulario({ ...base, titulo: "Contrato de prestação de serviços educacionais 2027" }));
    expect(res.status).toBe(201);
    expect(banco.tx.contrato.create.mock.calls[0][0].data).toMatchObject({
      schoolId: "escola1",
      studentId: "a1",
      anoLetivo: 2027,
      status: "COMPLETO",
      confirmadoPelaEscola: true,
      criadoPorId: "dir1",
    });
    expect(banco.tx.contratoArquivo.create.mock.calls[0][0].data.contratoId).toBe("novo1");
    expect(banco.tx.contratoEvento.create.mock.calls[0][0].data.tipo).toBe("RENOVACAO_CONFIRMADA");
  });

  it("exige título", async () => {
    expect((await confirmar(formulario(base))).status).toBe(400);
  });

  it("aluno com contrato do ano em aberto no app: manda confirmar no cartão (sem duplicar)", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValueOnce({ id: "c1" });
    const res = await confirmar(formulario({ ...base, titulo: "Contrato 2027" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/cartão/);
    expect(banco.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("PDF acima de 4 MB direto ao armazenamento", () => {
  const corpoToken = (pathname: string) => ({ type: "blob.generate-presigned-url", payload: { pathname, clientPayload: null, multipart: false } });

  it("direção recebe link só para a pasta de renovação de aluno da escola", async () => {
    expect((await autorizar(json("/x", corpoToken(CAMINHO)))).status).toBe(200);
    expect(blob.issueSignedToken.mock.calls[0][0]).toMatchObject({ pathname: CAMINHO, allowedContentTypes: ["application/pdf"], maximumSizeInBytes: 20 * 1024 * 1024 });

    expect((await autorizar(json("/x", corpoToken(`classlink/escola2/contratos/renovacao/a1/${UUID}.pdf`)))).status).toBe(400);
    banco.prisma.student.findFirst.mockResolvedValueOnce(null);
    expect((await autorizar(json("/x", corpoToken(CAMINHO)))).status).toBe(404);
    sessao.role = "GUARDIAN";
    expect((await autorizar(json("/x", corpoToken(CAMINHO)))).status).toBe(403);
    expect(blob.issueSignedToken).toHaveBeenCalledTimes(1);
  });

  it("registra guardando só o caminho e o hash", async () => {
    noBlob(pdf(6 * 1024 * 1024));
    const res = await confirmar(json("/api/admin/contratos/renovacao", { ...base, titulo: "Contrato 2027", path: CAMINHO, nomeArquivo: "digitalizado.pdf" }));
    expect(res.status).toBe(201);
    const arquivo = banco.tx.contratoArquivo.create.mock.calls[0][0].data;
    expect(arquivo).toMatchObject({ blobPath: CAMINHO, tamanhoBytes: 6 * 1024 * 1024 });
    expect(arquivo.conteudo).toBeUndefined();
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("caminho de outro aluno é recusado; arquivo inválido é apagado", async () => {
    const outro = await confirmar(json("/x", { ...base, studentId: "a2", titulo: "Contrato 2027", path: CAMINHO, nomeArquivo: "x.pdf" }));
    expect(outro.status).toBe(400);
    expect(blob.get).not.toHaveBeenCalled();

    noBlob(new Uint8Array(5 * 1024 * 1024).fill(0xff));
    const res = await confirmar(json("/x", { ...base, titulo: "Contrato 2027", path: CAMINHO, nomeArquivo: "x.pdf" }));
    expect(res.status).toBe(400);
    expect(blob.del).toHaveBeenCalledWith(CAMINHO);
  });

  it("recusa por regra (contrato em aberto) também apaga o arquivo enviado", async () => {
    banco.prisma.contrato.findFirst.mockResolvedValueOnce({ id: "c1" });
    const res = await confirmar(json("/x", { ...base, titulo: "Contrato 2027", path: CAMINHO, nomeArquivo: "x.pdf" }));
    expect(res.status).toBe(409);
    expect(blob.del).toHaveBeenCalledWith(CAMINHO);
  });
});
