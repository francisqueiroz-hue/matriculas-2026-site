// @vitest-environment jsdom
import { NextRequest } from "next/server";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  post: { create: vi.fn(), findMany: vi.fn() },
  user: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/visibilidade-server", () => ({ exigirArea: async () => {} }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ sub: "u1", role: "ADMIN", schoolId: "escola1" })),
  requireRole: vi.fn(async () => ({ sub: "u1", role: "ADMIN", schoolId: "escola1" })),
  ehGestaoDaSessao: vi.fn(async () => true),
  exigirPodePublicar: vi.fn(async () => {}),
  AuthError: class extends Error {},
}));
vi.mock("@prisma/client", () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
vi.mock("@/lib/firebase-storage", () => ({ getSignedMediaUrl: vi.fn(async (p: string) => `https://assinado/${p}`) }));
vi.mock("@/lib/push", () => ({ notifyUsers: vi.fn(async () => {}) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));

import { POST } from "@/app/api/posts/route";
import { caminhoDeMidiaDaEscola, MAX_PAGINAS_PDF, tipoDoAnexo, validarMidiaDoAviso } from "@/lib/midia-aviso";
import { escalaDaPagina, mensagemErroPdf, nomeDaPagina } from "@/lib/pdf-para-imagens";
import { MidiaDoAviso, PAGINAS_VISIVEIS } from "@/components/MidiaDoAviso";
import { cartaoBemVisivel } from "@/components/PostCard";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const img = (n: number, escola = "escola1", ext = "jpeg") => `classlink/${escola}/${uuid(n)}.${ext}`;

afterEach(cleanup);

describe("anexo do aviso: tipo e tamanho na escolha do arquivo", () => {
  it("aceita foto, vídeo e PDF; recusa o resto com mensagem clara", () => {
    expect(tipoDoAnexo({ type: "image/jpeg", name: "a.jpg", size: 1 })).toBe("image");
    expect(tipoDoAnexo({ type: "video/quicktime", name: "a.mov", size: 1 })).toBe("video");
    expect(tipoDoAnexo({ type: "application/pdf", name: "a.pdf", size: 1 })).toBe("pdf");
    // Alguns Androids não informam o tipo do PDF: vale a extensão.
    expect(tipoDoAnexo({ type: "", name: "Circular.PDF", size: 1 })).toBe("pdf");
    expect(tipoDoAnexo({ type: "image/heic", name: "a.heic", size: 1 })).toEqual({ erro: expect.stringContaining("JPG, PNG ou WEBP") });
    expect(tipoDoAnexo({ type: "application/msword", name: "a.doc", size: 1 })).toEqual({ erro: expect.stringContaining("PDF") });
  });

  it("recusa vídeo acima de 50 MB e PDF acima de 20 MB antes de enviar", () => {
    expect(tipoDoAnexo({ type: "video/mp4", name: "v.mp4", size: 51 * 1024 * 1024 })).toEqual({ erro: expect.stringContaining("50 MB") });
    expect(tipoDoAnexo({ type: "application/pdf", name: "c.pdf", size: 21 * 1024 * 1024 })).toEqual({ erro: expect.stringContaining("20 MB") });
  });
});

describe("validarMidiaDoAviso (servidor)", () => {
  it("só aceita arquivos da própria escola e do tipo certo", () => {
    expect(caminhoDeMidiaDaEscola(img(1), "escola1", "image")).toBe(true);
    expect(caminhoDeMidiaDaEscola(img(1, "outra"), "escola1", "image")).toBe(false);
    expect(caminhoDeMidiaDaEscola(img(1, "escola1", "mp4"), "escola1", "image")).toBe(false);
    expect(caminhoDeMidiaDaEscola(`classlink/escola1/../outra/${uuid(1)}.jpg`, "escola1", "image")).toBe(false);
    expect(caminhoDeMidiaDaEscola(img(1, "escola1", "mov"), "escola1", "video")).toBe(true);
  });

  it("PDF: 1ª página vira a mídia principal; limite de páginas; sem repetição", () => {
    const paginas = [img(1), img(2), img(3)];
    expect(validarMidiaDoAviso({ mediaType: "pdf", mediaPaginas: paginas, mediaNome: " Circular.pdf " }, "escola1")).toEqual({
      mediaUrl: img(1),
      mediaType: "pdf",
      mediaPaginas: paginas,
      mediaNome: "Circular.pdf",
    });
    const muitas = Array.from({ length: MAX_PAGINAS_PDF + 1 }, (_, i) => img(i + 1));
    expect(() => validarMidiaDoAviso({ mediaType: "pdf", mediaPaginas: muitas }, "escola1")).toThrow(/no máximo 10/);
    expect(() => validarMidiaDoAviso({ mediaType: "pdf", mediaPaginas: [img(1), img(1)] }, "escola1")).toThrow();
    expect(() => validarMidiaDoAviso({ mediaType: "pdf", mediaPaginas: [] }, "escola1")).toThrow();
    expect(() => validarMidiaDoAviso({ mediaType: "pdf", mediaPaginas: [img(1, "outra")] }, "escola1")).toThrow();
  });

  it("foto/vídeo continuam como antes; sem anexo, tudo vazio", () => {
    expect(validarMidiaDoAviso({ mediaType: "image", mediaUrl: img(1) }, "escola1").mediaUrl).toBe(img(1));
    expect(() => validarMidiaDoAviso({ mediaType: "video", mediaUrl: img(1) }, "escola1")).toThrow();
    expect(() => validarMidiaDoAviso({ mediaUrl: img(1) }, "escola1")).toThrow();
    expect(validarMidiaDoAviso({}, "escola1")).toEqual({ mediaUrl: null, mediaType: null, mediaPaginas: [], mediaNome: null });
  });
});

describe("POST /api/posts com PDF", () => {
  beforeEach(() => {
    prismaMock.post.create.mockReset();
    prismaMock.post.create.mockImplementation(async ({ data }) => ({ id: "p1", ...data, author: { id: "u1", name: "D", role: "ADMIN" }, class: null }));
  });
  const enviar = (corpo: object) =>
    POST(new NextRequest("http://t/api/posts", { method: "POST", body: JSON.stringify({ title: "Circular", body: "Segue", audience: "SCHOOL", ...corpo }) }));

  it("grava as páginas e devolve links assinados de todas", async () => {
    const res = await enviar({ mediaType: "pdf", mediaPaginas: [img(1), img(2)], mediaNome: "Circular.pdf", mediaUrl: img(9, "outra") });
    expect(res.status).toBe(201);
    const data = prismaMock.post.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ mediaUrl: img(1), mediaType: "pdf", mediaPaginas: [img(1), img(2)], mediaNome: "Circular.pdf" });
    const { post } = await res.json();
    expect(post.mediaPaginas).toEqual([`https://assinado/${img(1)}`, `https://assinado/${img(2)}`]);
    expect(post.mediaUrl).toBe(`https://assinado/${img(1)}`);
  });

  it("recusa arquivo de outra escola", async () => {
    const res = await enviar({ mediaType: "image", mediaUrl: img(1, "outra") });
    expect(res.status).toBe(400);
    expect(prismaMock.post.create).not.toHaveBeenCalled();
  });
});

