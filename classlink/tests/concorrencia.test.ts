import { describe, expect, it } from "vitest";
import { executarComLimite } from "@/lib/concorrencia";

describe("executarComLimite", () => {
  it("roda todas, respeitando o limite de simultâneas", async () => {
    let ativas = 0;
    let pico = 0;
    const tarefas = Array.from({ length: 12 }, () => async () => {
      ativas++;
      pico = Math.max(pico, ativas);
      await new Promise((r) => setTimeout(r, 5));
      ativas--;
    });
    const r = await executarComLimite(tarefas, 3);
    expect(r).toEqual({ concluidas: 12, rejeitadas: 0 });
    expect(pico).toBeLessThanOrEqual(3);
    expect(pico).toBeGreaterThan(1);
  });
  it("uma falha não interrompe as demais nem lança", async () => {
    let feitas = 0;
    const r = await executarComLimite(
      [async () => { throw new Error("x"); }, async () => { feitas++; }, async () => { feitas++; }],
      2,
    );
    expect(r).toEqual({ concluidas: 2, rejeitadas: 1 });
    expect(feitas).toBe(2);
  });
  it("lista vazia e limite inválido são seguros", async () => {
    expect(await executarComLimite([], 5)).toEqual({ concluidas: 0, rejeitadas: 0 });
    expect(await executarComLimite([async () => {}], 0)).toEqual({ concluidas: 1, rejeitadas: 0 });
  });
});
