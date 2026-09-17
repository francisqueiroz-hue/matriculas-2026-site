import { describe, expect, it } from "vitest";
import { ordenarDupla } from "@/lib/messaging";

describe("ordenarDupla", () => {
  it("ordena os dois ids em ordem lexicográfica, independente da ordem de entrada", () => {
    expect(ordenarDupla("user-b", "user-a")).toEqual(["user-a", "user-b"]);
    expect(ordenarDupla("user-a", "user-b")).toEqual(["user-a", "user-b"]);
  });

  it("é determinística para IDs do tipo cuid (comparação de string)", () => {
    const a = "cabc0000000000000000000001";
    const b = "cabc0000000000000000000002";
    expect(ordenarDupla(a, b)).toEqual([a, b]);
    expect(ordenarDupla(b, a)).toEqual([a, b]);
  });
});
