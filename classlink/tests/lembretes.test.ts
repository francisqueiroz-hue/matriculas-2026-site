import { describe, expect, it } from "vitest";
import {
  CONFIG_PADRAO,
  diasCorridos,
  ehDomingo,
  mensagemLembrete,
  planejarLembretes,
  type Pendencia,
  type RegistroLembrete,
} from "@/lib/lembretes";

// Quarta-feira, 04/11/2026, 10h de Brasília (13h UTC) — horário do cron.
const AGORA = new Date("2026-11-04T13:00:00Z");
const diasAtras = (n: number, hora = "13:00") => new Date(new Date(`2026-11-04T${hora}:00Z`).getTime() - n * 86_400_000);
const config = { ...CONFIG_PADRAO, ativos: true };

function pendencia(over: Partial<Pendencia> = {}): Pendencia {
  return {
    tipo: "CONTRATO",
    referenciaId: "c1",
    responsavelId: "mae",
    desde: diasAtras(5),
    aluno: "Ana Souza",
    descricao: "assinar o contrato de matrícula 2027 de Ana",
    url: "/dashboard/contratos",
    ...over,
  };
}

function registro(over: Partial<RegistroLembrete> = {}): RegistroLembrete {
  return { tipo: "CONTRATO", referenciaId: "c1", responsavelId: "mae", pendenteDesde: diasAtras(5), envios: 0, ultimoEnvioEm: null, resolvidoEm: null, ...over };
}

describe("dias no calendário de Brasília", () => {
  it("conta dias de calendário, não blocos de 24h", () => {
    // Criado segunda às 23h de Brasília (02h UTC de terça); quinta 10h = 3 dias.
    expect(diasCorridos(new Date("2026-11-03T02:00:00Z"), new Date("2026-11-05T13:00:00Z"))).toBe(3);
    // Cron atrasado alguns minutos não muda a contagem.
    expect(diasCorridos(diasAtras(3, "13:20"), AGORA)).toBe(3);
  });

  it("reconhece domingo no fuso da escola", () => {
    expect(ehDomingo(new Date("2026-11-08T13:00:00Z"))).toBe(true);
    // Domingo 23h em Brasília já é segunda em UTC: continua domingo.
    expect(ehDomingo(new Date("2026-11-09T02:00:00Z"))).toBe(true);
    expect(ehDomingo(AGORA)).toBe(false);
  });
});

