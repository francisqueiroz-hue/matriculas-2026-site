import { describe, expect, it } from "vitest";
import { CABECALHOS_SEGURANCA } from "@/lib/cabecalhos-seguranca";

const valor = (k: string) => CABECALHOS_SEGURANCA.find((h) => h.key === k)?.value ?? "";

describe("cabeçalhos de segurança", () => {
  it("bloqueia embutir em outros sites e farejamento de tipo", () => {
    expect(valor("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(valor("X-Content-Type-Options")).toBe("nosniff");
    expect(valor("Content-Security-Policy")).toContain("frame-ancestors 'self'");
  });
  it("a CSP que bloqueia continua mínima (script-src só em Report-Only por enquanto)", () => {
    expect(valor("Content-Security-Policy")).not.toMatch(/script-src|default-src/);
  });
  it("a CSP completa roda em Report-Only e reporta violações", () => {
    const ro = valor("Content-Security-Policy-Report-Only");
    expect(ro).toContain("default-src 'self'");
    expect(ro).toContain("script-src 'self'");
    expect(ro).toContain("object-src 'none'");
    expect(ro).toContain("report-uri /api/csp-report");
  });
  it("libera só os serviços usados (Firebase/Google), sem curinga geral", () => {
    const ro = valor("Content-Security-Policy-Report-Only");
    expect(ro).toContain("https://www.gstatic.com");
    expect(ro).toContain("https://*.googleapis.com");
    expect(ro).not.toMatch(/(^|[ ;])\*([ ;]|$)/);
  });
  it("não repete cabeçalhos", () => {
    const chaves = CABECALHOS_SEGURANCA.map((h) => h.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
