// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Painel da direção: o guia só vai às famílias depois da prévia e da confirmação.
const apiJson = vi.fn(async () => ({ comunicado: { id: "com1" } }));
vi.mock("@/lib/api-client", () => ({ apiJson: (...a: unknown[]) => apiJson(...(a as [])) }));

const { EnviarGuiaFamilias } = await import("@/components/EnviarGuiaFamilias");

afterEach(() => {
  cleanup();
  apiJson.mockClear();
});

describe("Enviar guia às famílias", () => {
  it("abrir a prévia não envia nada; cancelar também não", () => {
    render(createElement(EnviarGuiaFamilias));
    fireEvent.click(screen.getByText("Enviar guia às famílias"));
    expect(screen.getByText(/Prévia do comunicado/)).toBeTruthy();
    expect(screen.getByText(/Acesse: http:\/\/localhost(:\d+)?\/guia/)).toBeTruthy();
    fireEvent.click(screen.getByText("Cancelar"));
    expect(apiJson).not.toHaveBeenCalled();
  });

  it("confirmar publica um comunicado para toda a escola com o link do guia", async () => {
    render(createElement(EnviarGuiaFamilias));
    fireEvent.click(screen.getByText("Enviar guia às famílias"));
    await act(async () => {
      fireEvent.click(screen.getByText("Confirmar envio"));
    });
    expect(apiJson).toHaveBeenCalledTimes(1);
    const [rota, init] = apiJson.mock.calls[0] as unknown as [string, { body: string }];
    expect(rota).toBe("/api/comunicados");
    const corpo = JSON.parse(init.body);
    expect(corpo).toMatchObject({ tipo: "CIRCULAR", audience: "SCHOOL" });
    expect(corpo.descricao).toMatch(/\/guia/);
    expect(screen.getByText(/Guia enviado/)).toBeTruthy();
  });
});
