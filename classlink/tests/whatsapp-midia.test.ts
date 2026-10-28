import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobMock = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blobMock);

const prismaMock = vi.hoisted(() => ({
  message: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  user: { update: vi.fn(), findMany: vi.fn() },
  conversation: { findUniqueOrThrow: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@prisma/client", () => ({ Prisma: {} }));
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn(async () => undefined) }));
vi.mock("@/lib/avisos-equipe", () => ({ avisarEquipePorWhatsApp: vi.fn(async () => undefined), registrarAviso: vi.fn(), parametrosModeloAviso: vi.fn() }));
vi.mock("@/lib/permissoes-mensagens", () => ({
  conversaDaFamiliaComGestao: vi.fn(async () => "conv1"),
  exigirPodeConversar: vi.fn(async () => undefined),
  exigirPodeExcluirConversa: vi.fn(),
}));
vi.mock("@/lib/messaging", () => ({ assertConversationParticipant: vi.fn(async () => ({ staffId: "staff1", guardianId: "g1" })) }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn(async () => ({ sub: "staff1", role: "ADMIN", schoolId: "escola1" })) }));
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => void fn() };
});

process.env.JWT_ACCESS_SECRET = "segredo-de-teste-0123456789abcdef";
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teste";

import { avisoAnexoIndisponivel, semLegenda, textoPadraoDaMidia } from "@/lib/anexo-mensagem";
import { getShortSignedMediaUrl } from "@/lib/firebase-storage";
import { conferirLink } from "@/lib/midia-assinada";
import { baixarMidiaDoWhatsApp, corpoDaMidia, guardarMidiaRecebida, midiaDaMensagem, tipoParaGuardar } from "@/lib/whatsapp-midia";
import { POST as webhook } from "@/app/api/webhooks/whatsapp/route";
import { GET as conversa } from "@/app/api/messages/conversations/[id]/route";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

const fotoNoWebhook = { from: "5521987654321", id: "wamid.FOTO", timestamp: "1", type: "image", image: { id: "MID1", mime_type: "image/jpeg", caption: "Febre desde ontem" } };

function respostaMeta(url = "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=MID1", extra: Record<string, unknown> = {}) {
  return { ok: true, status: 200, json: async () => ({ url, mime_type: "image/jpeg", file_size: JPEG.length, id: "MID1", ...extra }) };
}
function respostaArquivo(bytes: Buffer, tipo = "image/jpeg") {
  return { ok: true, status: 200, headers: new Headers({ "content-type": tipo, "content-length": String(bytes.length) }), arrayBuffer: async () => bytes };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.WHATSAPP_API_TOKEN = "token-escola";
  delete process.env.WHATSAPP_API_URL;
});
afterEach(() => vi.unstubAllGlobals());

describe("mídia na mensagem do webhook", () => {
  it("lê foto com legenda e documento com nome; texto não é mídia", () => {
    expect(midiaDaMensagem(fotoNoWebhook)).toEqual({
      tipo: "image",
      mediaId: "MID1",
      mime: "image/jpeg",
      legenda: "Febre desde ontem",
      nomeArquivo: null,
      url: null,
    });
    const doc = midiaDaMensagem({ type: "document", document: { id: "MID2", mime_type: "application/pdf", filename: "atestado.pdf" } });
    expect(doc).toMatchObject({ tipo: "document", nomeArquivo: "atestado.pdf", legenda: null });
    expect(midiaDaMensagem({ type: "text", text: { body: "oi" } })).toBeNull();
    expect(midiaDaMensagem({ type: "image", image: {} })).toBeNull();
  });

  it("corpo é a legenda ou um texto padrão que diz o tipo", () => {
    expect(corpoDaMidia({ tipo: "image", legenda: "Febre desde ontem" })).toBe("Febre desde ontem");
    expect(corpoDaMidia({ tipo: "image", legenda: null })).toBe("📷 Foto recebida pelo WhatsApp");
    expect(corpoDaMidia({ tipo: "audio", legenda: null })).toBe("🎤 Áudio recebido pelo WhatsApp");
    expect(semLegenda(textoPadraoDaMidia("image"), "image")).toBe(true);
    expect(semLegenda("Febre desde ontem", "image")).toBe(false);
    expect(avisoAnexoIndisponivel("image")).toContain("📷 Foto: não foi possível baixar");
  });
});

