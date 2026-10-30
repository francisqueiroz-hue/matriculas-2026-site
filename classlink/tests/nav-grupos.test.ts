import { describe, expect, it } from "vitest";
import { agruparLinks, getNavLinks } from "@/lib/nav-links";

describe("menu lateral agrupado", () => {
  it("responsável: Comunicação, Dia a dia, Meu(s) filho(s) e Ajuda (guia do app), sem Gestão", () => {
    const grupos = agruparLinks(getNavLinks({ role: "GUARDIAN", isCoordenacao: false }));
    expect(grupos.map((g) => g.titulo)).toEqual(["Comunicação", "Dia a dia", "Meu(s) filho(s)", "Ajuda"]);
    expect(grupos[0].links.map((l) => l.label)).toEqual(["Mural", "Comunicados", "Enquetes", "Mensagens"]);
  });

  it("direção: o que não tem seção própria cai em Gestão e nenhum link se perde", () => {
    const links = getNavLinks({ role: "ADMIN", isCoordenacao: false });
    const grupos = agruparLinks(links);
    expect(grupos.map((g) => g.titulo)).toEqual(["Comunicação", "Dia a dia", "Pedagógico", "Gestão", "Secretaria", "Ajuda"]);
    expect(grupos.flatMap((g) => g.links)).toHaveLength(links.length);
    expect(grupos.find((g) => g.titulo === "Gestão")?.links.some((l) => l.label === "Painel")).toBe(true);
  });

  it("professor sem coordenação: Comunicação, Dia a dia e a ficha da matrícula (Secretaria)", () => {
    expect(agruparLinks(getNavLinks({ role: "STAFF", isCoordenacao: false })).map((g) => g.titulo)).toEqual([
      "Comunicação",
      "Dia a dia",
      "Secretaria",
      "Ajuda",
    ]);
  });
});
