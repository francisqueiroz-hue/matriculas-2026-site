import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { normalizarPem, normalizarParMtls } from "@/lib/pem";

// Certificado autoassinado descartável (só a parte pública, sem uso real). As chaves são geradas
// na hora para não guardar chave privada no repositório.
const CRT = readFileSync(join(__dirname, "fixtures/pem/teste-crt.pem.txt"), "utf8");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const KEY_RSA = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const miolo = (pem: string) => pem.split("\n").filter((l) => l && !l.startsWith("-----")).join("");

describe("normalizarPem", () => {
  it("mantém o arquivo colado como está", () => {
    expect(normalizarPem(CRT, "certificado")).toContain("-----BEGIN CERTIFICATE-----\n");
    expect(normalizarPem(KEY, "chave")).toContain("-----BEGIN PRIVATE KEY-----\n");
  });

  it("aceita tudo numa linha só (quebras viraram espaço)", () => {
    const umaLinha = CRT.replace(/\n/g, " ");
    expect(miolo(normalizarPem(umaLinha, "certificado"))).toBe(miolo(CRT));
    expect(miolo(normalizarPem(KEY_RSA.replace(/\n/g, " "), "chave"))).toBe(miolo(KEY_RSA));
  });

  it("aceita \\n escrito, \\r\\n, BOM e aspas", () => {
    expect(miolo(normalizarPem(CRT.replace(/\n/g, "\\n"), "certificado"))).toBe(miolo(CRT));
    expect(miolo(normalizarPem("﻿" + CRT.replace(/\n/g, "\r\n"), "certificado"))).toBe(miolo(CRT));
    expect(miolo(normalizarPem(`"${KEY}"`, "chave"))).toBe(miolo(KEY));
  });

  it("aceita o arquivo inteiro em base64", () => {
    const b64 = Buffer.from(CRT).toString("base64");
    expect(miolo(normalizarPem(b64, "certificado"))).toBe(miolo(CRT));
  });

  it("aceita só o miolo, sem BEGIN/END (PKCS#8 e PKCS#1)", () => {
    expect(normalizarPem(miolo(CRT), "certificado")).toContain("BEGIN CERTIFICATE");
    expect(normalizarPem(miolo(KEY), "chave")).toContain("BEGIN PRIVATE KEY");
    expect(normalizarPem(miolo(KEY_RSA), "chave")).toContain("BEGIN RSA PRIVATE KEY");
  });

  it("erro claro, sem mostrar o conteúdo, quando não reconhece", () => {
    expect(() => normalizarPem("segredo-qualquer", "certificado")).toThrow(/BANCO_INTER_CERT.*\.crt/);
    try {
      normalizarPem("segredo-qualquer", "chave");
    } catch (e) {
      expect((e as Error).message).not.toContain("segredo-qualquer");
    }
  });

  it("chave no lugar do certificado é recusada", () => {
    expect(() => normalizarPem(KEY, "certificado")).toThrow(/BANCO_INTER_CERT/);
  });
});

describe("normalizarParMtls", () => {
  it("destroca certificado e chave colados trocados", () => {
    const par = normalizarParMtls(KEY, CRT);
    expect(par.cert).toContain("BEGIN CERTIFICATE");
    expect(par.key).toContain("BEGIN PRIVATE KEY");
  });
});