describe("formato do arquivo guardado", () => {
  it("foto vale pelo conteúdo, não pelo tipo informado", () => {
    expect(tipoParaGuardar("image", JPEG, "image/png")).toEqual({ mime: "image/jpeg", extensao: "jpg" });
    expect(tipoParaGuardar("image", HTML, "image/jpeg")).toBeNull();
  });

  it("áudio e documento só nos formatos da Meta; nada que o navegador execute", () => {
    expect(tipoParaGuardar("audio", HTML, "audio/ogg; codecs=opus")).toEqual({ mime: "audio/ogg", extensao: "ogg" });
    expect(tipoParaGuardar("document", HTML, "application/pdf")).toEqual({ mime: "application/pdf", extensao: "pdf" });
    expect(tipoParaGuardar("document", HTML, "text/html")).toBeNull();
    expect(tipoParaGuardar("document", HTML, "image/svg+xml")).toBeNull();
    expect(tipoParaGuardar("audio", HTML, "application/pdf")).toBeNull();
  });
});

describe("download na Meta", () => {
  it("pede a URL pelo id e baixa com o token da escola", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respostaMeta()).mockResolvedValueOnce(respostaArquivo(JPEG));
    vi.stubGlobal("fetch", fetchMock);
    const { bytes, mime } = await baixarMidiaDoWhatsApp(midiaDaMensagem(fotoNoWebhook)!);
    expect(bytes.equals(JPEG)).toBe(true);
    expect(mime).toBe("image/jpeg");
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.facebook.com/v21.0/MID1");
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer token-escola" });
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: "Bearer token-escola" });
  });

  it("recusa arquivo acima do limite sem baixar", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respostaMeta(undefined, { file_size: 50 * 1024 * 1024 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(baixarMidiaDoWhatsApp(midiaDaMensagem(fotoNoWebhook)!)).rejects.toThrow("grande demais");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("guarda no Blob privado, na pasta da escola, com caminho que o link assinado aceita", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(respostaMeta()).mockResolvedValueOnce(respostaArquivo(JPEG)));
    const guardado = await guardarMidiaRecebida(midiaDaMensagem(fotoNoWebhook)!, "escola1");
    expect(guardado?.mime).toBe("image/jpeg");
    expect(guardado?.caminho).toMatch(/^classlink\/escola1\/whatsapp\/[0-9a-f-]+\.jpg$/);
    expect(blobMock.put).toHaveBeenCalledWith(guardado!.caminho, JPEG, expect.objectContaining({ access: "private", contentType: "image/jpeg" }));
    const link = await getShortSignedMediaUrl(guardado!.caminho);
    expect(conferirLink(new URL(link, "http://t").searchParams)).toBe(guardado!.caminho);
  });

  it("falha no download não derruba: devolve null e registra o motivo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: { message: "token expirado" } }) }));
    await expect(guardarMidiaRecebida(midiaDaMensagem(fotoNoWebhook)!, "escola1")).resolves.toBeNull();
    expect(blobMock.put).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("link curto do anexo", () => {
  it("é o mesmo durante a hora (a tela consulta a cada poucos segundos) e vale ao menos 1 hora", async () => {
    const hora = 60 * 60 * 1000;
    const inicio = 1_800_000_000_000 - (1_800_000_000_000 % hora);
    const a = await getShortSignedMediaUrl("classlink/escola1/whatsapp/x.jpg", inicio + 1_000);
    const b = await getShortSignedMediaUrl("classlink/escola1/whatsapp/x.jpg", inicio + hora - 1_000);
    expect(a).toBe(b);
    const params = new URL(a, "http://t").searchParams;
    expect(conferirLink(params, inicio + hora - 1_000 + hora - 1)).toBe("classlink/escola1/whatsapp/x.jpg");
    expect(conferirLink(params, inicio + 2 * hora + 1)).toBeNull();
  });
});

describe("webhook do WhatsApp com foto da família", () => {
  function requisicao(mensagem: Record<string, unknown>) {
    process.env.WHATSAPP_APP_SECRET = "segredo-app";
    const corpo = JSON.stringify({ entry: [{ changes: [{ field: "messages", value: { messages: [mensagem] } }] }] });
    const assinatura = "sha256=" + createHmac("sha256", "segredo-app").update(corpo).digest("hex");
    return new NextRequest("https://app.escola/api/webhooks/whatsapp", { method: "POST", body: corpo, headers: { "x-hub-signature-256": assinatura } });
  }

  beforeEach(() => {
    prismaMock.message.findUnique.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([{ id: "g1", name: "Ana", phone: "(21) 98765-4321", schoolId: "escola1" }]);
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.message.create.mockResolvedValue({ id: "m1" });
    prismaMock.conversation.findUniqueOrThrow.mockResolvedValue({ id: "conv1", staffId: "staff1" });
  });

  it("baixa a foto e grava a mensagem com o anexo e a legenda", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(respostaMeta()).mockResolvedValueOnce(respostaArquivo(JPEG)));
    const res = await webhook(requisicao(fotoNoWebhook));
    expect(res.status).toBe(200);
    const { data } = prismaMock.message.create.mock.calls[0][0];
    expect(data).toMatchObject({
      conversationId: "conv1",
      senderId: "g1",
      body: "Febre desde ontem",
      channel: "WHATSAPP",
      externalId: "wamid.FOTO",
      anexoTipo: "image",
      anexoMime: "image/jpeg",
      anexoMediaId: "MID1",
    });
    expect(data.anexoCaminho).toMatch(/^classlink\/escola1\/whatsapp\/.+\.jpg$/);
  });

  it("sem conseguir baixar, grava assim mesmo com tipo, legenda e id da mídia (para nova tentativa)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const res = await webhook(requisicao({ ...fotoNoWebhook, image: { id: "MID1", mime_type: "image/jpeg" } }));
    expect(res.status).toBe(200);
    const { data } = prismaMock.message.create.mock.calls[0][0];
    expect(data).toMatchObject({ body: "📷 Foto recebida pelo WhatsApp", anexoTipo: "image", anexoCaminho: null, anexoMediaId: "MID1" });
  });

  it("localização (sem suporte) diz o que chegou, sem mandar abrir outro aplicativo", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await webhook(requisicao({ from: "5521987654321", id: "wamid.LOC", timestamp: "1", type: "location", location: { latitude: 1, longitude: 2 } }));
    const { data } = prismaMock.message.create.mock.calls[0][0];
    expect(data.body).toContain("enviou uma localização");
    expect(data.anexoTipo).toBeUndefined();
  });
});

