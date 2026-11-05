import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { conferirAssinaturasPdf, normalizarNome, separarNomeCpf } from "@/lib/assinatura-pdf";

// PDF assinado de teste (certificado fictício "MARIA DE TESTE", gerado por
// tests/fixtures/gerar-pdf-assinado.mjs com openssl): mesma estrutura do PDF que sai do
// Assinador gov.br (assinatura CAdES destacada, /ByteRange + /Contents).
const assinado = new Uint8Array(readFileSync(join(__dirname, "fixtures/contrato-assinado-teste.pdf")));

describe("pré-conferência da assinatura digital do PDF", () => {
  it("lê quem assinou, o emissor, a data e confere que o PDF está íntegro", () => {
    const r = conferirAssinaturasPdf(assinado);
    expect(r.assinaturas).toHaveLength(1);
    const a = r.assinaturas[0];
    expect(a.signatario).toBe("MARIA DE TESTE");
    expect(a.cpfMascarado).toBe("***.456.789-**");
    expect(a.emissor).toBe("AC TESTE do Governo Federal do Brasil");
    expect(a.emissorGovBr).toBe(true);
    expect(a.integridade).toBe("INTEGRA");
    expect(a.cobreArquivoInteiro).toBe(true);
    expect(a.certificadoNoPrazo).toBe(true);
    expect(a.dataAssinatura).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.conteudoDepoisDaUltima).toBe(false);
  });

  it("acusa alteração quando um byte do trecho assinado muda", () => {
    const alterado = Uint8Array.from(assinado);
    const pos = Buffer.from(alterado).indexOf("/MediaBox [0 0 200 200]") + "/MediaBox [0 0 ".length;
    alterado[pos] = "3".charCodeAt(0); // 200 -> 300
    const a = conferirAssinaturasPdf(alterado).assinaturas[0];
    expect(a.integridade).toBe("ALTERADA");
    expect(a.signatario).toBe("MARIA DE TESTE");
  });

  it("avisa quando há conteúdo acrescentado depois da assinatura", () => {
    const comAcrescimo = new Uint8Array(Buffer.concat([Buffer.from(assinado), Buffer.from("1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n")]));
    const r = conferirAssinaturasPdf(comAcrescimo);
    expect(r.assinaturas[0].integridade).toBe("INTEGRA"); // o trecho assinado continua igual
    expect(r.assinaturas[0].cobreArquivoInteiro).toBe(false);
    expect(r.conteudoDepoisDaUltima).toBe(true);
  });

  it("PDF sem assinatura digital (ex.: assinado à mão e digitalizado)", () => {
    const r = conferirAssinaturasPdf(new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n")));
    expect(r.assinaturas).toEqual([]);
    expect(r.conteudoDepoisDaUltima).toBe(false);
  });

  it("conteúdo de assinatura ilegível não derruba a conferência", () => {
    const quebrado = Uint8Array.from(assinado);
    const ini = Buffer.from(quebrado).indexOf("/Contents <") + "/Contents <".length;
    quebrado.fill("f".charCodeAt(0), ini, ini + 20);
    const a = conferirAssinaturasPdf(quebrado).assinaturas[0];
    expect(a.integridade).toBe("NAO_CONFERIDA");
    expect(a.detalhe).toMatch(/não sabe ler/);
  });

  it("separa nome e CPF e mascara o CPF", () => {
    expect(separarNomeCpf("JOAO DA SILVA:98765432100")).toEqual({ nome: "JOAO DA SILVA", cpfMascarado: "***.654.321-**" });
    expect(separarNomeCpf("Joao da Silva")).toEqual({ nome: "Joao da Silva", cpfMascarado: null });
  });

  it("compara nomes sem acento e caixa", () => {
    expect(normalizarNome("  Joăo  da Conceição ")).toBe(normalizarNome("JOAO DA CONCEICAO"));
  });
});
