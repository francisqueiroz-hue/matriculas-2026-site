import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Arquivos na aba Mensagens (declarações, documentos): família ↔ direção/coordenação, guardados
// no armazenamento privado e conferidos pelo conteúdo real.

vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: vi.fn() }));

const blob = vi.hoisted(() => ({ issueSignedToken: vi.fn(async () => "token"), get: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
const cliente = vi.hoisted(() => ({ handleUploadPresigned: vi.fn() }));
vi.mock("@vercel/blob/client", () => cliente);

const prismaMock = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn() },
  conversation: { delete: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
const sessao = vi.hoisted(() => ({ sub: "g1", role: "GUARDIAN", schoolId: "s1" }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => sessao),
  AuthError: class AuthError extends Error {
    constructor(
      m: string,
      readonly status = 401,
    ) {
      super(m);
    }
  },
}));
const participante = vi.hoisted(() => vi.fn());
vi.mock("@/lib/messaging", () => ({ assertConversationParticipant: participante }));
vi.mock("@/lib/permissoes-mensagens", () => ({ exigirPodeConversar: vi.fn(), exigirPodeExcluirConversa: vi.fn() }));
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn() }));
vi.mock("@/lib/avisos-equipe", () => ({ avisarEquipePorWhatsApp: vi.fn(), parametrosModeloAviso: vi.fn(), registrarAviso: vi.fn() }));
vi.mock("@/lib/whatsapp-modelos", () => ({ modeloDisponivel: vi.fn() }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmailMessage: vi.fn() }));
const enviarWhats = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp", () => ({
  isWhatsAppConfigured: () => true,
  normalizePhoneBR: (p: string) => p,
  sendWhatsAppTextMessage: enviarWhats,
  sendWhatsAppTemplateMessage: vi.fn(),
}));
vi.mock("@/lib/erros-servidor", () => ({ registrarErroServidor: vi.fn() }));

import {
  ANEXO_LIMITE_ENVIO_SERVIDOR,
  caminhoAnexoValido,
  detectarTipoAnexo,
  nomeAnexoSeguro,
  problemaNoAnexo,
  textoPadraoDoArquivo,
} from "@/lib/anexo-envio";
import { semLegenda } from "@/lib/anexo-mensagem";
import { DELETE, POST } from "@/app/api/messages/conversations/[id]/route";
import { POST as autorizar } from "@/app/api/messages/conversations/[id]/anexo/route";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const ctx = (id = "c1") => ({ params: Promise.resolve({ id }) }) as never;
const PDF = new TextEncoder().encode("%PDF-1.7\n%conteudo");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1]);
const EXE = new TextEncoder().encode("MZ\x90\x00 executavel qualquer");

function multipart(campos: Record<string, string | File>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.append(k, v);
  return new NextRequest("http://t/api/messages/conversations/c1", { method: "POST", body: form });
}
const json = (corpo: unknown, url = "http://t/api/messages/conversations/c1") =>
  new NextRequest(url, { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } });

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
  process.env.BLOB_STORE_ID = "store_test";
  process.env.JWT_ACCESS_SECRET = "segredo-de-teste";
  Object.assign(sessao, { sub: "g1", role: "GUARDIAN", schoolId: "s1" });
  participante.mockResolvedValue({ staffId: "staff1", guardianId: "g1" });
  prismaMock.message.create.mockImplementation(async ({ data }) => ({ id: "m1", ...data, sender: { id: data.senderId, name: "Maria", role: "GUARDIAN" } }));
});

