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
