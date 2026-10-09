import { describe, expect, it } from "vitest";
import { chaveVapid } from "@/lib/firebase-client";

describe("chaveVapid", () => {
  it("aceita uma chave pública P-256 em base64url", () => {
    const chave = chaveVapid("BDOU99-h67HcA6JeFXHbSNMu7e2yNNu3RzoMj8TM4W88jITfq7ZmPvIM1Iv-4_l2LxQcYwhqby2xGpWwzjfAnG4");
    expect(chave.length).toBe(65);
    expect(chave[0]).toBe(4);
  });

  it("recusa a chave privada ou texto truncado, com mensagem clara", () => {
    expect(() => chaveVapid("abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG")).toThrow(/chave inválida/);
  });
});
