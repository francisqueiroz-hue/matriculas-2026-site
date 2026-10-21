// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proximoIntervalo, useConsultaAdaptativa } from "@/lib/consulta-adaptativa";

const cfg = { baseMs: 4_000, maxMs: 20_000, ocultoMs: null };

function visibilidade(estado: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => estado });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("intervalo adaptativo", () => {
  it("espaça sem novidade até o teto e volta ao base quando muda", () => {
    let i = cfg.baseMs;
    const serie = [];
    for (let n = 0; n < 6; n++) serie.push((i = proximoIntervalo(i, false, cfg)));
    expect(serie).toEqual([6_000, 9_000, 13_500, 20_000, 20_000, 20_000]);
    expect(proximoIntervalo(20_000, true, cfg)).toBe(4_000);
  });
});

describe("useConsultaAdaptativa", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibilidade("visible");
  });
  afterEach(() => vi.useRealTimers());

  it("consulta já, espaça sem novidade e para com a aba oculta", async () => {
    const consultar = vi.fn(async () => false);
    renderHook(() => useConsultaAdaptativa(consultar, cfg));
    await act(async () => {});
    expect(consultar).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(6_000)); // 1º intervalo: 6 s
    expect(consultar).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(8_999)); // próximo: 9 s
    expect(consultar).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(1));
    expect(consultar).toHaveBeenCalledTimes(3);

    await act(async () => visibilidade("hidden"));
    await act(async () => vi.advanceTimersByTime(120_000));
    expect(consultar).toHaveBeenCalledTimes(3); // oculta: nenhuma consulta

    await act(async () => visibilidade("visible")); // voltou: consulta na hora
    expect(consultar).toHaveBeenCalledTimes(4);
  });

  it("com ocultoMs, segue consultando em segundo plano nesse ritmo", async () => {
    const consultar = vi.fn(async () => false);
    renderHook(() => useConsultaAdaptativa(consultar, { baseMs: 20_000, maxMs: 60_000, ocultoMs: 60_000 }));
    await act(async () => {});
    await act(async () => visibilidade("hidden"));
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it("reiniciar (ex.: enviou mensagem) consulta já e volta ao intervalo base", async () => {
    const consultar = vi.fn(async () => false);
    const { result } = renderHook(() => useConsultaAdaptativa(consultar, cfg));
    await act(async () => {});
    await act(async () => vi.advanceTimersByTime(6_000 + 9_000 + 13_500)); // já espaçado
    const antes = consultar.mock.calls.length;
    await act(async () => result.current());
    expect(consultar).toHaveBeenCalledTimes(antes + 1);
    await act(async () => vi.advanceTimersByTime(6_000)); // de volta ao ritmo rápido
    expect(consultar).toHaveBeenCalledTimes(antes + 2);
  });

  it("para ao desmontar", async () => {
    const consultar = vi.fn(async () => false);
    const { unmount } = renderHook(() => useConsultaAdaptativa(consultar, cfg));
    await act(async () => {});
    unmount();
    await act(async () => vi.advanceTimersByTime(100_000));
    expect(consultar).toHaveBeenCalledTimes(1);
  });
});