describe("regras do arquivo", () => {
  it("reconhece PDF e fotos pelo conteúdo, recusa o resto", () => {
    expect(detectarTipoAnexo(PDF)).toEqual({ tipo: "document", mime: "application/pdf", extensao: "pdf" });
    expect(detectarTipoAnexo(JPEG)?.tipo).toBe("image");
    expect(detectarTipoAnexo(EXE)).toBeNull();
  });

  it("caminho só da escola e da conversa certas", () => {
    expect(caminhoAnexoValido(`classlink/s1/mensagens/c1/${UUID}.pdf`, "s1", "c1")).toBe(true);
    expect(caminhoAnexoValido(`classlink/s1/mensagens/c2/${UUID}.pdf`, "s1", "c1")).toBe(false);
    expect(caminhoAnexoValido(`classlink/s2/mensagens/c1/${UUID}.pdf`, "s1", "c1")).toBe(false);
    expect(caminhoAnexoValido(`classlink/s1/mensagens/c1/${UUID}.exe`, "s1", "c1")).toBe(false);
    expect(caminhoAnexoValido(`classlink/s1/mensagens/c1/../x/${UUID}.pdf`, "s1", "c1")).toBe(false);
  });

  it("nome seguro e conferência no navegador", () => {
    expect(nomeAnexoSeguro('C:\\docs\\"declaração"\r\n.pdf', "pdf")).toBe("declaração .pdf");
    expect(nomeAnexoSeguro("", "jpg")).toBe("arquivo.jpg");
    expect(problemaNoAnexo({ type: "application/zip", size: 10, name: "a.zip" })).toMatch(/PDF/);
    expect(problemaNoAnexo({ type: "application/pdf", size: 21 * 1024 * 1024, name: "a.pdf" })).toMatch(/20 MB/);
    expect(problemaNoAnexo({ type: "", size: 10, name: "foto.JPG" })).toBeNull();
  });

  it("mensagem só com arquivo não repete o texto padrão na tela", () => {
    expect(semLegenda(textoPadraoDoArquivo("document"), "document")).toBe(true);
    expect(semLegenda("Segue a declaração", "document")).toBe(false);
  });
});

