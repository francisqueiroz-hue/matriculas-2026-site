import { describe, expect, it } from "vitest";
import { extrairViolacao, origemDe, resumirRelatorioCsp } from "@/lib/csp-relatorio";

describe("resumirRelatorioCsp", () => {
  it("lê o formato antigo (csp-report)", () => {
    const linha = resumirRelatorioCsp({
      "csp-report": { "effective-directive": "script-src", "blocked-uri": "https://evil.example/x.js", "document-uri": "https://app/dashboard" },
    });
    expect(linha).toContain("effective-directive=script-src");
    expect(linha).toContain("blocked-uri=https://evil.example/x.js");
  });
  it("lê o formato Reporting API", () => {
    const linha = resumirRelatorioCsp([
      { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://x/y.png", documentURL: "https://app/", disposition: "report" } },
    ]);
    expect(linha).toContain("effective-directive=img-src");
    expect(linha).toContain("blocked-uri=https://x/y.png");
  });
  it("ignora lixo e corpo desconhecido", () => {
    expect(resumirRelatorioCsp(null)).toBeNull();
    expect(resumirRelatorioCsp("texto")).toBeNull();
    expect(resumirRelatorioCsp({ qualquer: 1 })).toBeNull();
    expect(resumirRelatorioCsp([{ type: "outro" }])).toBeNull();
  });
  it("limita tamanho e remove quebras de linha (log injection)", () => {
    const linha = resumirRelatorioCsp({ "csp-report": { "blocked-uri": "a\nb".repeat(300) } }) ?? "";
    expect(linha).not.toMatch(/[\r\n]/);
    expect(linha.length).toBeLessThan(900);
  });
});

describe("extrairViolacao", () => {
  it("agrupa por diretiva, origem bloqueada e caminho da página (sem consulta)", () => {
    const v = extrairViolacao({
      "csp-report": {
        "effective-directive": "img-src",
        "blocked-uri": "https://cdn.exemplo.com/a/b.png?token=segredo",
        "document-uri": "https://app.exemplo.com/dashboard/mensagens/123?x=1#frag",
      },
    });
    expect(v).toEqual({
      diretiva: "img-src",
      bloqueado: "https://cdn.exemplo.com",
      pagina: "/dashboard/mensagens/123",
      chave: "img-src|https://cdn.exemplo.com|/dashboard/mensagens/123",
    });
  });
  it("palavras-chave e esquemas viram valores curtos", () => {
    expect(origemDe("inline")).toBe("inline");
    expect(origemDe("eval")).toBe("eval");
    expect(origemDe("data:image/png;base64,AAAA")).toBe("data://");
    expect(origemDe("chrome-extension://abc/x.js")).toBe("chrome-extension://");
    expect(origemDe("")).toBe("(vazio)");
  });
  it("formato Reporting API e lixo", () => {
    const v = extrairViolacao([{ type: "csp-violation", body: { effectiveDirective: "script-src-elem", blockedURL: "https://x.com/s.js", documentURL: "https://app/login" } }]);
    expect(v?.chave).toBe("script-src-elem|https://x.com|/login");
    expect(extrairViolacao(null)).toBeNull();
    expect(extrairViolacao({ a: 1 })).toBeNull();
  });
});
