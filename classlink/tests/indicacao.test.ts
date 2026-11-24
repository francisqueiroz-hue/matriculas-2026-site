import { describe, expect, it } from "vitest";
import { BENEFICIO_INDICACAO, linkIndicacao, linkWhatsAppIndicacao, mensagemIndicacao, nomeParaIndicacao } from "@/lib/indicacao";

describe("indique uma família", () => {
  it("usa só o primeiro e o último nome de quem indica", () => {
    expect(nomeParaIndicacao("  Maria  da Silva Souza ")).toBe("Maria Souza");
    expect(nomeParaIndicacao("Ana")).toBe("Ana");
    expect(nomeParaIndicacao("   ")).toBe("");
  });

  it("monta o link da página de matrículas com indicação e campanha", () => {
    const url = new URL(linkIndicacao("https://app.exemplo.com.br", "Maria da Silva Souza"));
    expect(url.pathname).toBe("/matriculas");
    expect(url.searchParams.get("indicacao")).toBe("Maria Souza");
    expect(url.searchParams.get("utm_source")).toBe("indicacao");
    expect(url.hash).toBe("#pre-matricula");
  });

  it("abre o WhatsApp sem número fixo, com o link na mensagem", () => {
    const wa = linkWhatsAppIndicacao("https://app.exemplo.com.br", "Ana Lima");
    expect(wa.startsWith("https://wa.me/?text=")).toBe(true);
    const texto = decodeURIComponent(wa.split("text=")[1]);
    expect(texto).toContain("indicacao=Ana+Lima");
    expect(mensagemIndicacao("L", 2027)).toContain("matrículas 2027");
  });
});

describe("benefício da indicação", () => {
  it("cita benefício na parte pedagógica escolar sem dizer qual nem prometer valor", () => {
    expect(BENEFICIO_INDICACAO).toContain("benefício na parte pedagógica escolar");
    expect(BENEFICIO_INDICACAO).not.toMatch(/material|sorteio/i);
    expect(BENEFICIO_INDICACAO).not.toMatch(/R\$|%|\d/);
  });
});
