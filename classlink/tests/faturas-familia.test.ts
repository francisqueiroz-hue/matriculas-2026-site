import { describe, expect, it } from "vitest";
import {
  abaDaFatura,
  agruparPorMes,
  anoInicial,
  anosDisponiveis,
  contarPorAba,
  prepararFaturas,
  rotuloMes,
  valorEstimadoComEncargos,
  type FaturaEntrada,
} from "@/lib/faturas-familia";

const hoje = new Date(2026, 10, 27, 10, 0, 0); // 27/11/2026
const b = (id: string, mes: string, status: FaturaEntrada["status"], extra: Partial<FaturaEntrada> = {}): FaturaEntrada => {
  const [a, m] = mes.split("-").map(Number);
  return {
    id,
    student: { id: "s1", name: "Ana" },
    mesReferencia: mes,
    valor: "1450.00",
    vencimento: new Date(a, m - 1, 5, 12).toISOString(),
    status,
    codigoSolicitacao: null,
    linhaDigitavel: null,
    pixCopiaCola: null,
    ...extra,
  };
};

describe("faturas da família", () => {
  it("classifica pendente vencido como atrasado pela data", () => {
    expect(abaDaFatura("PENDENTE", new Date(2026, 10, 5, 12), hoje)).toBe("ATRASADO");
    expect(abaDaFatura("PENDENTE", new Date(2026, 11, 5, 12), hoje)).toBe("ABERTO");
    expect(abaDaFatura("PENDENTE", new Date(2026, 10, 27, 12), hoje)).toBe("ABERTO"); // vence hoje
    expect(abaDaFatura("VENCIDO", new Date(2026, 11, 5, 12), hoje)).toBe("ATRASADO");
    expect(abaDaFatura("PAGO", new Date(2026, 9, 5, 12), hoje)).toBe("PAGO");
    expect(abaDaFatura("ERRO", new Date(2026, 11, 5, 12), hoje)).toBeNull();
    expect(abaDaFatura("CANCELADO", new Date(2026, 11, 5, 12), hoje)).toBeNull();
  });

  it("conta por aba e separa por ano", () => {
    const f = prepararFaturas(
      [b("1", "2026-10", "PAGO"), b("2", "2026-11", "PENDENTE"), b("3", "2026-12", "PENDENTE"), b("4", "2027-01", "PENDENTE")],
      hoje,
    );
    expect(anosDisponiveis(f)).toEqual([2027, 2026]);
    expect(contarPorAba(f.filter((x) => x.ano === 2026))).toEqual({ ABERTO: 1, ATRASADO: 1, PAGO: 1 });
  });

  it("só oferece pagar online boleto emitido no banco e ainda não pago", () => {
    const [emitido, naoEmitido, pago] = prepararFaturas(
      [
        b("1", "2026-12", "PENDENTE", { codigoSolicitacao: "abc", pixCopiaCola: "pix" }),
        b("2", "2026-12", "PENDENTE"),
        b("3", "2026-10", "PAGO", { codigoSolicitacao: "def" }),
      ],
      hoje,
    );
    expect(emitido.pagavelOnline).toBe(true);
    expect(naoEmitido.pagavelOnline).toBe(false);
    expect(pago.pagavelOnline).toBe(false);
  });

  it("escolhe o ano inicial", () => {
    expect(anoInicial([2027, 2026, 2025], hoje)).toBe(2026);
    expect(anoInicial([2027, 2025], hoje)).toBe(2025);
    expect(anoInicial([2028, 2027], hoje)).toBe(2027);
    expect(anoInicial([], hoje)).toBeNull();
  });

  it("agrupa por mês: em aberto do mais próximo, pago do mais recente", () => {
    const f = prepararFaturas([b("1", "2026-12", "PENDENTE"), b("2", "2027-01", "PENDENTE")], hoje);
    expect(agruparPorMes(f, "ABERTO").map((g) => g.rotulo)).toEqual(["Dezembro de 2026", "Janeiro de 2027"]);
    const p = prepararFaturas([b("1", "2026-09", "PAGO"), b("2", "2026-10", "PAGO")], hoje);
    expect(agruparPorMes(p, "PAGO").map((g) => g.chave)).toEqual(["2026-10", "2026-09"]);
    expect(rotuloMes("2026-03")).toBe("Março de 2026");
  });

  it("estima multa de 2% e juros de 1% a.m. pro rata (mesmo cálculo da conferência)", () => {
    // Caso real da conferência: R$ 1.450, 1 dia de atraso → 29,00 + 0,48
    const e = valorEstimadoComEncargos(1450, new Date(2026, 10, 5, 12), new Date(2026, 10, 6, 9));
    expect(e).toEqual({ dias: 1, multa: 29, juros: 0.48, total: 1479.48 });
    // 22 dias: 29,00 + 10,63
    const e22 = valorEstimadoComEncargos(1450, new Date(2026, 10, 5, 12), hoje);
    expect(e22.dias).toBe(22);
    expect(e22.total).toBe(1450 + 29 + 10.63);
    expect(valorEstimadoComEncargos(1450, new Date(2026, 11, 5, 12), hoje).total).toBe(1450);
  });
});