describe("conversa entrega o anexo à tela", () => {
  const base = { conversationId: "conv1", channel: "WHATSAPP", externalId: "w", createdAt: new Date(), readAt: null, sender: { id: "g1", name: "Ana", role: "GUARDIAN" } };

  it("com link assinado para quem participa, sem expor caminho nem id da Meta", async () => {
    prismaMock.conversation.findUniqueOrThrow.mockResolvedValue({
      id: "conv1",
      staffId: "staff1",
      guardianId: "g1",
      staff: { id: "staff1", name: "Direção", role: "ADMIN" },
      guardian: { id: "g1", name: "Ana", phone: null, email: null, whatsappUltimaMensagemEm: null },
    });
    prismaMock.message.findMany.mockResolvedValue([
      { ...base, id: "m1", senderId: "g1", body: "Febre", anexoTipo: "image", anexoMime: "image/jpeg", anexoNome: null, anexoCaminho: "classlink/escola1/whatsapp/a.jpg", anexoMediaId: "MID1" },
      { ...base, id: "m2", senderId: "g1", body: "📷 Foto recebida pelo WhatsApp", anexoTipo: "image", anexoMime: "image/jpeg", anexoNome: null, anexoCaminho: null, anexoMediaId: "MID2" },
      { ...base, id: "m3", senderId: "g1", body: "oi", anexoTipo: null, anexoMime: null, anexoNome: null, anexoCaminho: null, anexoMediaId: null },
    ]);
    prismaMock.message.updateMany.mockResolvedValue({});

    const res = await conversa(new NextRequest("https://app.escola/api/messages/conversations/conv1"), { params: Promise.resolve({ id: "conv1" }) });
    const json = await res.json();
    const [comFoto, semArquivo, texto] = json.messages;
    expect(conferirLink(new URL(comFoto.anexo.url, "http://t").searchParams)).toBe("classlink/escola1/whatsapp/a.jpg");
    expect(comFoto.anexo).toMatchObject({ tipo: "image", mime: "image/jpeg" });
    expect(semArquivo.anexo).toEqual({ tipo: "image", mime: "image/jpeg", nome: null, url: null });
    expect(texto.anexo).toBeNull();
    expect(JSON.stringify(json)).not.toContain("MID1");
    expect(comFoto.anexoCaminho).toBeUndefined();
  });
});
