import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ issueSignedToken: vi.fn(), get: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
const cliente = vi.hoisted(() => ({ handleUploadPresigned: vi.fn() }));
vi.mock("@vercel/blob/client", () => cliente);
const sessao = vi.hoisted(() => ({ role: "ADMIN" }));
vi.mock("@/lib/session", () => ({
  requireRole: vi.fn(async (...roles: string[]) => {
    if (!roles.includes(sessao.role)) {
      const { AuthError } = await import("@/lib/session");
      throw new AuthError("Acesso negado para este perfil", 403);
    }
    return { sub: "u1", role: sessao.role, schoolId: "escola1" };
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
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor: vi.fn() }));

process.env.JWT_ACCESS_SECRET = "segredo-de-teste-0123456789abcdef";

import { caminhoDiretoValido } from "@/lib/upload-direto";
import { POST as autorizar } from "@/app/api/upload/direto/route";
import { POST as confirmar } from "@/app/api/upload/confirmar/route";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const req = (url: string, corpo: unknown) => new NextRequest(`http://t${url}`, { method: "POST", body: JSON.stringify(corpo) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessao.role = "ADMIN";
  process.env.BLOB_STORE_ID = "store_teste";
  blob.issueSignedToken.mockResolvedValue({ delegationToken: "d", clientSigningToken: "c", validUntil: Date.now() + 1000 });
  cliente.handleUploadPresigned.mockImplementation(async ({ body, getSignedToken }) => {
    const r = await getSignedToken(body.payload.pathname, null, false);
    return { type: "blob.generate-presigned-url", presignedUrlPayload: r };
  });
});

describe("caminho permitido", () => {
  it("só na pasta da escola, com uuid e extensão aceita", () => {
    expect(caminhoDiretoValido(`classlink/escola1/${UUID}.mp4`, "escola1")).toBe(true);
    expect(caminhoDiretoValido(`classlink/escola2/${UUID}.mp4`, "escola1")).toBe(false);
    expect(caminhoDiretoValido(`classlink/escola1/${UUID}.exe`, "escola1")).toBe(false);
    expect(caminhoDiretoValido(`classlink/escola1/../x/${UUID}.mp4`, "escola1")).toBe(false);
  });
});

describe("autorização do envio direto", () => {
  const corpo = (pathname: string) => ({ type: "blob.generate-presigned-url", payload: { pathname, clientPayload: null, multipart: false } });

  it("equipe recebe link só para o caminho pedido, com tipos e tamanho limitados", async () => {
    const res = await autorizar(req("/api/upload/direto", corpo(`classlink/escola1/${UUID}.mp4`)));
    expect(res.status).toBe(200);
    expect(blob.issueSignedToken.mock.calls[0][0]).toMatchObject({
      pathname: `classlink/escola1/${UUID}.mp4`,
      operations: ["put"],
      maximumSizeInBytes: 50 * 1024 * 1024,
    });
    expect(blob.issueSignedToken.mock.calls[0][0].allowedContentTypes).toContain("video/mp4");
  });

  it("recusa caminho de outra escola, família e projeto sem Blob", async () => {
    expect((await autorizar(req("/api/upload/direto", corpo(`classlink/escola2/${UUID}.mp4`)))).status).toBe(400);
    sessao.role = "GUARDIAN";
    expect((await autorizar(req("/api/upload/direto", corpo(`classlink/escola1/${UUID}.mp4`)))).status).toBe(403);
    sessao.role = "ADMIN";
    delete process.env.BLOB_STORE_ID;
    expect((await autorizar(req("/api/upload/direto", corpo(`classlink/escola1/${UUID}.mp4`)))).status).toBe(400);
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });
});

describe("confirmação pelo conteúdo real", () => {
  const stream = (bytes: number[]) => new Blob([new Uint8Array(bytes)]).stream();

  it("vídeo MP4 de verdade: devolve o link interno", async () => {
    const mp4 = [0, 0, 0, 0x20, ...Array.from("ftypisom").map((c) => c.charCodeAt(0)), 0, 0, 0, 0];
    blob.get.mockResolvedValue({ statusCode: 200, stream: stream(mp4), blob: { contentType: "video/mp4", size: 16 } });
    const res = await confirmar(req("/api/upload/confirmar", { path: `classlink/escola1/${UUID}.mp4` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mediaType: "video", path: `classlink/escola1/${UUID}.mp4` });
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("conteúdo que não é mídia: apaga e recusa", async () => {
    blob.get.mockResolvedValue({ statusCode: 200, stream: stream(Array(32).fill(0x41)), blob: { contentType: "video/mp4", size: 32 } });
    const res = await confirmar(req("/api/upload/confirmar", { path: `classlink/escola1/${UUID}.mp4` }));
    expect(res.status).toBe(415);
    expect(blob.del).toHaveBeenCalledWith(`classlink/escola1/${UUID}.mp4`);
  });
});
