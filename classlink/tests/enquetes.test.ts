import { describe, expect, it } from "vitest";
import {
  agregarResultados,
  detalhesLiberados,
  enqueteAberta,
  MINIMO_RESPOSTAS_ANONIMAS,
  normalizarOpcoesPergunta,
  validarRespostas,
  type PerguntaEnquete,
} from "@/lib/enquetes";
import { ErroDeUsuario } from "@/lib/erros";

const perguntas: PerguntaEnquete[] = [
  { id: "n", tipo: "NOTA", texto: "Como avalia a escola?", obrigatoria: true, opcoes: { max: 5 } },
  { id: "e", tipo: "ESCOLHA", texto: "Melhor horário?", obrigatoria: true, opcoes: { escolhas: ["Manhã", "Tarde"] } },
  { id: "s", tipo: "SIM_NAO", texto: "Recomendaria?", obrigatoria: false, opcoes: null },
  { id: "t", tipo: "TEXTO", texto: "Comentários", obrigatoria: false, opcoes: null },
];

describe("validação das respostas", () => {
  it("aceita respostas válidas e ignora opcionais em branco", () => {
    const itens = validarRespostas(perguntas, { n: 4, e: "Tarde", s: "", t: "  " });
    expect(itens).toEqual([
      { perguntaId: "n", numero: 4, texto: null },
      { perguntaId: "e", numero: null, texto: "Tarde" },
    ]);
  });

  it("recusa pergunta obrigatória sem resposta", () => {
    expect(() => validarRespostas(perguntas, { e: "Tarde" })).toThrow(ErroDeUsuario);
  });

  it("recusa nota fora de 1–5, fracionada ou em texto", () => {
    for (const n of [0, 6, 2.5, "3"]) expect(() => validarRespostas(perguntas, { n, e: "Tarde" })).toThrow(ErroDeUsuario);
  });

  it("recusa escolha que não está nas opções e Sim/Não inválido", () => {
    expect(() => validarRespostas(perguntas, { n: 3, e: "Noite" })).toThrow(ErroDeUsuario);
    expect(() => validarRespostas(perguntas, { n: 3, e: "Tarde", s: "talvez" })).toThrow(ErroDeUsuario);
  });

  it("recusa resposta a pergunta que não existe na enquete", () => {
    expect(() => validarRespostas(perguntas, { n: 3, e: "Tarde", zzz: 1 })).toThrow(ErroDeUsuario);
  });

  it("recusa texto acima do limite", () => {
    expect(() => validarRespostas(perguntas, { n: 3, e: "Tarde", t: "x".repeat(2001) })).toThrow(ErroDeUsuario);
  });
});

describe("criação de perguntas", () => {
  it("múltipla escolha exige 2 a 10 opções sem repetir", () => {
    expect(() => normalizarOpcoesPergunta("ESCOLHA", { escolhas: ["Só uma"] })).toThrow(ErroDeUsuario);
    expect(() => normalizarOpcoesPergunta("ESCOLHA", { escolhas: ["A", "a"] })).toThrow(ErroDeUsuario);
    expect(() => normalizarOpcoesPergunta("ESCOLHA", { escolhas: Array.from({ length: 11 }, (_, i) => `o${i}`) })).toThrow(ErroDeUsuario);
    expect(normalizarOpcoesPergunta("ESCOLHA", { escolhas: [" A ", "B"] })).toEqual({ escolhas: ["A", "B"] });
  });

  it("tipo desconhecido é recusado", () => {
    expect(() => normalizarOpcoesPergunta("EMOJI", null)).toThrow(ErroDeUsuario);
    expect(() => normalizarOpcoesPergunta("toString", null)).toThrow(ErroDeUsuario);
  });
});

describe("resultados", () => {
  it("calcula média e distribuição de notas, escolhas, sim/não e lista textos", () => {
    const itens = [
      { perguntaId: "n", numero: 5, texto: null },
      { perguntaId: "n", numero: 4, texto: null },
      { perguntaId: "n", numero: 3, texto: null },
      { perguntaId: "e", numero: null, texto: "Manhã" },
      { perguntaId: "e", numero: null, texto: "Manhã" },
      { perguntaId: "s", numero: null, texto: "Sim" },
      { perguntaId: "t", numero: null, texto: "Ótimo" },
    ];
    const r = agregarResultados(perguntas, itens);
    expect(r[0].media).toBe(4);
    expect(r[0].distribuicao?.map((d) => d.total)).toEqual([0, 0, 1, 1, 1]);
    expect(r[1].distribuicao).toEqual([{ valor: "Manhã", total: 2 }, { valor: "Tarde", total: 0 }]);
    expect(r[2].distribuicao).toEqual([{ valor: "Sim", total: 1 }, { valor: "Não", total: 0 }]);
    expect(r[3].textos).toEqual(["Ótimo"]);
  });

  it("sem respostas: média 0, sem quebrar", () => {
    expect(agregarResultados(perguntas, [])[0].media).toBe(0);
  });
});

describe("anonimato e prazo", () => {
  it("enquete anônima só libera detalhes a partir do mínimo de respostas", () => {
    expect(detalhesLiberados(true, MINIMO_RESPOSTAS_ANONIMAS - 1)).toBe(false);
    expect(detalhesLiberados(true, MINIMO_RESPOSTAS_ANONIMAS)).toBe(true);
    expect(detalhesLiberados(false, 1)).toBe(true);
  });

  it("aberta até o prazo; encerrada manualmente fecha", () => {
    const agora = new Date("2026-10-14T12:00:00Z");
    expect(enqueteAberta({ encerradaEm: null, prazo: null }, agora)).toBe(true);
    expect(enqueteAberta({ encerradaEm: null, prazo: new Date("2026-10-15T00:00:00Z") }, agora)).toBe(true);
    expect(enqueteAberta({ encerradaEm: null, prazo: new Date("2026-10-13T00:00:00Z") }, agora)).toBe(false);
    expect(enqueteAberta({ encerradaEm: new Date(), prazo: null }, agora)).toBe(false);
  });
});
