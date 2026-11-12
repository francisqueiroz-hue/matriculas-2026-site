import { describe, expect, it } from "vitest";
import {
  anoLetivoPadrao,
  atualizarDocumentoSchema,
  dadosDaAtualizacao,
  DOCUMENTOS_EXIGIDOS,
  documentosFaltantes,
  etapaDaFicha,
  mensagemDocumentosFaltantes,
  montarChecklist,
  registrarConsentimentoSchema,
  resumoDocumentos,
  tiposVisiveis,
} from "@/lib/ficha-matricula";

describe("ficha da matrícula — documentos", () => {
  it("laudo só aparece para a direção", () => {
    expect(tiposVisiveis("ADMIN")).toContain("LAUDO");
    expect(tiposVisiveis("STAFF")).not.toContain("LAUDO");
    expect(montarChecklist([], "STAFF").map((i) => i.tipo)).not.toContain("LAUDO");
  });

  it("monta um item por tipo, com o registro salvo quando existe, e marca prazo vencido", () => {
    const agora = new Date("2027-03-10T12:00:00Z");
    const itens = montarChecklist(
      [
        { id: "d1", tipo: "CERTIDAO_NASCIMENTO", recebido: true, recebidoEm: new Date("2027-02-01T12:00:00Z"), prazo: null, observacao: "cópia" },
        { id: "d2", tipo: "VACINACAO", recebido: false, recebidoEm: null, prazo: new Date("2027-03-01T12:00:00Z"), observacao: null },
        { id: "d3", tipo: "LAUDO", recebido: false, recebidoEm: null, prazo: new Date("2027-03-01T12:00:00Z"), observacao: null },
      ],
      "ADMIN",
      "EI",
      agora,
    );
    expect(itens).toHaveLength(6); // 5 exigidos da educação infantil + laudo
    expect(itens.find((i) => i.tipo === "CERTIDAO_NASCIMENTO")).toMatchObject({ recebido: true, observacao: "cópia", atrasado: false });
    expect(itens.find((i) => i.tipo === "VACINACAO")?.atrasado).toBe(true);
    // Laudo é voluntário: nunca "atrasado".
    expect(itens.find((i) => i.tipo === "LAUDO")).toMatchObject({ voluntario: true, atrasado: false });
    expect(itens.find((i) => i.tipo === "ATESTADO_MEDICO")).toMatchObject({ recebido: false, prazo: null });
  });

  it("resumo: 5 exigidos na educação infantil, 6 no fundamental — laudo e CPF antigo não entram", () => {
    const registros = [
      { tipo: "CPF" as const, recebido: true },
      { tipo: "LAUDO" as const, recebido: true },
      { tipo: "VACINACAO" as const, recebido: true },
    ];
    expect(resumoDocumentos(registros, "EI")).toEqual({ entregues: 1, exigidos: 5, pendentes: 4 });
    expect(resumoDocumentos(registros, "EF1")).toEqual({ entregues: 1, exigidos: 6, pendentes: 5 });
  });

  it("lista configurada: fundamental = infantil + histórico escolar da escola anterior", () => {
    expect(DOCUMENTOS_EXIGIDOS.EI).toEqual(["CERTIDAO_NASCIMENTO", "VACINACAO", "COMPROVANTE_RESIDENCIA", "IDENTIDADE_RESPONSAVEL", "ATESTADO_MEDICO"]);
    expect(DOCUMENTOS_EXIGIDOS.EF1).toEqual([...DOCUMENTOS_EXIGIDOS.EI, "HISTORICO_ESCOLAR"]);
  });

  it("etapa: contrato do ano, senão nome da turma", () => {
    expect(etapaDaFicha("Maternal II", undefined)).toBe("EI");
    expect(etapaDaFicha("3º Ano A", undefined)).toBe("EF1");
    expect(etapaDaFicha("Pré II", "EF1")).toBe("EF1");
    expect(etapaDaFicha("2º Ano", "EI")).toBe("EI");
    expect(etapaDaFicha(null, "lixo")).toBe("EI");
  });

  it("aviso lista só os faltantes", () => {
    const faltam = documentosFaltantes([{ tipo: "VACINACAO", recebido: true }, { tipo: "CERTIDAO_NASCIMENTO", recebido: false }], "EF1");
    expect(faltam).toEqual(["CERTIDAO_NASCIMENTO", "COMPROVANTE_RESIDENCIA", "IDENTIDADE_RESPONSAVEL", "ATESTADO_MEDICO", "HISTORICO_ESCOLAR"]);
    const m = mensagemDocumentosFaltantes("Ravi Silva", 2027, faltam);
    expect(m.titulo).toBe("Documentos pendentes de Ravi");
    expect(m.whatsapp).toContain("*Ravi Silva*");
    expect(m.whatsapp).toContain("• Histórico escolar da escola anterior");
    expect(m.texto).not.toContain("Caderneta");
  });

  it("recebidoEm acompanha a marcação e não muda ao salvar de novo", () => {
    const agora = new Date("2027-02-10T12:00:00Z");
    const antes = new Date("2027-02-01T12:00:00Z");
    const base = { anoLetivo: 2027, tipo: "CPF" as const };
    expect(dadosDaAtualizacao({ ...base, recebido: true }, null, agora)).toEqual({ recebido: true, recebidoEm: agora });
    expect(dadosDaAtualizacao({ ...base, recebido: true }, { recebido: true, recebidoEm: antes }, agora).recebidoEm).toBe(antes);
    expect(dadosDaAtualizacao({ ...base, recebido: false }, { recebido: true, recebidoEm: antes }, agora)).toEqual({ recebido: false, recebidoEm: null });
    // Só observação: não mexe no recebido.
    expect(dadosDaAtualizacao({ ...base, observacao: "ok" }, null, agora)).toEqual({ observacao: "ok" });
  });

  it("valida entradas", () => {
    expect(atualizarDocumentoSchema.safeParse({ anoLetivo: 2027, tipo: "RG" }).success).toBe(false);
    expect(atualizarDocumentoSchema.safeParse({ anoLetivo: 1999, tipo: "CPF" }).success).toBe(false);
    expect(atualizarDocumentoSchema.safeParse({ anoLetivo: 2027, tipo: "CPF", prazo: "31/02/2027" }).success).toBe(false);
    expect(atualizarDocumentoSchema.safeParse({ anoLetivo: 2027, tipo: "CPF", observacao: "x".repeat(501) }).success).toBe(false);
    const ok = atualizarDocumentoSchema.parse({ anoLetivo: "2027", tipo: "CPF", prazo: "2027-03-01", observacao: "" });
    expect(ok.anoLetivo).toBe(2027);
    expect(ok.prazo?.toISOString()).toBe("2027-03-01T15:00:00.000Z");
    expect(ok.observacao).toBeNull();
    expect(atualizarDocumentoSchema.parse({ anoLetivo: 2027, tipo: "CPF", prazo: "" }).prazo).toBeNull();
  });

  it("ano letivo padrão: ano da turma ou o ano corrente", () => {
    expect(anoLetivoPadrao(2027)).toBe(2027);
    expect(anoLetivoPadrao(null, new Date("2026-12-31T23:30:00-03:00"))).toBe(2026);
  });
});

describe("ficha da matrícula — consentimentos", () => {
  it("exige finalidade válida, versão e quem consentiu", () => {
    expect(registrarConsentimentoSchema.safeParse({ finalidade: "USO_DE_IMAGEM", versaoTexto: "v1", consentidoPorId: "g1" }).success).toBe(true);
    expect(registrarConsentimentoSchema.safeParse({ finalidade: "USO_DE_IMAGEM", versaoTexto: "v1", consentidoPorNome: "Maria Souza" }).success).toBe(true);
    expect(registrarConsentimentoSchema.safeParse({ finalidade: "USO_DE_IMAGEM", versaoTexto: "v1" }).success).toBe(false);
    expect(registrarConsentimentoSchema.safeParse({ finalidade: "MARKETING", versaoTexto: "v1", consentidoPorId: "g1" }).success).toBe(false);
    expect(registrarConsentimentoSchema.safeParse({ finalidade: "USO_DE_IMAGEM", versaoTexto: " ", consentidoPorId: "g1" }).success).toBe(false);
  });
});
