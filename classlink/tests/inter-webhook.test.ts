import { describe, expect, it } from "vitest";
import { interpretarCallbackInter } from "@/lib/inter-webhook";

const aberto = { status: "PENDENTE" as const, nossoNumero: null, linhaDigitavel: null, pixCopiaCola: null };

describe("interpretarCallbackInter", () => {
  it("guarda linha digitável e Pix quando a emissão conclui", () => {
    const m = interpretarCallbackInter(
      { codigoSolicitacao: "c", situacao: "A_RECEBER", nossoNumero: "1", linhaDigitavel: "L", pixCopiaECola: "P" },
      aberto,
    );
    expect(m?.dados).toEqual({ nossoNumero: "1", linhaDigitavel: "L", pixCopiaCola: "P" });
    expect(m?.pagamentoConfirmado).toBe(false);
  });

  it("dá baixa com data e valor recebidos do banco (com juros/multa)", () => {
    const m = interpretarCallbackInter(
      { codigoSolicitacao: "c", situacao: "RECEBIDO", dataHoraSituacao: "2026-12-06T13:00:00Z", valorTotalRecebido: "1479.48" },
      aberto,
    );
    expect(m?.dados.status).toBe("PAGO");
    expect(m?.dados.valorPago).toBe(1479.48);
    expect(m?.dados.pagoEm?.toISOString()).toBe("2026-12-06T13:00:00.000Z");
    expect(m?.pagamentoConfirmado).toBe(true);
  });

  it("callback repetido de pagamento não muda nada", () => {
    const m = interpretarCallbackInter({ codigoSolicitacao: "c", situacao: "RECEBIDO" }, { ...aberto, status: "PAGO" });
    expect(m).toBeNull();
  });

  it("falha de emissão vira ERRO e cancelamento vira CANCELADO", () => {
    expect(interpretarCallbackInter({ codigoSolicitacao: "c", situacao: "FALHA_EMISSAO" }, aberto)?.dados.status).toBe("ERRO");
    expect(interpretarCallbackInter({ codigoSolicitacao: "c", situacao: "CANCELADO" }, aberto)?.dados.status).toBe("CANCELADO");
  });

  it("pago não volta atrás com callback de cancelamento", () => {
    expect(interpretarCallbackInter({ codigoSolicitacao: "c", situacao: "CANCELADO" }, { ...aberto, status: "PAGO" })).toBeNull();
  });

  it("atraso e expiração não mudam o status", () => {
    expect(interpretarCallbackInter({ codigoSolicitacao: "c", situacao: "ATRASADO" }, aberto)).toBeNull();
    expect(interpretarCallbackInter({ codigoSolicitacao: "c", situacao: "EXPIRADO" }, aberto)).toBeNull();
  });
});
