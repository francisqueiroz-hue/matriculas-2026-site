import { describe, expect, it } from "vitest";
import { resumirRelatorioCsp } from "@/lib/csp-relatorio";

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
