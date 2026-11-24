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

describe("captação: origem, indicação e funil", () => {
  it("aceita canal conhecido, ignora canal desconhecido e limpa a campanha", async () => {
    const { solicitacaoPublicaSchema: schema } = await import("@/lib/solicitacoes-matricula");
    const ok = schema.parse({ ...valida, comoConheceu: "INDICACAO", indicadoPor: " Ana Souza ", campanha: "Instagram-Bio <script>" });
    expect(ok.comoConheceu).toBe("INDICACAO");
    expect(ok.indicadoPor).toBe("Ana Souza");
    expect(ok.campanha).toBe("instagram-bioscript");
    const desconhecido = schema.parse({ ...valida, comoConheceu: "TIKTOK", campanha: "" });
    expect(desconhecido.comoConheceu).toBeUndefined();
    expect(desconhecido.campanha).toBeUndefined();
    expect(() => schema.parse({ ...valida, indicadoPor: "x".repeat(81) })).toThrow();
  });

  it("calcula o funil das pré-matrículas, a conversão por canal e as paradas", async () => {
    const { calcularFunil } = await import("@/lib/solicitacoes-matricula");
    const agora = new Date("2026-11-24T12:00:00Z");
    const h = (horas: number) => new Date(agora.getTime() - horas * 3_600_000);
    const f = calcularFunil(
      [
        { tipo: "PRE_MATRICULA", status: "NOVA", comoConheceu: "INSTAGRAM", createdAt: h(30), primeiroContatoEm: null },
        { tipo: "PRE_MATRICULA", status: "NOVA", comoConheceu: null, createdAt: h(2), primeiroContatoEm: null },
        { tipo: "PRE_MATRICULA", status: "VISITA_AGENDADA", comoConheceu: "INDICACAO", createdAt: h(50), primeiroContatoEm: h(48) },
        { tipo: "PRE_MATRICULA", status: "MATRICULADO", comoConheceu: "INDICACAO", createdAt: h(100), primeiroContatoEm: h(96) },
        { tipo: "PRE_MATRICULA", status: "DESISTIU", comoConheceu: "INSTAGRAM", createdAt: h(80), primeiroContatoEm: null },
        { tipo: "REMATRICULA", status: "NOVA", comoConheceu: null, createdAt: h(90), primeiroContatoEm: null },
      ],
      agora,
    );
    expect(f.leads).toBe(5);
    expect(f.atendidos).toBe(2);
    expect(f.visitas).toBe(2);
    expect(f.matriculados).toBe(1);
    expect(f.desistencias).toBe(1);
    expect(f.semRetorno).toBe(1);
    expect(f.horasAtePrimeiroContato).toBe(3);
    expect(f.conversao).toBe(20);
    expect(f.canais[0]).toMatchObject({ canal: "INDICACAO", leads: 2, matriculados: 1 });
    expect(f.canais.find((c) => c.canal === "NAO_INFORMADO")?.rotulo).toBe("Não informado");
  });

  it("funil vazio não divide por zero", async () => {
    const { calcularFunil } = await import("@/lib/solicitacoes-matricula");
    expect(calcularFunil([])).toMatchObject({ leads: 0, conversao: null, horasAtePrimeiroContato: null, canais: [] });
  });
});
