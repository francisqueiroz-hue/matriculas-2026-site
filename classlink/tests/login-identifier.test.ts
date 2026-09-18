import { describe, expect, it } from "vitest";
import { resolveLoginIdentifier } from "@/lib/login-identifier";

describe("resolveLoginIdentifier", () => {
  it("reconhece e-mail e o normaliza para minúsculas", () => {
    expect(resolveLoginIdentifier("Familia@Escola.com")).toEqual({ type: "email", value: "familia@escola.com" });
  });

  it("reconhece telefone com formatação e normaliza para E.164 sem +", () => {
    expect(resolveLoginIdentifier("(21) 99286-5778")).toEqual({ type: "phone", value: "5521992865778" });
  });

  it("reconhece telefone já com 55 na frente", () => {
    expect(resolveLoginIdentifier("5521992865778")).toEqual({ type: "phone", value: "5521992865778" });
  });

  it("reconhece telefone só com dígitos, sem formatação", () => {
    expect(resolveLoginIdentifier("21992865778")).toEqual({ type: "phone", value: "5521992865778" });
  });

  it("rejeita texto que não é nem e-mail nem telefone válido", () => {
    expect(resolveLoginIdentifier("abc")).toBeNull();
  });

  it("rejeita string vazia", () => {
    expect(resolveLoginIdentifier("   ")).toBeNull();
  });
});