describe("planejarLembretes", () => {
  it("1º lembrete só depois dos dias iniciais", () => {
    const cedo = planejarLembretes([pendencia({ desde: diasAtras(2) })], [], config, AGORA);
    expect(cedo.envios).toHaveLength(0);
    expect(cedo.avaliadas[0].situacao).toBe("AGUARDANDO_PRAZO");

    const pronto = planejarLembretes([pendencia({ desde: diasAtras(3) })], [], config, AGORA);
    expect(pronto.envios).toHaveLength(1);
    expect(pronto.avaliadas[0].situacao).toBe("PRONTA");
  });

  it("junta todas as pendências da família numa mensagem só", () => {
    const plano = planejarLembretes(
      [
        pendencia(),
        pendencia({ tipo: "BOLETO", referenciaId: "b1", descricao: "pagar a mensalidade de Ana" }),
        pendencia({ tipo: "COMUNICADO", referenciaId: "k1:ana", descricao: "responder a autorização" }),
        pendencia({ responsavelId: "pai" }),
      ],
      [],
      config,
      AGORA,
    );
    expect(plano.envios).toHaveLength(2);
    expect(plano.envios.find((e) => e.responsavelId === "mae")?.pendencias).toHaveLength(3);
  });

  it("respeita o intervalo da família, inclusive por pendência já resolvida", () => {
    const registros = [
      registro({ tipo: "BOLETO", referenciaId: "b-antigo", envios: 1, ultimoEnvioEm: diasAtras(1), resolvidoEm: diasAtras(0) }),
    ];
    const plano = planejarLembretes([pendencia()], registros, config, AGORA);
    expect(plano.envios).toHaveLength(0);
    expect(plano.avaliadas[0].situacao).toBe("AGUARDANDO_INTERVALO");

    const depois = planejarLembretes(
      [pendencia()],
      [registro({ envios: 1, ultimoEnvioEm: diasAtras(3) })],
      config,
      AGORA,
    );
    expect(depois.envios).toHaveLength(1);
  });

  it("para no limite de envios", () => {
    const plano = planejarLembretes([pendencia()], [registro({ envios: 4, ultimoEnvioEm: diasAtras(10) })], config, AGORA);
    expect(plano.envios).toHaveLength(0);
    expect(plano.avaliadas[0].situacao).toBe("LIMITE_ATINGIDO");
    expect(plano.avaliadas[0].proximoEm).toBeNull();
  });

  it("marca como resolvido o que deixou de estar pendente e não lembra mais", () => {
    const plano = planejarLembretes([], [registro({ envios: 2, ultimoEnvioEm: diasAtras(3) })], config, AGORA);
    expect(plano.envios).toHaveLength(0);
    expect(plano.resolvidos).toHaveLength(1);
  });

  it("não marca como resolvido um tipo que foi desligado", () => {
    const plano = planejarLembretes([], [registro()], { ...config, tipos: ["BOLETO"] }, AGORA);
    expect(plano.resolvidos).toHaveLength(0);
  });

  it("ignora tipos desligados e pendências repetidas", () => {
    const plano = planejarLembretes([pendencia(), pendencia(), pendencia({ tipo: "BOLETO", referenciaId: "b1" })], [], { ...config, tipos: ["CONTRATO"] }, AGORA);
    expect(plano.avaliadas).toHaveLength(1);
  });

  it("pendência que volta (contrato devolvido) recomeça a contagem", () => {
    const registros = [registro({ envios: 4, ultimoEnvioEm: diasAtras(9), resolvidoEm: diasAtras(1) })];
    const plano = planejarLembretes([pendencia({ desde: diasAtras(30) })], registros, config, AGORA);
    const [a] = plano.avaliadas;
    expect(a.envios).toBe(0);
    expect(a.diasPendente).toBe(1);
    expect(a.situacao).toBe("AGUARDANDO_PRAZO");
  });

  it("rematrícula sem data conta a partir da 1ª vez que foi vista", () => {
    const nova = planejarLembretes([pendencia({ tipo: "REMATRICULA", desde: null })], [], config, AGORA);
    expect(nova.avaliadas[0].diasPendente).toBe(0);
    const vista = planejarLembretes(
      [pendencia({ tipo: "REMATRICULA", desde: null })],
      [registro({ tipo: "REMATRICULA", pendenteDesde: diasAtras(3) })],
      config,
      AGORA,
    );
    expect(vista.envios).toHaveLength(1);
  });

  it("sequência completa: dias 3, 6, 9 e 12 e depois para", () => {
    const enviados: number[] = [];
    let reg: RegistroLembrete = registro({ pendenteDesde: new Date("2026-11-02T13:00:00Z") });
    for (let dia = 0; dia <= 20; dia++) {
      const agora = new Date(new Date("2026-11-02T13:00:00Z").getTime() + dia * 86_400_000);
      const plano = planejarLembretes([pendencia({ desde: reg.pendenteDesde })], [reg], config, agora);
      if (plano.envios.length > 0) {
        enviados.push(dia);
        reg = { ...reg, envios: reg.envios + 1, ultimoEnvioEm: agora };
      }
    }
    expect(enviados).toEqual([3, 6, 9, 12]);
  });
});

