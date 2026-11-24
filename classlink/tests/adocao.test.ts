import { describe, expect, it } from "vitest";
import { ativoRecente, inicioSemana, mensagemAtivarAvisos, percentual, resumoAdocao, usoPorSemana } from "@/lib/adocao";

// Terça, 24/11/2026, 11h20 em Brasília.
const agora = new Date("2026-11-24T14:20:00Z");
const diasAtras = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);

describe("adoção do app pelas famílias", () => {
  it("conta como ativo só quem usou nos últimos 7 dias", () => {
    expect(ativoRecente(diasAtras(1), agora)).toBe(true);
    expect(ativoRecente(diasAtras(6.9), agora)).toBe(true);
    expect(ativoRecente(diasAtras(7), agora)).toBe(false);
    expect(ativoRecente(null, agora)).toBe(false);
  });

  it("conta por aluno: basta um responsável; pai e mãe do mesmo aluno não contam em dobro", () => {
    const responsaveis = [
      { id: "mae", primeiroAcesso: diasAtras(30), ultimoUso: diasAtras(2), notificacoesAtivas: true },
      { id: "pai", primeiroAcesso: diasAtras(20), ultimoUso: diasAtras(10), notificacoesAtivas: false },
      { id: "avo", primeiroAcesso: diasAtras(15), ultimoUso: diasAtras(9), notificacoesAtivas: false },
      { id: "nunca", primeiroAcesso: null, ultimoUso: null, notificacoesAtivas: false },
    ];
    const alunos = [
      { turma: "Maternal I", responsaveis: ["mae", "pai"] },
      { turma: "Maternal I", responsaveis: ["avo"] },
      { turma: "Pré II", responsaveis: ["nunca"] },
      { turma: null, responsaveis: [] },
    ];
    const r = resumoAdocao(responsaveis, alunos, agora);

    expect(r.responsaveis).toEqual({ total: 4, entraram: 3, ativos7d: 1, comAvisos: 1 });
    expect(r.alunos).toEqual({ total: 4, entraram: 2, ativos7d: 1, comAvisos: 1 });
    expect(r.turmas).toEqual([
      { turma: "Maternal I", total: 2, entraram: 2, ativos7d: 1, comAvisos: 1 },
      { turma: "Pré II", total: 1, entraram: 0, ativos7d: 0, comAvisos: 0 },
      { turma: "Sem turma", total: 1, entraram: 0, ativos7d: 0, comAvisos: 0 },
    ]);
  });

  it("ignora responsável vinculado que não está na lista (excluído/inativo)", () => {
    const r = resumoAdocao([], [{ turma: "Berçário", responsaveis: ["excluido"] }], agora);
    expect(r.alunos).toEqual({ total: 1, entraram: 0, ativos7d: 0, comAvisos: 0 });
  });

  it("semana começa na segunda, no horário de Brasília", () => {
    expect(inicioSemana(agora)).toBe("2026-11-23");
    // Segunda 23/11 às 01h de Brasília = 04h UTC: ainda segunda.
    expect(inicioSemana(new Date("2026-11-23T04:00:00Z"))).toBe("2026-11-23");
    // Segunda 23/11 às 02h UTC = domingo 22/11 23h em Brasília: semana anterior.
    expect(inicioSemana(new Date("2026-11-23T02:00:00Z"))).toBe("2026-11-16");
  });

  it("uso por semana conta responsáveis distintos e mantém semanas vazias", () => {
    const sessoes = [
      { userId: "a", createdAt: diasAtras(0) },
      { userId: "a", createdAt: diasAtras(0.5) },
      { userId: "b", createdAt: diasAtras(1) },
      { userId: "a", createdAt: diasAtras(8) },
      { userId: "c", createdAt: diasAtras(100) }, // fora da janela
    ];
    const s = usoPorSemana(sessoes, agora, 3);
    expect(s).toEqual([
      { semana: "2026-11-09", ativos: 0 },
      { semana: "2026-11-16", ativos: 1 },
      { semana: "2026-11-23", ativos: 2 },
    ]);
  });

  it("percentual sem base é zero", () => {
    expect(percentual(0, 0)).toBe(0);
    expect(percentual(10, 34)).toBe(29);
  });

  it("mensagem de ativar notificações usa o primeiro nome e o link do guia", () => {
    const m = mensagemAtivarAvisos("  Márcia Conceição ", "https://escola.app/guia#instalar");
    expect(m.startsWith("Olá, Márcia!")).toBe(true);
    expect(m).toContain("Ativar notificações");
    expect(m).toContain("https://escola.app/guia#instalar");
  });
});
