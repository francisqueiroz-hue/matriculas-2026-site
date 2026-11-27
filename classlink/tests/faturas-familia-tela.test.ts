// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Faturas } from "@/app/dashboard/financeiro/Faturas";
import type { FaturaEntrada } from "@/lib/faturas-familia";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => createElement("a", { href }, children as never) }));

const b = (id: string, mes: string, status: FaturaEntrada["status"], extra: Partial<FaturaEntrada> = {}): FaturaEntrada => {
  const [a, m] = mes.split("-").map(Number);
  return {
    id,
    student: { id: "s1", name: "Ana Souza" },
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 27, 10));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("tela Faturas da família", () => {
  it("abre no atrasado, mostra aviso, estimativa e contagem por aba", () => {
    render(
      createElement(Faturas, {
        boletos: [b("1", "2026-10", "PAGO", { pagoEm: new Date(2026, 9, 5, 12).toISOString() }), b("2", "2026-11", "PENDENTE"), b("3", "2026-12", "PENDENTE")],
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain("1 mensalidade em atraso");
    expect(screen.getByRole("tab", { name: /Atrasado/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Novembro de 2026")).toBeTruthy();
    expect(screen.getByText(/1\.489,63/)).toBeTruthy();
    // Não emitido no banco: sem botão Pagar
    expect(screen.queryByText(/Pagar/)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Pago/ }));
    expect(screen.getByText("Outubro de 2026")).toBeTruthy();
    expect(screen.getByText("Pago em")).toBeTruthy();
  });

  it("boleto emitido no banco tem Pagar com Pix, linha digitável e PDF", () => {
    render(createElement(Faturas, { boletos: [b("9", "2026-12", "PENDENTE", { codigoSolicitacao: "x", pixCopiaCola: "000201", linhaDigitavel: "0779" })] }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Copiar código Pix")).toBeTruthy();
    expect(screen.getByText("Copiar linha digitável")).toBeTruthy();
    expect(screen.getByText("Abrir boleto em PDF").getAttribute("href")).toBe("/api/billing/boletos/9/pdf");
  });

  it("não mostra boleto com erro de emissão nem cancelado", () => {
    render(createElement(Faturas, { boletos: [b("1", "2026-12", "ERRO"), b("2", "2026-12", "CANCELADO")] }));
    expect(screen.getByText("Nenhuma fatura emitida ainda.")).toBeTruthy();
  });
});