describe("conversão do PDF (regras puras)", () => {
  it("página A4 vira ~1600 px de largura, sem passar do limite de pixels do iPhone", () => {
    const e = escalaDaPagina(595, 842);
    expect(Math.round(595 * e)).toBe(1600);
    const faixa = escalaDaPagina(595, 5000); // página muito comprida
    expect(595 * 5000 * faixa * faixa).toBeLessThanOrEqual(1600 * 2600 + 1);
    expect(escalaDaPagina(0, 0)).toBe(1);
  });

  it("mensagens claras para PDF com senha, corrompido ou grande demais", () => {
    expect(mensagemErroPdf({ name: "PasswordException" })).toMatch(/senha/);
    expect(mensagemErroPdf({ name: "InvalidPDFException" })).toMatch(/não é um PDF válido/);
    expect(mensagemErroPdf(new Error("O PDF tem 14 páginas e o limite do Mural é 10."))).toMatch(/14 páginas/);
    expect(mensagemErroPdf(new Error("x"))).toMatch(/Não foi possível converter/);
    expect(nomeDaPagina("Circular / Festa.pdf", 2)).toBe("Circular  Festa-pagina-2.jpg");
  });
});

describe("cartão do mural: imagem grande, ampliar ao tocar, páginas do PDF", () => {
  it("foto: botão de ampliar abre a tela cheia e fecha com Esc", () => {
    render(createElement(MidiaDoAviso, { titulo: "Festa", mediaUrl: "https://x/1.jpg", mediaType: "image" }));
    fireEvent.click(screen.getByRole("button", { name: /Foto do aviso: Festa. Toque para ampliar/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("PDF: mostra as primeiras páginas, expande as outras e navega na ampliação", () => {
    const paginas = ["https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg", "https://x/4.jpg"];
    render(createElement(MidiaDoAviso, { titulo: "Circular", mediaUrl: paginas[0], mediaType: "pdf", mediaPaginas: paginas, mediaNome: "Circular.pdf" }));
    expect(screen.getByText(/Circular.pdf · 4 páginas/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Toque para ampliar/ })).toHaveLength(PAGINAS_VISIVEIS);
    fireEvent.click(screen.getByRole("button", { name: "Ver as outras 2 páginas" }));
    expect(screen.getAllByRole("button", { name: /Toque para ampliar/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /Página 2 de 4/ }));
    expect(screen.getByText("Página 2 de 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(screen.getByText("Página 3 de 4")).toBeTruthy();
  });

  it("vídeo toca dentro da página no iPhone (playsInline)", () => {
    const { container } = render(createElement(MidiaDoAviso, { titulo: "Passeio", mediaUrl: "https://x/v.mp4", mediaType: "video" }));
    const video = container.querySelector("video")!;
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
  });

  it("leitura: cartão mais alto que a tela conta quando ocupa metade da tela", () => {
    expect(cartaoBemVisivel({ intersectionRatio: 0.3, intersectionRect: { height: 700 } }, 900)).toBe(true);
    expect(cartaoBemVisivel({ intersectionRatio: 0.3, intersectionRect: { height: 200 } }, 900)).toBe(false);
    expect(cartaoBemVisivel({ intersectionRatio: 0.6, intersectionRect: { height: 200 } }, 900)).toBe(true);
  });
});
