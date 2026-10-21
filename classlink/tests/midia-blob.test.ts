import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const blobMock = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blobMock);

process.env.JWT_ACCESS_SECRET = "segredo-de-teste-0123456789abcdef";

import { conferirLink, linkAssinado } from "@/lib/midia-assinada";
import { GET as midia } from "@/app/api/midia/route";

const CAMINHO = "classlink/escola1/abc-123.png";
const params = (url: string) => new URL(url, "http://t").searchParams;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("link assinado de mídia", () => {
  it("vale até a validade e só para o mesmo arquivo", () => {
    const agora = 1_000_000;
    const link = linkAssinado(CAMINHO, 60_000, agora);
    expect(conferirLink(params(link), agora + 59_000)).toBe(CAMINHO);
    expect(conferirLink(params(link), agora + 61_000)).toBeNull();
    const trocado = link.replace(encodeURIComponent(CAMINHO), encodeURIComponent("classlink/escola2/abc-123.png"));
    expect(conferirLink(params(trocado), agora)).toBeNull();
  });

  it("recusa caminho fora das pastas do app e assinatura adulterada", () => {
    const agora = 1_000_000;
    expect(conferirLink(params(linkAssinado("../segredos.txt", 60_000, agora)), agora)).toBeNull();
    expect(conferirLink(params(linkAssinado("classlink/x/../../y.png", 60_000, agora)), agora)).toBeNull();
    const link = linkAssinado(CAMINHO, 60_000, agora);
    expect(conferirLink(params(link.replace(/s=[^&]+/, "s=AAAA")), agora)).toBeNull();
  });
});

describe("rota /api/midia", () => {
  it("entrega o arquivo privado com link válido", async () => {
    blobMock.get.mockResolvedValue({
      statusCode: 200,
      stream: new Blob(["png"]).stream(),
      headers: new Headers(),
      blob: { contentType: "image/png", size: 3 },
    });
    const res = await midia(new NextRequest(`http://t${linkAssinado(CAMINHO, 60_000)}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(blobMock.get).toHaveBeenCalledWith(CAMINHO, { access: "private" });
    expect(await res.text()).toBe("png");
  });

  it("sem assinatura válida: 403 e nem consulta o Blob", async () => {
    const res = await midia(new NextRequest(`http://t/api/midia?p=${encodeURIComponent(CAMINHO)}&e=9999999999999&s=x`));
    expect(res.status).toBe(403);
    expect(blobMock.get).not.toHaveBeenCalled();
  });

  it("arquivo inexistente: 404", async () => {
    blobMock.get.mockResolvedValue(null);
    expect((await midia(new NextRequest(`http://t${linkAssinado(CAMINHO, 60_000)}`))).status).toBe(404);
  });
});

describe("provedor de mídia", () => {
  it("com Blob conectado, grava privado no Blob e devolve link interno", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teste";
    vi.resetModules();
    const { uploadMedia, getSignedMediaUrl, provedorDeMidia } = await import("@/lib/firebase-storage");
    expect(provedorDeMidia()).toBe("blob");
    const r = await uploadMedia(Buffer.from("x"), "image", "classlink/escola1", "image/png");
    expect(r.path).toMatch(/^classlink\/escola1\/[0-9a-f-]+\.png$/);
    expect(blobMock.put).toHaveBeenCalledWith(r.path, expect.any(Buffer), { access: "private", contentType: "image/png", addRandomSuffix: false });
    expect(await getSignedMediaUrl(r.path)).toMatch(/^\/api\/midia\?p=/);
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
});
