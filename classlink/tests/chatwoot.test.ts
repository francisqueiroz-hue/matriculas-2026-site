import { describe, expect, it } from "vitest";
import { normalizePhoneBR } from "@/lib/chatwoot";

describe("normalizePhoneBR", () => {
  it("adiciona o código do Brasil quando ausente", () => {
    expect(normalizePhoneBR("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizePhoneBR("11912345678")).toBe("5511912345678");
  });

  it("mantém números que já vêm com o código do país", () => {
    expect(normalizePhoneBR("5511912345678")).toBe("5511912345678");
  });

  it("retorna null para entradas vazias ou com quantidade de dígitos inválida", () => {
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR("123")).toBeNull();
  });
});
