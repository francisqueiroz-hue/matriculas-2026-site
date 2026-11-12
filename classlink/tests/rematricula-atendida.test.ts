import { describe, expect, it } from "vitest";
import { rematriculaJaAtendida, type ContratoDoAno } from "@/lib/lembretes";

const contratos: ContratoDoAno[] = [
  { anoLetivo: 2027, alunoNome: "Eduardo Moratório", responsavelIds: ["resp-fernanda"] },
  { anoLetivo: 2027, alunoNome: "Zoe Silva", responsavelIds: ["resp-daiana"] },
  { anoLetivo: 2026, alunoNome: "Lisie Souza", responsavelIds: ["resp-gabrielly"] },
];
const sol = (over: Partial<Parameters<typeof rematriculaJaAtendida>[0]> = {}) => ({
  tipo: "REMATRICULA",
  anoLetivo: 2027,
  responsavelId: "resp-fernanda" as string | null,
  alunoNome: "Eduardo Moratório",
  ...over,
});

describe("rematriculaJaAtendida", () => {
  it("sai da lista quando a família já tem contrato do ano", () => {
    expect(rematriculaJaAtendida(sol(), contratos)).toBe(true);
  });

  it("vale para irmãos: basta um contrato de um dos alunos do responsável", () => {
    expect(rematriculaJaAtendida(sol({ responsavelId: "resp-daiana", alunoNome: "Ravi Silva, Zoe Silva" }), contratos)).toBe(true);
  });

  it("sem responsável logado, reconhece pelo nome do aluno (sem acento e caixa)", () => {
    expect(rematriculaJaAtendida(sol({ responsavelId: null, alunoNome: "eduardo  moratorio" }), contratos)).toBe(true);
  });

  it("continua pendente sem contrato do ano", () => {
    expect(rematriculaJaAtendida(sol({ responsavelId: "resp-gabrielly", alunoNome: "Lisie Souza" }), contratos)).toBe(false);
  });

  it("responsável logado sem contrato: aluno homônimo de outra família não conta", () => {
    expect(rematriculaJaAtendida(sol({ responsavelId: "resp-outra", alunoNome: "Eduardo Moratório" }), contratos)).toBe(false);
  });

    it("pré-matrícula nunca é afetada", () => {
    expect(rematriculaJaAtendida(sol({ tipo: "PRE_MATRICULA" }), contratos)).toBe(false);
  });
});