describe("mensagemLembrete", () => {
  it("uma pendência: link direto para a tela certa", () => {
    const m = mensagemLembrete([{ descricao: "assinar o contrato de matrícula 2027 de Ana", url: "/dashboard/contratos" }]);
    expect(m.texto).toContain("Ainda falta assinar o contrato");
    expect(m.url).toBe("/dashboard/contratos");
  });

  it("várias pendências: lista tudo e abre o início do app, sem valores em dinheiro", () => {
    const m = mensagemLembrete([
      { descricao: "assinar o contrato de Ana", url: "/dashboard/contratos" },
      { descricao: "pagar a mensalidade de Ana, com vencimento em 05/12/2026", url: "/dashboard/financeiro" },
      { descricao: "confirmar a rematrícula 2027 de Ana", url: "/dashboard" },
    ]);
    expect(m.titulo).toContain("3 pendências");
    expect(m.texto).toContain("assinar o contrato de Ana; pagar a mensalidade");
    expect(m.texto).toContain(" e confirmar a rematrícula");
    expect(m.texto).not.toMatch(/R\$/);
    expect(m.url).toBe("/dashboard");
  });
});

describe("mensalidade: véspera, dia seguinte e a cada 3 dias", () => {
  const VENC = new Date("2026-12-05T15:00:00Z"); // sábado, 05/12/2026
  const dia = (d: number) => new Date(Date.UTC(2026, 11, d, 15, 0, 0)); // 12h de Brasília
  const boleto = (over: Partial<Pendencia> = {}) =>
    pendencia({ tipo: "BOLETO", referenciaId: "b1", desde: new Date("2026-12-01T07:00:00Z"), vencimento: VENC, ...over });

  it("sem pagamento: 04/12, 06/12 cai no domingo → 07/12, 10/12, 13/12 é domingo → 14/12, e para no limite", () => {
    const enviados: number[] = [];
    let reg: RegistroLembrete = registro({ tipo: "BOLETO", referenciaId: "b1", pendenteDesde: new Date("2026-12-01T07:00:00Z") });
    for (let d = 1; d <= 31; d++) {
      const agora = dia(d);
      if (ehDomingo(agora)) continue; // o cron não envia aos domingos
      const plano = planejarLembretes([boleto()], [reg], config, agora);
      if (plano.envios.length > 0) {
        enviados.push(d);
        reg = { ...reg, envios: reg.envios + 1, ultimoEnvioEm: agora };
      }
    }
    expect(enviados).toEqual([4, 7, 10, 14]);
  });

  it("vencimento na segunda: a véspera cairia no domingo e sai no sábado", () => {
    const segunda = new Date("2027-01-04T15:00:00Z");
    const sabado = new Date("2027-01-02T15:00:00Z");
    const sexta = new Date("2027-01-01T15:00:00Z");
    expect(planejarLembretes([boleto({ vencimento: segunda })], [], config, sexta).envios).toHaveLength(0);
    expect(planejarLembretes([boleto({ vencimento: segunda })], [], config, sabado).envios).toHaveLength(1);
  });

  it("no dia do vencimento não envia; boleto lançado depois da véspera só recebe o aviso de atraso", () => {
    expect(planejarLembretes([boleto()], [], config, dia(5)).envios).toHaveLength(0);
    expect(planejarLembretes([boleto()], [], config, dia(7)).envios).toHaveLength(1);
  });

  it("a mensalidade não espera o intervalo da família (tem data certa) e leva junto o que estiver pronto", () => {
    const registros = [registro({ tipo: "CONTRATO", referenciaId: "c9", envios: 1, ultimoEnvioEm: dia(3) })];
    const plano = planejarLembretes([boleto(), pendencia({ referenciaId: "c9", desde: dia(1) })], registros, config, dia(4));
    expect(plano.envios).toHaveLength(1);
    expect(plano.envios[0].pendencias.map((p) => p.tipo)).toEqual(["BOLETO"]);
  });

  it("paga: some da lista e não é mais lembrada", () => {
    const plano = planejarLembretes([], [registro({ tipo: "BOLETO", referenciaId: "b1", envios: 1, ultimoEnvioEm: dia(4) })], config, dia(7));
    expect(plano.envios).toHaveLength(0);
    expect(plano.resolvidos).toHaveLength(1);
  });
});
