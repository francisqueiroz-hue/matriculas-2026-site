import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TelaDeErro } from "@/components/TelaDeErro";

describe("TelaDeErro", () => {
  it("mostra título, mensagem e link para o início", () => {
    const html = renderToStaticMarkup(createElement(TelaDeErro, { titulo: "Página não encontrada", mensagem: "Não existe." }));
    expect(html).toContain("Página não encontrada");
    expect(html).toContain("Não existe.");
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain("Tentar de novo");
  });
  it("só mostra 'Tentar de novo' quando há ação, e o código do erro quando existe", () => {
    const html = renderToStaticMarkup(createElement(TelaDeErro, { titulo: "x", mensagem: "y", onTentar: () => {}, codigo: "abc123" }));
    expect(html).toContain("Tentar de novo");
    expect(html).toContain("abc123");
  });
});
