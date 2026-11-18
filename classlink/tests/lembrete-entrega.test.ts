import { describe, expect, it } from "vitest";
import { situacaoEntrega } from "@/lib/lembrete-entrega";
import { horarioDoStatus } from "@/lib/whatsapp-falhas";

const AGORA = new Date("2026-11-18T15:00:00Z");
const r = (status: string | null, em: Date | null, falha: string | null = null) => ({ ultimoEnvioStatus: status, ultimoEnvioStatusEm: em, ultimoEnvioFalha: falha });

describe("situacaoEntrega (Gestão › Lembretes)", () => {
  it("sem registro ou enviado pelo app: nada a mostrar", () => {
    expect(situacaoEntrega(undefined, AGORA)).toBeNull();
    expect(situacaoEntrega(r(null, null), AGORA)).toBeNull();
    expect(situacaoEntrega(r("QUALQUER", AGORA), AGORA)).toBeNull();
  });

  it("enviado há menos de 24 h: aguardando, sem alerta", () => {
    const s = situacaoEntrega(r("ENVIADO", new Date("2026-11-18T12:00:00Z")), AGORA);
    expect(s).toMatchObject({ status: "ENVIADO", semConfirmacao: false });
  });

  it("enviado há mais de 24 h sem confirmação: alerta", () => {
    const s = situacaoEntrega(r("ENVIADO", new Date("2026-11-17T14:00:00Z")), AGORA);
    expect(s).toMatchObject({ status: "ENVIADO", semConfirmacao: true });
  });

  it("entregue ou lido nunca alertam, mesmo antigos", () => {
    expect(situacaoEntrega(r("ENTREGUE", new Date("2026-11-10T14:00:00Z")), AGORA)?.semConfirmacao).toBe(false);
    expect(situacaoEntrega(r("LIDO", new Date("2026-11-10T14:00:00Z")), AGORA)?.status).toBe("LIDO");
  });

  it("falhou: traz o motivo", () => {
    const s = situacaoEntrega(r("FALHOU", AGORA, "Número sem WhatsApp."), AGORA);
    expect(s).toEqual({ status: "FALHOU", em: AGORA.toISOString(), motivo: "Número sem WhatsApp.", semConfirmacao: false });
  });
});

describe("horarioDoStatus", () => {
  it("usa o horário da Meta em segundos", () => {
    expect(horarioDoStatus("1763480460", AGORA)).toEqual(new Date(1763480460 * 1000));
  });
  it("sem horário ou no futuro: agora", () => {
    expect(horarioDoStatus(undefined, AGORA)).toEqual(AGORA);
    expect(horarioDoStatus("abc", AGORA)).toEqual(AGORA);
    expect(horarioDoStatus("9999999999", AGORA)).toEqual(AGORA);
  });
});
