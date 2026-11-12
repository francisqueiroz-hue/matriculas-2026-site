import { describe, it, expect } from "vitest";
import { origemPermitida } from "@/lib/origem-requisicao";

const h = (o: Record<string, string>) => new Headers(o);

describe("origemPermitida", () => {
  it("sem Origin (curl, app nativo) passa", () => {
    expect(origemPermitida(h({ host: "app.escola.com" }), {})).toBe(true);
  });
  it("Origin igual ao host passa; também pelo x-forwarded-host", () => {
    expect(origemPermitida(h({ origin: "https://app.escola.com", host: "app.escola.com" }), {})).toBe(true);
    expect(
      origemPermitida(h({ origin: "https://app.escola.com", host: "interno", "x-forwarded-host": "app.escola.com" }), {}),
    ).toBe(true);
  });
  it("Origin de outro site, 'null' ou inválido é recusado", () => {
    expect(origemPermitida(h({ origin: "https://evil.example", host: "app.escola.com" }), {})).toBe(false);
    expect(origemPermitida(h({ origin: "null", host: "app.escola.com" }), {})).toBe(false);
    expect(origemPermitida(h({ origin: "lixo", host: "app.escola.com" }), {})).toBe(false);
  });
  it("sec-fetch-site cross-site é recusado mesmo com Origin parecido", () => {
    expect(
      origemPermitida(h({ origin: "https://app.escola.com", host: "app.escola.com", "sec-fetch-site": "cross-site" }), {}),
    ).toBe(false);
  });
  it("aceita o endereço público configurado (APP_URL)", () => {
    const env = { APP_URL: "https://escola.com.br/" };
    expect(origemPermitida(h({ origin: "https://escola.com.br", host: "outro" }), env)).toBe(true);
    expect(origemPermitida(h({ origin: "https://evil.example", host: "outro" }), env)).toBe(false);
  });
});
