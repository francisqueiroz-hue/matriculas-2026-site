// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exportar o contrato em PDF: o arquivo vem pela sessão do app (renova sozinho), é conferido
// pelos bytes e pode ser salvo, aberto ou enviado pelo menu de compartilhar do celular.

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch }));

import { PdfErro, compartilharArquivo, obterPdf, pareceComPdf, podeCompartilharArquivos } from "@/lib/pdf-client";
import { AcoesPdf } from "@/components/AcoesPdf";
import { textoEnvioPdf } from "@/lib/contratos";

const BYTES_PDF = new TextEncoder().encode("%PDF-1.7\nconteudo\n%%EOF");
const respostaPdf = () => new Response(BYTES_PDF, { status: 200, headers: { "Content-Type": "application/pdf" } });
const respostaJson = (status: number, corpo: object) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

const classes = { classePrimario: "p", classeSecundario: "s" };

function definirNavegador(share?: (d: ShareData) => Promise<void>, canShare?: (d: ShareData) => boolean) {
  Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true, writable: true });
}

let criados: Blob[];
let cliques: { href: string; download: string }[];

beforeEach(() => {
  apiFetch.mockReset();
  criados = [];
  cliques = [];
  URL.createObjectURL = vi.fn((b: Blob) => {
    criados.push(b);
    return `blob:teste/${criados.length}`;
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    cliques.push({ href: this.href, download: this.download });
  });
  definirNavegador(undefined, undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("obterPdf", () => {
  it("devolve o PDF com o nome pedido, buscado pela sessão do app (sem cache)", async () => {
    apiFetch.mockResolvedValue(respostaPdf());
    const f = await obterPdf("/api/contratos/c1/arquivos/a1", "Contrato 2027 - Ana.pdf");
    expect(apiFetch).toHaveBeenCalledWith("/api/contratos/c1/arquivos/a1", { cache: "no-store" });
    expect(f.name).toBe("Contrato 2027 - Ana.pdf");
    expect(f.type).toBe("application/pdf");
    expect(Array.from(new Uint8Array(await f.arrayBuffer()))).toEqual(Array.from(BYTES_PDF));
  });

  it("sessão vencida de vez: explica em vez de salvar um arquivo de erro", async () => {
    apiFetch.mockResolvedValue(respostaJson(401, { error: "Não autenticado" }));
    await expect(obterPdf("/x", "c.pdf")).rejects.toThrow(/sessão expirou/);
  });

  it("repassa a mensagem do servidor (ex.: arquivo não encontrado)", async () => {
    apiFetch.mockResolvedValue(respostaJson(404, { error: "Arquivo não encontrado" }));
    await expect(obterPdf("/x", "c.pdf")).rejects.toThrow("Arquivo não encontrado");
  });

  it("recusa resposta 200 que não é PDF", async () => {
    apiFetch.mockResolvedValue(new Response("<html>login</html>", { status: 200 }));
    await expect(obterPdf("/x", "c.pdf")).rejects.toBeInstanceOf(PdfErro);
  });

  it("sem internet: mensagem clara", async () => {
    apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(obterPdf("/x", "c.pdf")).rejects.toThrow(/internet/);
  });

  it("pareceComPdf aceita o cabeçalho depois de alguns bytes e recusa JSON", () => {
    expect(pareceComPdf(new TextEncoder().encode("\n\n%PDF-1.4"))).toBe(true);
    expect(pareceComPdf(new TextEncoder().encode('{"error":"x"}'))).toBe(false);
  });
});

describe("compartilhar", () => {
  it("só oferece compartilhar quando o aparelho aceita arquivos", () => {
    expect(podeCompartilharArquivos()).toBe(false);
    definirNavegador(async () => undefined, () => false);
    expect(podeCompartilharArquivos()).toBe(false);
    definirNavegador(async () => undefined, () => true);
    expect(podeCompartilharArquivos()).toBe(true);
  });

  it("cancelar o menu não é erro; Safari sem toque recente pede um segundo toque", async () => {
    const f = new File([BYTES_PDF], "c.pdf", { type: "application/pdf" });
    definirNavegador(async () => {
      throw new DOMException("x", "AbortError");
    }, () => true);
    expect(await compartilharArquivo(f, "Contrato")).toBe("cancelado");
    definirNavegador(async () => {
      throw new DOMException("x", "NotAllowedError");
    }, () => true);
    expect(await compartilharArquivo(f, "Contrato")).toBe("toque-de-novo");
    definirNavegador(async () => {
      throw new DOMException("x", "DataError");
    }, () => true);
    await expect(compartilharArquivo(f, "Contrato")).rejects.toThrow(/Baixar PDF/);
  });
});

describe("AcoesPdf", () => {
  it("Baixar salva o PDF com o nome do contrato", async () => {
    apiFetch.mockResolvedValue(respostaPdf());
    render(createElement(AcoesPdf, { url: "/api/contratos/c1/arquivos/a1", nome: "Contrato 2027 - Ana.pdf", tituloCompartilhar: "Contrato", ...classes }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));
    });
    expect(cliques).toEqual([{ href: "blob:teste/1", download: "Contrato 2027 - Ana.pdf" }]);
    expect(criados[0].type).toBe("application/pdf");
  });

  it("com carregarAntes, o PDF já está pronto e o menu de compartilhar abre no mesmo toque", async () => {
    apiFetch.mockResolvedValue(respostaPdf());
    const share = vi.fn(async () => undefined);
    definirNavegador(share, () => true);
    render(
      createElement(AcoesPdf, {
        url: "/api/contratos/c1/arquivos/a1",
        nome: "Contrato.pdf",
        carregarAntes: true,
        tituloCompartilhar: "Contrato 2027",
        textoCompartilhar: "Segue o contrato",
        rotuloCompartilhar: "Salvar ou enviar o PDF",
        ...classes,
      }),
    );
    await act(async () => undefined); // termina o carregamento antecipado
    expect(apiFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar ou enviar o PDF" }));
    });
    expect(apiFetch).toHaveBeenCalledTimes(1); // não baixou de novo
    expect(share).toHaveBeenCalledTimes(1);
    const dados = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(dados.title).toBe("Contrato 2027");
    expect(dados.text).toBe("Segue o contrato");
    expect(dados.files?.[0].name).toBe("Contrato.pdf");
  });

  it("sem suporte a arquivos, não mostra o botão de compartilhar", () => {
    render(createElement(AcoesPdf, { url: "/x", nome: "c.pdf", tituloCompartilhar: "C", ...classes }));
    expect(screen.queryByRole("button", { name: /Enviar PDF/ })).toBeNull();
  });

  it("mostra o erro e deixa tentar de novo", async () => {
    apiFetch.mockResolvedValueOnce(respostaJson(404, { error: "Arquivo não encontrado" })).mockResolvedValueOnce(respostaPdf());
    render(createElement(AcoesPdf, { url: "/x", nome: "c.pdf", tituloCompartilhar: "C", ...classes }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Arquivo não encontrado");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(cliques).toHaveLength(1);
  });

  it("aba nova bloqueada: baixa o PDF e avisa", async () => {
    apiFetch.mockResolvedValue(respostaPdf());
    vi.spyOn(window, "open").mockReturnValue(null);
    render(createElement(AcoesPdf, { url: "/x", nome: "c.pdf", tituloCompartilhar: "C", ...classes }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Abrir PDF" }));
    });
    expect(cliques).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toMatch(/foi baixado/);
  });

  it("contrato gerado de novo (outro arquivo): busca o PDF novo", async () => {
    apiFetch.mockImplementation(async () => respostaPdf());
    const props = { nome: "c.pdf", carregarAntes: true, tituloCompartilhar: "C", ...classes };
    const { rerender } = render(createElement(AcoesPdf, { ...props, url: "/api/contratos/c1/arquivos/a1" }));
    await act(async () => undefined);
    rerender(createElement(AcoesPdf, { ...props, url: "/api/contratos/c1/arquivos/a2" }));
    await act(async () => undefined);
    expect(apiFetch.mock.calls.map((c) => c[0])).toEqual(["/api/contratos/c1/arquivos/a1", "/api/contratos/c1/arquivos/a2"]);
  });
});

describe("textoEnvioPdf", () => {
  it("usa o primeiro nome e aponta o gov.br e o app", () => {
    const t = textoEnvioPdf("  Ana Beatriz Souza ");
    expect(t).toMatch(/^Segue o contrato de matrícula de Ana em PDF\./);
    expect(t).toContain("https://assinador.iti.br");
    expect(t).toContain("menu Contratos");
  });
});
