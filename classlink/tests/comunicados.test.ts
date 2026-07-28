import { describe, expect, it } from "vitest";
import { RESPOSTAS_PERMITIDAS } from "@/lib/comunicados";

describe("respostas permitidas por tipo de comunicado", () => {
  it("autorização de passeio permite autorizar ou não autorizar", () => {
    expect(RESPOSTAS_PERMITIDAS.AUTORIZACAO_PASSEIO).toEqual(["AUTORIZADO", "NAO_AUTORIZADO"]);
  });

  it("confirmação de reunião permite confirmar ou recusar presença", () => {
    expect(RESPOSTAS_PERMITIDAS.CONFIRMACAO_REUNIAO).toEqual(["CONFIRMADO", "NAO_COMPARECERA"]);
  });

  it("circular só permite confirmar leitura", () => {
    expect(RESPOSTAS_PERMITIDAS.CIRCULAR).toEqual(["LIDO"]);
  });

  it("nenhum tipo aceita PENDENTE_EXPIRADO como resposta manual", () => {
    for (const respostas of Object.values(RESPOSTAS_PERMITIDAS)) {
      expect(respostas).not.toContain("PENDENTE_EXPIRADO");
    }
  });
});
