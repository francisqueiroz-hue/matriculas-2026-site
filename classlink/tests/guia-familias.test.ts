import { describe, expect, it } from "vitest";
import { partesComLinks } from "@/lib/texto-links";
import { textoComunicadoGuia, textoWhatsAppGuia } from "@/lib/guia-familias";
import { getNavLinks } from "@/lib/nav-links";

describe("guia do app para as famílias", () => {
  it("está no menu de todos os perfis", () => {
    for (const role of ["ADMIN", "STAFF", "GUARDIAN"] as const) {
      expect(getNavLinks({ role, isCoordenacao: false }).some((l) => l.href === "/guia")).toBe(true);
    }
  });

  it("textos levam o link do guia", () => {
    expect(textoComunicadoGuia("https://escola.app/guia")).toContain("Acesse: https://escola.app/guia");
    expect(textoWhatsAppGuia("https://escola.app/guia")).toContain("https://escola.app/guia");
  });

  it("link do comunicado vira clicável, sem pontuação final e só https", () => {
    expect(partesComLinks("Acesse: https://escola.app/guia.")).toEqual([
      { texto: "Acesse: ", link: false },
      { texto: "https://escola.app/guia", link: true },
      { texto: ".", link: false },
    ]);
    expect(partesComLinks("javascript:alert(1) http://x.com").every((p) => !p.link)).toBe(true);
    expect(partesComLinks("sem link")).toEqual([{ texto: "sem link", link: false }]);
  });
});
