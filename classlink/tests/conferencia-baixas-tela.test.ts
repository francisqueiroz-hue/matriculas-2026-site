// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/AdminGuard", () => ({ AdminGuard: ({ children }: { children: unknown }) => children }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => createElement("a", { href }, children as never) }));

const linha = (id: string, aluno: string, extra: object = {}) => ({
  id,
  aluno,
  turma: "Infantil 3",
  responsavel: "Carla",
  mesReferencia: "2026-10",
  vencimento: "2026-10-05T12:00:00.000Z",
  valor: 1200,
  valorPago: 1200,
  mensalidadeCadastro: 1200,
  diferenca: 0,
  pagoEm: "2026-10-05T12:00:00.000Z",
  manual: true,
  baixaPor: "Secretaria",
  baixaEm: "2026-10-06T15:00:00.000Z",
  correcoes: 0,
  ultimaCorrecao: null,
  alertas: [],
  ...extra,
});

const apiJson = vi.fn(async (path: string, init?: RequestInit) => {
  void init;
  if (path.startsWith("/api/admin/billing/conferencia")) {
    return {
      de: "2026-01",
      ate: "2026-11",
      truncado: false,
      totais: { quantidade: 2, valorBoletos: 2400, valorRecebido: 2350, comAlerta: 1, semValorInformado: 0 },
      itens: [
        linha("b1", "Bia Souza", { valorPago: 1150, diferenca: -50, alertas: [{ codigo: "PAGO_DIFERENTE", texto: "Recebido a menos: R$ 50,00" }] }),
        linha("b2", "Caio Lima"),
        linha("b3", "Pedro Alves", {
          valor: 1450,
          valorPago: 1479.48,
          diferenca: 29.48,
          vencimento: "2026-11-05T12:00:00.000Z",
          pagoEm: "2026-11-06T12:00:00.000Z",
          encargos: { diasAtraso: 1, cobrado: 29.48, multa: 29, juros: 0.48, previsto: 29.48 },
        }),
      ],
    };
  }
  return {};
});
vi.mock("@/lib/api-client", () => ({ apiJson: (path: string, init?: RequestInit) => apiJson(path, init) }));

const { default: Pagina } = await import("@/app/dashboard/admin/financeiro/conferencia/page");

afterEach(cleanup);

describe("tela Conferir boletos pagos", () => {
  it("mostra as baixas, o alerta e filtra só as que precisam de conferência", async () => {
    await act(async () => {
      render(createElement(Pagina));
    });
    expect(screen.getByText("Bia Souza")).toBeTruthy();
    expect(screen.getByText("Caio Lima")).toBeTruthy();
    expect(screen.getByText("Recebido a menos: R$ 50,00")).toBeTruthy();
    expect(screen.getByText("Precisam de conferência")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Só os que precisam de conferência"));
    expect(screen.queryByText("Caio Lima")).toBeNull();
    expect(screen.getByText("Bia Souza")).toBeTruthy();
  });

  it("pago com atraso: mostra juros/multa, sem pedir conferência", async () => {
    await act(async () => {
      render(createElement(Pagina));
    });
    expect(screen.getByText(/Juros\/multa por atraso: R\$\s?29,48/)).toBeTruthy();
    expect(screen.queryByText(/Recebido a mais/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Só os que precisam de conferência"));
    expect(screen.queryByText("Pedro Alves")).toBeNull();
  });

  it("ao corrigir, mostra a multa e os juros do contrato para a data de pagamento", async () => {
    await act(async () => {
      render(createElement(Pagina));
    });
    fireEvent.click(screen.getAllByText("Corrigir valor ou data")[2]);
    const dica = screen.getByText(/Pago 1 dia\(s\) depois do vencimento/).textContent ?? "";
    expect(dica).toMatch(/29,00/);
    expect(dica).toMatch(/0,48/);
    expect(dica).toMatch(/1\.479,48/);
  });

  it("corrige com motivo e envia ao servidor", async () => {
    await act(async () => {
      render(createElement(Pagina));
    });
    fireEvent.click(screen.getAllByText("Corrigir valor ou data")[0]);
    fireEvent.change(screen.getByLabelText(/Motivo da correção/), { target: { value: "Família pagou R$ 50 a menos" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Salvar correção"));
    });
    const chamada = apiJson.mock.calls.find(([p, i]) => p === "/api/admin/billing/boletos/b1" && i?.method === "PATCH");
    expect(chamada).toBeTruthy();
    expect(JSON.parse(String(chamada![1]!.body))).toEqual({
      acao: "CORRIGIR",
      valor: "1200,00",
      valorPago: "1150,00",
      dataPagamento: "2026-10-05",
      motivo: "Família pagou R$ 50 a menos",
    });
    expect(screen.getByText(/Correção de Bia Souza salva/)).toBeTruthy();
  });
});
