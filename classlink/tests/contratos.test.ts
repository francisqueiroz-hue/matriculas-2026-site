import { describe, expect, it } from "vitest";
import {
  CONTRATO_MAX_BYTES,
  ContratoErro,
  formatarDataHora,
  nomeArquivoPdfSeguro,
  podeEnviarAssinado,
  podeExcluirContrato,
  proximoStatus,
  validarPdf,
} from "@/lib/contratos";
import { sha256Hex } from "@/lib/contratos-server";
import { acaoContratoSchema, novoContratoSchema, envioAssinadoSchema } from "@/lib/validators";

const pdf = (extra = "") => new TextEncoder().encode(`%PDF-1.7\n${extra}\n%%EOF`);

describe("validarPdf", () => {
  it("aceita um PDF pequeno", () => {
    expect(() => validarPdf(pdf("conteudo"))).not.toThrow();
  });

  it("aceita cabeçalho %PDF- depois de alguns bytes (permitido pela especificação)", () => {
    const bytes = new TextEncoder().encode(`\n\n%PDF-1.4\nx`);
    expect(() => validarPdf(bytes)).not.toThrow();
  });

  it("rejeita arquivo vazio", () => {
    expect(() => validarPdf(new Uint8Array())).toThrow(ContratoErro);
  });

  it("rejeita arquivo que não é PDF (ex.: foto renomeada)", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(() => validarPdf(jpeg)).toThrow(/PDF/);
  });

  it("rejeita arquivo acima do limite", () => {
    const grande = new Uint8Array(CONTRATO_MAX_BYTES + 1);
    grande.set(new TextEncoder().encode("%PDF-1.7"));
    expect(() => validarPdf(grande)).toThrow(/4 MB/);
  });

  it("aceita exatamente o limite", () => {
    const limite = new Uint8Array(CONTRATO_MAX_BYTES);
    limite.set(new TextEncoder().encode("%PDF-1.7"));
    expect(() => validarPdf(limite)).not.toThrow();
  });
});

