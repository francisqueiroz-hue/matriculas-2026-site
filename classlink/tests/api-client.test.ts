import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// apiFetch: renovação única para vários 401 simultâneos e trava usada pelo logout.
const fetchMock = vi.fn();

async function carregar() {
  vi.resetModules();
  return import("@/lib/api-client");
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const resposta = (status: number) => new Response("{}", { status });

describe("apiFetch", () => {
  it("vários 401 ao mesmo tempo disparam uma única renovação", async () => {
    let liberar: (r: Response) => void = () => {};
    let tentativas = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/auth/refresh") return new Promise<Response>((r) => (liberar = r));
      tentativas += 1;
      return Promise.resolve(resposta(tentativas <= 2 ? 401 : 200));
    });
    const { apiFetch } = await carregar();
    const a = apiFetch("/api/x");
    const b = apiFetch("/api/y");
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => u === "/api/auth/refresh")).toHaveLength(1));
    liberar(resposta(200));
    expect((await a).status).toBe(200);
    expect((await b).status).toBe(200);
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/auth/refresh")).toHaveLength(1);
  });

  it("com a renovação suspensa (logout em andamento), um 401 não renova a sessão", async () => {
    fetchMock.mockResolvedValue(resposta(401));
    const { apiFetch, suspenderRenovacaoDeSessao } = await carregar();
    suspenderRenovacaoDeSessao(true);
    expect((await apiFetch("/api/x")).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    suspenderRenovacaoDeSessao(false);
    await apiFetch("/api/x");
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/auth/refresh")).toBe(true);
  });

  it("aguardarRenovacaoEmAndamento espera a renovação que já saiu", async () => {
    let liberar: (r: Response) => void = () => {};
    fetchMock.mockImplementation((url: string) =>
      url === "/api/auth/refresh" ? new Promise<Response>((r) => (liberar = r)) : Promise.resolve(resposta(401)),
    );
    const { apiFetch, aguardarRenovacaoEmAndamento } = await carregar();
    void apiFetch("/api/x");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/refresh", expect.anything()));
    let terminou = false;
    const espera = aguardarRenovacaoEmAndamento().then(() => (terminou = true));
    await Promise.resolve();
    expect(terminou).toBe(false);
    liberar(resposta(401));
    await espera;
    expect(terminou).toBe(true);
  });

  it("falha de rede na renovação devolve o 401 original", async () => {
    fetchMock.mockImplementation((url: string) => (url === "/api/auth/refresh" ? Promise.reject(new TypeError("rede")) : Promise.resolve(resposta(401))));
    const { apiFetch } = await carregar();
    expect((await apiFetch("/api/x")).status).toBe(401);
  });
});