describe("família envia arquivo pela conversa", () => {
  it("PDF até 4 MB: guardado em pasta privada da conversa e gravado na mensagem", async () => {
    const res = await POST(multipart({ body: "Segue o atestado", file: new File([PDF], "atestado.pdf", { type: "application/pdf" }) }), ctx());
    expect(res.status).toBe(201);
    expect(blob.put).toHaveBeenCalledTimes(1);
    const [caminho, , opcoes] = blob.put.mock.calls[0];
    expect(caminho).toMatch(new RegExp(`^classlink/s1/mensagens/c1/[0-9a-f-]{36}\\.pdf$`));
    expect(opcoes.access).toBe("private");
    const data = prismaMock.message.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ body: "Segue o atestado", channel: "APP", anexoTipo: "document", anexoMime: "application/pdf", anexoNome: "atestado.pdf", anexoCaminho: caminho });
    const corpo = await res.json();
    expect(corpo.message.anexo.url).toMatch(/^\/api\/midia\?/); // link assinado, nunca o caminho
    expect(corpo.message.anexoCaminho).toBeUndefined();
  });

  it("sem texto: usa o texto padrão do arquivo", async () => {
    await POST(multipart({ body: "", file: new File([JPEG], "doc.jpg", { type: "image/jpeg" }) }), ctx());
    expect(prismaMock.message.create.mock.calls[0][0].data.body).toBe(textoPadraoDoArquivo("image"));
  });

  it("arquivo disfarçado (tipo diz PDF, conteúdo não é): 415 e nada é guardado", async () => {
    const res = await POST(multipart({ file: new File([EXE], "declaracao.pdf", { type: "application/pdf" }) }), ctx());
    expect(res.status).toBe(415);
    expect(blob.put).not.toHaveBeenCalled();
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("arquivo acima de 4 MB pelo formulário: recusado sem ler", async () => {
    const grande = new Uint8Array(ANEXO_LIMITE_ENVIO_SERVIDOR + 10);
    grande.set(PDF);
    const res = await POST(multipart({ file: new File([grande], "g.pdf", { type: "application/pdf" }) }), ctx());
    expect(res.status).toBe(413);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("sem texto e sem arquivo: 400", async () => {
    const res = await POST(json({ body: "  " }), ctx());
    expect(res.status).toBe(400);
  });

  it("quem não participa da conversa não envia", async () => {
    const { AuthError } = await import("@/lib/session");
    participante.mockRejectedValue(new AuthError("Conversa não encontrada", 404));
    const res = await POST(multipart({ file: new File([PDF], "a.pdf", { type: "application/pdf" }) }), ctx());
    expect(res.status).toBe(404);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("falha ao gravar a mensagem: o arquivo não fica solto no armazenamento", async () => {
    prismaMock.message.create.mockRejectedValue(new Error("banco fora"));
    const res = await POST(multipart({ file: new File([PDF], "a.pdf", { type: "application/pdf" }) }), ctx());
    expect(res.status).toBe(500);
    expect(blob.del).toHaveBeenCalledWith(blob.put.mock.calls[0][0]);
  });
});

describe("arquivo grande enviado direto ao armazenamento", () => {
  const caminho = `classlink/s1/mensagens/c1/${UUID}.pdf`;

  it("PDF conferido pelo conteúdo e gravado", async () => {
    noBlob(PDF);
    const res = await POST(json({ body: "", anexo: { path: caminho, nome: "declaração escolar.pdf" } }), ctx());
    expect(res.status).toBe(201);
    expect(prismaMock.message.create.mock.calls[0][0].data).toMatchObject({ anexoCaminho: caminho, anexoNome: "declaração escolar.pdf", anexoTipo: "document" });
  });

  it("caminho de outra conversa: 400, nada lido", async () => {
    const res = await POST(json({ anexo: { path: `classlink/s1/mensagens/c9/${UUID}.pdf` } }), ctx());
    expect(res.status).toBe(400);
    expect(blob.get).not.toHaveBeenCalled();
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("conteúdo que não é PDF: apagado e recusado", async () => {
    noBlob(EXE);
    const res = await POST(json({ anexo: { path: caminho } }), ctx());
    expect(res.status).toBe(415);
    expect(blob.del).toHaveBeenCalledWith(caminho);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("autorização do envio: só para quem participa e só caminhos desta conversa", async () => {
    cliente.handleUploadPresigned.mockImplementation(async ({ getSignedToken }) => getSignedToken(`classlink/s1/mensagens/c1/${UUID}.pdf`));
    const ok = await autorizar(json({}, "http://t/api/messages/conversations/c1/anexo"), ctx());
    expect(ok.status).toBe(200);
    expect(blob.issueSignedToken).toHaveBeenCalledWith(expect.objectContaining({ maximumSizeInBytes: 20 * 1024 * 1024, operations: ["put"] }));

    cliente.handleUploadPresigned.mockImplementation(async ({ getSignedToken }) => getSignedToken(`classlink/s1/mensagens/outra/${UUID}.pdf`));
    const outra = await autorizar(json({}, "http://t/api/messages/conversations/c1/anexo"), ctx());
    expect(outra.status).toBe(400);

    const { AuthError } = await import("@/lib/session");
    participante.mockRejectedValue(new AuthError("Conversa não encontrada", 404));
    const estranho = await autorizar(json({}, "http://t/api/messages/conversations/c1/anexo"), ctx());
    expect(estranho.status).toBe(404);
  });
});

describe("direção envia a declaração para a família", () => {
  it("com arquivo, o canal é sempre o ClassLink (nada sai pelo WhatsApp)", async () => {
    Object.assign(sessao, { sub: "staff1", role: "ADMIN" });
    const form = { body: "Segue a declaração solicitada", channel: "WHATSAPP", file: new File([PDF], "declaracao.pdf", { type: "application/pdf" }) };
    const res = await POST(multipart(form), ctx());
    expect(res.status).toBe(201);
    expect(enviarWhats).not.toHaveBeenCalled();
    expect(prismaMock.message.create.mock.calls[0][0].data.channel).toBe("APP");
  });

  it("excluir a conversa apaga os arquivos dela", async () => {
    const { after } = await import("next/server");
    Object.assign(sessao, { sub: "staff1", role: "ADMIN" });
    prismaMock.message.findMany.mockResolvedValue([{ anexoCaminho: "classlink/s1/mensagens/c1/a.pdf" }]);
    const res = await DELETE(new NextRequest("http://t/x", { method: "DELETE" }), ctx());
    expect(res.status).toBe(200);
    expect(prismaMock.conversation.delete).toHaveBeenCalled();
    await (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)();
    expect(blob.del).toHaveBeenCalledWith(["classlink/s1/mensagens/c1/a.pdf"]);
  });
});
