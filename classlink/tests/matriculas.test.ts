import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { CLASSLINK_URL, toClassLinkPage } from "@/lib/matriculas-page";
import { linkWhatsAppRematricula, mensagemRematricula } from "@/lib/rematricula";

const root = path.join(__dirname, "..");

describe("página de matrículas dentro do ClassLink", () => {
  it("public/matriculas.html está em sincronia com site/index.html (rode npm run sync:matriculas)", () => {
    const site = readFileSync(path.join(root, "../site/index.html"), "utf8");
    const gerado = readFileSync(path.join(root, "public/matriculas.html"), "utf8");
    expect(gerado).toBe(toClassLinkPage(site));
  });

  it("troca assets pelas logos do app e links do ClassLink por caminhos relativos na mesma aba", () => {
    const html = toClassLinkPage(
      `<!doctype html>\n<img src="assets/logo-espaco-kids.png"><a href="${CLASSLINK_URL}/login" target="_blank" rel="noopener">Entrar</a>`,
    );
    expect(html).toContain('<img src="/logos/logo-espaco-kids.png">');
    expect(html).toContain('<a href="/login">Entrar</a>');
    expect(html).not.toContain(CLASSLINK_URL);
  });

  it("as logos usadas pela página existem em public/logos", () => {
    const gerado = readFileSync(path.join(root, "public/matriculas.html"), "utf8");
    const logos = [...gerado.matchAll(/src="\/logos\/([^"]+)"/g)].map((m) => m[1]);
    expect(logos.length).toBeGreaterThan(0);
    for (const logo of new Set(logos)) {
      expect(() => readFileSync(path.join(root, "public/logos", logo))).not.toThrow();
    }
  });
});

describe("mensagem de rematrícula", () => {
  it("inclui responsável, alunos e turmas", () => {
    const msg = mensagemRematricula(
      "Ana Souza",
      [
        { name: "Pedro Souza", class: { name: "7º ano A" } },
        { name: "Lia Souza", class: null },
      ],
      2027,
    );
    expect(msg).toBe(
      "Olá! Quero confirmar a *rematrícula 2027*.\n\n*Responsável:* Ana Souza\n*Aluno(s):* Pedro Souza (7º ano A), Lia Souza",
    );
  });

  it("gera link de WhatsApp com a mensagem codificada", () => {
    const url = linkWhatsAppRematricula("Ana", []);
    expect(url.startsWith("https://wa.me/5521964699441?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toContain("rematrícula");
  });
});
