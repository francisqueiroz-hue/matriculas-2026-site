import { describe, expect, it } from "vitest";
import { formatarDataHora, rotuloDiaRelativo } from "@/lib/datas";
import { alunosSemResposta, ordenarParaResponsavel, situacaoDoComunicado } from "@/lib/comunicados-situacao";
import { separarEventos } from "@/lib/agenda";

const agora = new Date(2026, 9, 8, 12, 0, 0); // 08/10/2026 12:00
const iso = (d: number, h = 9) => new Date(2026, 9, d, h, 0, 0).toISOString();

describe("formatarDataHora", () => {
  it("usa 'às' e não mostra segundos", () => {
    expect(formatarDataHora(new Date(2026, 8, 24, 12, 36, 45))).toBe("24/09/2026 às 12:36");
  });
});

describe("rotuloDiaRelativo", () => {
  it("hoje, amanhã ou nada", () => {
    expect(rotuloDiaRelativo(new Date(2026, 9, 8, 18), agora)).toBe("Hoje");
    expect(rotuloDiaRelativo(new Date(2026, 9, 9, 7), agora)).toBe("Amanhã");
    expect(rotuloDiaRelativo(new Date(2026, 9, 12, 7), agora)).toBeNull();
  });
});

describe("situação do comunicado para o responsável", () => {
  it("sem resposta e dentro do prazo = pendente", () => {
    expect(situacaoDoComunicado({ dataCriacao: iso(1), prazoResposta: iso(10), minhasRespostas: [], alunosAlvo: 1 }, agora)).toBe("PENDENTE");
  });

  it("sem prazo e sem resposta = pendente", () => {
    expect(situacaoDoComunicado({ dataCriacao: iso(1), prazoResposta: null, minhasRespostas: [] }, agora)).toBe("PENDENTE");
  });

  it("respondido para todos os filhos = respondido", () => {
    const c = {
      dataCriacao: iso(1),
      prazoResposta: iso(10),
      alunosAlvo: 2,
      minhasRespostas: [
        { alunoId: "a", resposta: "AUTORIZADO" },
        { alunoId: "b", resposta: "NAO_AUTORIZADO" },
      ],
    };
    expect(situacaoDoComunicado(c, agora)).toBe("RESPONDIDO");
  });

  it("irmãos: respondeu só por um = continua pendente", () => {
    const c = { dataCriacao: iso(1), prazoResposta: iso(10), alunosAlvo: 2, minhasRespostas: [{ alunoId: "a", resposta: "AUTORIZADO" }] };
    expect(situacaoDoComunicado(c, agora)).toBe("PENDENTE");
    expect(alunosSemResposta(c)).toBe(1);
  });

  it("prazo vencido sem resposta = encerrado", () => {
    expect(situacaoDoComunicado({ dataCriacao: iso(1), prazoResposta: iso(5), minhasRespostas: [] }, agora)).toBe("ENCERRADO");
  });

  it("registro automático de expiração não conta como resposta", () => {
    const c = { dataCriacao: iso(1), prazoResposta: iso(5), minhasRespostas: [{ alunoId: "a", resposta: "PENDENTE_EXPIRADO" }] };
    expect(situacaoDoComunicado(c, agora)).toBe("ENCERRADO");
  });
});

describe("ordenação dos comunicados", () => {
  it("pendentes primeiro (prazo mais próximo antes), depois os demais do mais recente", () => {
    const lista = [
      { id: "respondido-novo", dataCriacao: iso(7), prazoResposta: iso(20), minhasRespostas: [{ alunoId: "a", resposta: "LIDO" }] },
      { id: "pendente-sem-prazo", dataCriacao: iso(6), prazoResposta: null, minhasRespostas: [] },
      { id: "pendente-prazo-longe", dataCriacao: iso(5), prazoResposta: iso(25), minhasRespostas: [] },
      { id: "encerrado", dataCriacao: iso(2), prazoResposta: iso(3), minhasRespostas: [] },
      { id: "pendente-prazo-perto", dataCriacao: iso(1), prazoResposta: iso(9), minhasRespostas: [] },
    ];
    expect(ordenarParaResponsavel(lista, agora).map((c) => c.id)).toEqual([
      "pendente-prazo-perto",
      "pendente-prazo-longe",
      "pendente-sem-prazo",
      "respondido-novo",
      "encerrado",
    ]);
  });
});

describe("agenda: próximos e anteriores", () => {
  it("próximos em ordem crescente, anteriores do mais recente, evento em andamento conta como próximo", () => {
    const eventos = [
      { id: "passado-antigo", startsAt: iso(1), endsAt: null },
      { id: "futuro-longe", startsAt: iso(20), endsAt: null },
      { id: "passado-recente", startsAt: iso(7), endsAt: null },
      { id: "em-andamento", startsAt: iso(8, 8), endsAt: iso(8, 17) },
      { id: "futuro-perto", startsAt: iso(9), endsAt: null },
    ];
    const { proximos, anteriores } = separarEventos(eventos, agora);
    expect(proximos.map((e) => e.id)).toEqual(["em-andamento", "futuro-perto", "futuro-longe"]);
    expect(anteriores.map((e) => e.id)).toEqual(["passado-recente", "passado-antigo"]);
  });
});
