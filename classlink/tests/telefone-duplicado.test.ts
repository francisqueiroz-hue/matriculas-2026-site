import { describe, expect, it, vi } from "vitest";
import { normalizePhoneBR, telefoneEmLista } from "@/lib/whatsapp";

// Só funções puras: o cliente do banco não é usado (e não precisa existir) neste teste.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("telefoneEmLista", () => {
  const existentes = ["5521987654321", null, undefined, "5511912345678"];

  it("reconhece o mesmo número em formatos diferentes", () => {
    expect(telefoneEmLista("5521987654321", existentes)).toBe(true);
    expect(telefoneEmLista(normalizePhoneBR("(21) 98765-4321")!, existentes)).toBe(true);
    expect(telefoneEmLista(normalizePhoneBR("21 98765 4321")!, existentes)).toBe(true);
  });

  it("reconhece o mesmo celular com e sem o nono dígito", () => {
    expect(telefoneEmLista("552187654321", existentes)).toBe(true);
    expect(telefoneEmLista("551187654321", ["5511987654321"])).toBe(true);
  });

  it("não confunde números diferentes", () => {
    expect(telefoneEmLista("5521987654322", existentes)).toBe(false);
    expect(telefoneEmLista("5521987650000", existentes)).toBe(false);
    expect(telefoneEmLista("5531987654321", existentes)).toBe(false);
  });

  it("ignora entradas vazias e lista vazia", () => {
    expect(telefoneEmLista("5521987654321", [null, undefined, ""])).toBe(false);
    expect(telefoneEmLista("5521987654321", [])).toBe(false);
  });
});

describe("normalizePhoneBR recusa número inválido (não pode ser gravado como veio)", () => {
  it("devolve null para curto, longo ou vazio", () => {
    expect(normalizePhoneBR("12345")).toBeNull();
    expect(normalizePhoneBR("(21) 9876")).toBeNull();
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR("abc")).toBeNull();
    expect(normalizePhoneBR("5521987654321999")).toBeNull();
  });

  it("padroniza formatos válidos para 55 + DDD + número", () => {
    expect(normalizePhoneBR("(21) 98765-4321")).toBe("5521987654321");
    expect(normalizePhoneBR("+55 21 98765-4321")).toBe("5521987654321");
    expect(normalizePhoneBR("21987654321")).toBe("5521987654321");
  });
});
