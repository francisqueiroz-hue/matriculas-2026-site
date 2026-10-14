import { describe, expect, it } from "vitest";
import { CABECALHOS_SEGURANCA } from "@/lib/cabecalhos-seguranca";

const valor = (k: string) => CABECALHOS_SEGURANCA.find((h) => h.key === k)?.value ?? "";

describe("cabeçalhos de segurança", () => {
  it("bloqueia embutir em outros sites e farejamento de tipo", () => {
    expect(valor("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(valor("X-Content-Type-Options")).toBe("nosniff");
    expect(valor("Content-Security-Policy")).toContain("frame-ancestors 'self'");
  });
  it("não usa script-src (uma CSP parcial quebraria as telas)", () => {
    expect(valor("Content-Security-Policy")).not.toMatch(/script-src|default-src/);
  });
  it("não repete cabeçalhos", () => {
    const chaves = CABECALHOS_SEGURANCA.map((h) => h.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
