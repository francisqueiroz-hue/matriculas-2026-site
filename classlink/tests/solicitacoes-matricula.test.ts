import { describe, expect, it } from "vitest";
import {
  atualizarSolicitacaoSchema,
  formatarTelefone,
  normalizarTelefone,
  solicitacaoPublicaSchema,
  solicitacoesParaCsv,
} from "@/lib/solicitacoes-matricula";

const valida = {
  tipo: "PRE_MATRICULA",
  responsavelNome: "Maria Silva",
  telefone: "(21) 98765-4321",
  alunoNome: "João",
  serie: "6º ano",
  consentimento: true,
};

describe("formulário público de matrícula", () => {
  it("aceita um envio válido e trata opcionais vazios como ausentes", () => {
    const dados = solicitacaoPublicaSchema.parse({ ...valida, escolaAtual: "", website: "" });
    expect(dados.origem).toBe("SITE");
    expect(dados.escolaAtual).toBeUndefined();
  });

  it("exige consentimento explícito (LGPD)", () => {
    expect(() => solicitacaoPublicaSchema.parse({ ...valida, consentimento: false })).toThrow();
    const semConsentimento: Partial<typeof valida> = { ...valida };
    delete semConsentimento.consentimento;
    expect(() => solicitacaoPublicaSchema.parse(semConsentimento)).toThrow();
  });

  it("recusa telefone inválido, nome curto e tipo desconhecido", () => {
    expect(() => solicitacaoPublicaSchema.parse({ ...valida, telefone: "123" })).toThrow();
    expect(() => solicitacaoPublicaSchema.parse({ ...valida, responsavelNome: "  A " })).toThrow();
    expect(() => solicitacaoPublicaSchema.parse({ ...valida, tipo: "OUTRO" })).toThrow();
  });

  it("recusa envio de robô que preenche o campo-armadilha", () => {
    expect(() => solicitacaoPublicaSchema.parse({ ...valida, website: "http://spam" })).toThrow();
  });

  it("limita o tamanho dos textos livres", () => {
    expect(() => solicitacaoPublicaSchema.parse({ ...valida, observacoes: "x".repeat(501) })).toThrow();
  });
});

describe("telefone", () => {
  it("normaliza para dígitos com DDI 55 e formata para exibição", () => {
    expect(normalizarTelefone("(21) 98765-4321")).toBe("5521987654321");
    expect(formatarTelefone("5521987654321")).toBe("(21) 98765-4321");
    expect(formatarTelefone("552134567890")).toBe("(21) 3456-7890");
  });
});

describe("administração", () => {
  it("só aceita status conhecidos", () => {
    expect(atualizarSolicitacaoSchema.parse({ status: "MATRICULADO" })).toEqual({ status: "MATRICULADO" });
    expect(() => atualizarSolicitacaoSchema.parse({ status: "APROVADO" })).toThrow();
  });

  it("exporta CSV com BOM, rótulos em português e campos escapados", () => {
    const csv = solicitacoesParaCsv([
      {
        createdAt: new Date("2026-09-24T15:00:00Z"),
        tipo: "REMATRICULA",
        status: "NOVA",
        responsavelNome: "Ana Souza",
        telefone: "5521912345678",
        alunoNome: "Pedro, Lia",
        serie: "8º ano",
        periodoVisita: null,
        escolaAtual: null,
        observacoes: 'Disse "obrigada"',
        observacoesInternas: null,
      },
    ]);
    expect(csv.startsWith("﻿Data,Tipo,Status")).toBe(true);
    const linha = csv.split("\n")[1];
    expect(linha).toContain("Rematrícula,Nova,Ana Souza,(21) 91234-5678,\"Pedro, Lia\",8º ano");
    expect(linha).toContain('"Disse ""obrigada"""');
    expect(linha).toContain("24/09/2026");
  });
});
