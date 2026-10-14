import { describe, expect, it } from "vitest";
import { reciboDeLeitura } from "@/lib/recibo-leitura";

describe("reciboDeLeitura", () => {
  it("sem leitura: enviada, uma marca", () => {
    expect(reciboDeLeitura(null)).toEqual({ marca: "✓", lida: false, texto: "Enviada" });
    expect(reciboDeLeitura(undefined).lida).toBe(false);
  });

  it("com leitura: duas marcas e data/hora", () => {
    const r = reciboDeLeitura("2026-10-14T17:05:00.000Z");
    expect(r.marca).toBe("✓✓");
    expect(r.lida).toBe(true);
    expect(r.texto).toMatch(/^Lida em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/);
  });
});