describe("sha256Hex", () => {
  it("gera a impressão digital conhecida", () => {
    // sha256("abc")
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("muda quando um único byte muda", () => {
    expect(sha256Hex(pdf("a"))).not.toBe(sha256Hex(pdf("b")));
  });
});

describe("transições de status do contrato", () => {
  it("família envia o assinado quando está aguardando ou devolvido", () => {
    expect(podeEnviarAssinado("AGUARDANDO_ASSINATURA")).toBe(true);
    expect(podeEnviarAssinado("DEVOLVIDO")).toBe(true);
    expect(podeEnviarAssinado("EM_CONFERENCIA")).toBe(false);
    expect(podeEnviarAssinado("COMPLETO")).toBe(false);
    expect(proximoStatus("AGUARDANDO_ASSINATURA", "ENVIAR_ASSINADO")).toBe("EM_CONFERENCIA");
    expect(proximoStatus("DEVOLVIDO", "ENVIAR_ASSINADO")).toBe("EM_CONFERENCIA");
  });

  it("aprovar gov.br conclui; aprovar assinatura à mão aguarda o original em papel", () => {
    expect(proximoStatus("EM_CONFERENCIA", "APROVAR", "GOVBR")).toBe("COMPLETO");
    expect(proximoStatus("EM_CONFERENCIA", "APROVAR", "MANUSCRITA")).toBe("AGUARDANDO_ORIGINAL");
  });

  it("aprovar sem método informado é erro", () => {
    expect(() => proximoStatus("EM_CONFERENCIA", "APROVAR", null)).toThrow(ContratoErro);
  });

  it("devolver só a partir da conferência", () => {
    expect(proximoStatus("EM_CONFERENCIA", "DEVOLVER")).toBe("DEVOLVIDO");
    expect(() => proximoStatus("AGUARDANDO_ASSINATURA", "DEVOLVER")).toThrow(ContratoErro);
    expect(() => proximoStatus("COMPLETO", "DEVOLVER")).toThrow(ContratoErro);
  });

  it("original recebido só quando aguardando o original", () => {
    expect(proximoStatus("AGUARDANDO_ORIGINAL", "ORIGINAL_RECEBIDO")).toBe("COMPLETO");
    expect(() => proximoStatus("EM_CONFERENCIA", "ORIGINAL_RECEBIDO")).toThrow(ContratoErro);
  });

  it("contrato completo não muda mais", () => {
    for (const acao of ["ENVIAR_ASSINADO", "APROVAR", "DEVOLVER", "ORIGINAL_RECEBIDO"] as const) {
      expect(() => proximoStatus("COMPLETO", acao, "GOVBR")).toThrow(ContratoErro);
    }
  });

  it("só exclui contrato que ainda não recebeu nenhum envio da família", () => {
    expect(podeExcluirContrato("AGUARDANDO_ASSINATURA", 0)).toBe(true);
    expect(podeExcluirContrato("AGUARDANDO_ASSINATURA", 1)).toBe(false);
    expect(podeExcluirContrato("DEVOLVIDO", 1)).toBe(false);
    expect(podeExcluirContrato("COMPLETO", 1)).toBe(false);
  });

  it("contrato do app: preencher os dados no app é opcional e só vale antes de enviar o assinado", () => {
    expect(proximoStatus("AGUARDANDO_ASSINATURA", "PREENCHER_DADOS")).toBe("AGUARDANDO_ASSINATURA");
    expect(proximoStatus("DEVOLVIDO", "PREENCHER_DADOS")).toBe("AGUARDANDO_ASSINATURA");
    // Depois de enviado o assinado, os dados ficam travados.
    for (const s of ["EM_CONFERENCIA", "AGUARDANDO_ORIGINAL", "COMPLETO"] as const) {
      expect(() => proximoStatus(s, "PREENCHER_DADOS")).toThrow(ContratoErro);
    }
  });
});

describe("nomeArquivoPdfSeguro", () => {
  it("remove caminho, aspas e quebras de linha (evita injeção no cabeçalho)", () => {
    expect(nomeArquivoPdfSeguro('../../etc/"passwd"\r\nX: y.pdf')).toBe("passwd X y.pdf");
  });

  it("garante extensão .pdf", () => {
    expect(nomeArquivoPdfSeguro("contrato assinado")).toBe("contrato assinado.pdf");
  });

  it("usa nome padrão quando sobra vazio", () => {
    expect(nomeArquivoPdfSeguro("///")).toBe("contrato.pdf");
  });

  it("limita o tamanho", () => {
    expect(nomeArquivoPdfSeguro(`${"a".repeat(300)}.pdf`).length).toBeLessThanOrEqual(120);
  });
});

describe("validação dos formulários", () => {
  it("novo contrato exige aluno, ano e título", () => {
    expect(novoContratoSchema.safeParse({ studentId: "s1", anoLetivo: "2027", titulo: "Contrato 2027" }).success).toBe(true);
    expect(novoContratoSchema.safeParse({ studentId: "", anoLetivo: "2027", titulo: "x" }).success).toBe(false);
    expect(novoContratoSchema.safeParse({ studentId: "s1", anoLetivo: "1999", titulo: "x" }).success).toBe(false);
  });

  it("envio do assinado exige método válido e a declaração marcada", () => {
    expect(envioAssinadoSchema.safeParse({ metodo: "GOVBR", declaracao: "true" }).success).toBe(true);
    expect(envioAssinadoSchema.safeParse({ metodo: "MANUSCRITA", declaracao: "true" }).success).toBe(true);
    expect(envioAssinadoSchema.safeParse({ metodo: "GOVBR", declaracao: "false" }).success).toBe(false);
    expect(envioAssinadoSchema.safeParse({ metodo: "OUTRO", declaracao: "true" }).success).toBe(false);
  });

  it("devolução exige motivo", () => {
    expect(acaoContratoSchema.safeParse({ acao: "DEVOLVER", motivo: "Faltou a página 2" }).success).toBe(true);
    expect(acaoContratoSchema.safeParse({ acao: "DEVOLVER" }).success).toBe(false);
    expect(acaoContratoSchema.safeParse({ acao: "DEVOLVER", motivo: "   " }).success).toBe(false);
    expect(acaoContratoSchema.safeParse({ acao: "APROVAR" }).success).toBe(true);
    expect(acaoContratoSchema.safeParse({ acao: "ORIGINAL_RECEBIDO" }).success).toBe(true);
  });
});

describe("formatarDataHora", () => {
  it("mostra data e hora sem segundos", () => {
    const texto = formatarDataHora(new Date(2026, 9, 8, 10, 42, 59));
    expect(texto).toBe("08/10/2026 às 10:42");
  });
});
