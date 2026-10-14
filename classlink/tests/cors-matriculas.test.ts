import { describe, expect, it } from "vitest";
import { cabecalhosCors } from "@/lib/cors-matriculas";

describe("cabecalhosCors", () => {
  it("sem variável: aberto, como sempre foi", async () => {
    expect(cabecalhosCors("https://qualquer.com", undefined)["Access-Control-Allow-Origin"]).toBe("*");
    expect(cabecalhosCors(null, "  ")["Access-Control-Allow-Origin"]).toBe("*");
  });
  it("com variável: só as origens listadas, ignorando barra final", async () => {
    const lista = "https://a.com.br, https://www.b.com.br/";
    expect(cabecalhosCors("https://a.com.br", lista)["Access-Control-Allow-Origin"]).toBe("https://a.com.br");
    expect(cabecalhosCors("https://www.b.com.br", lista)["Access-Control-Allow-Origin"]).toBe("https://www.b.com.br");
    const negado = cabecalhosCors("https://malicioso.com", lista);
    expect(negado["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(negado.Vary).toBe("Origin");
    expect(cabecalhosCors(null, lista)["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
