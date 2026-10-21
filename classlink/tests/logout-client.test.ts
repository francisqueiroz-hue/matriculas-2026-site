import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Logout no navegador (src/lib/logout-client.ts + src/lib/firebase-client.ts), com o Firebase,
// a API e as APIs do navegador simuladas. Promessas que nunca resolvem simulam travamentos.

const nunca = () => new Promise<never>(() => {});

const firebaseMock = vi.hoisted(() => ({
  isSupported: vi.fn(),
  getMessaging: vi.fn(() => ({ messaging: true })),
  getToken: vi.fn(),
  deleteToken: vi.fn(),
}));
const apiFetchMock = vi.hoisted(() => vi.fn());
const apiClientMock = vi.hoisted(() => ({
  aguardarRenovacaoEmAndamento: vi.fn(async () => {}),
  suspenderRenovacaoDeSessao: vi.fn(),
}));

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({})), getApps: vi.fn(() => []) }));
vi.mock("firebase/messaging", () => firebaseMock);
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock, ...apiClientMock }));

let inscricao: { unsubscribe: ReturnType<typeof vi.fn> };
let registro: { active: object; pushManager: { getSubscription: ReturnType<typeof vi.fn> } };
let navegador: { serviceWorker: { getRegistration: ReturnType<typeof vi.fn> } };
let cachesMock: { keys: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
let notificacao: { permission: string; requestPermission: ReturnType<typeof vi.fn> };

async function carregar() {
  vi.resetModules();
  const modulo = await import("@/lib/logout-client");
  const registroPush = await import("@/lib/registro-push");
  return { ...modulo, registroPush };
}

/** Roda sairDaConta e avança o relógio falso; diz se terminou dentro de `ms`. */
async function sairComRelogio(sairDaConta: () => Promise<unknown>, ms: number) {
  let terminou = false;
  const promessa = sairDaConta().then(() => {
    terminou = true;
  });
  await vi.advanceTimersByTimeAsync(ms);
  return { terminou: () => terminou, promessa };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "AIzaFalsaParaTeste");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "projeto-teste");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_VAPID_KEY", "chave-vapid-falsa");

  inscricao = { unsubscribe: vi.fn(async () => true) };
  registro = { active: {}, pushManager: { getSubscription: vi.fn(async () => inscricao) } };
  navegador = { serviceWorker: { getRegistration: vi.fn(async () => registro) } };
  cachesMock = { keys: vi.fn(async () => ["classlink-shell-v2"]), delete: vi.fn(async () => true) };
  notificacao = { permission: "granted", requestPermission: vi.fn() };
  vi.stubGlobal("navigator", navegador);
  vi.stubGlobal("caches", cachesMock);
  vi.stubGlobal("Notification", notificacao);

  firebaseMock.isSupported.mockResolvedValue(true);
  firebaseMock.getToken.mockResolvedValue("tok-1");
  firebaseMock.deleteToken.mockResolvedValue(true);
  apiFetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sairDaConta: caminho normal", () => {
  it("envia o token do aparelho, cancela a inscrição capturada e limpa as caches", async () => {
    const { sairDaConta } = await carregar();
    const { terminou, promessa } = await sairComRelogio(sairDaConta, 0);
    await promessa;
    expect(terminou()).toBe(true);
    const [caminho, init] = apiFetchMock.mock.calls[0];
    expect(caminho).toBe("/api/auth/logout");
    expect(JSON.parse(init.body)).toEqual({ pushToken: "tok-1" });
    expect(inscricao.unsubscribe).toHaveBeenCalledTimes(1);
    expect(firebaseMock.deleteToken).not.toHaveBeenCalled();
    expect(cachesMock.delete).toHaveBeenCalledWith("classlink-shell-v2");
  });

  it("sem permissão concedida: não pede permissão, não pega token e sai sem corpo", async () => {
    notificacao.permission = "default";
    const { sairDaConta } = await carregar();
    await (await sairComRelogio(sairDaConta, 0)).promessa;
    expect(notificacao.requestPermission).not.toHaveBeenCalled();
    expect(firebaseMock.getToken).not.toHaveBeenCalled();
    expect(firebaseMock.deleteToken).not.toHaveBeenCalled();
    expect(apiFetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("sem inscrição de push existente: não chama getToken (que criaria uma inscrição)", async () => {
    registro.pushManager.getSubscription.mockResolvedValue(null);
    const { sairDaConta } = await carregar();
    await (await sairComRelogio(sairDaConta, 0)).promessa;
    expect(firebaseMock.getToken).not.toHaveBeenCalled();
    expect(apiFetchMock.mock.calls[0][1].body).toBeUndefined();
  });
});

describe("sairDaConta: travamentos (R1)", () => {
  it("tudo trava: termina no pior caso previsto e aborta a requisição do logout", async () => {
    firebaseMock.getToken.mockImplementation(nunca);
    apiFetchMock.mockImplementation(nunca);
    inscricao.unsubscribe.mockImplementation(nunca);
    cachesMock.keys.mockImplementation(nunca);
    const { sairDaConta, PIOR_CASO_LOGOUT_MS } = await carregar();

    const { terminou } = await sairComRelogio(sairDaConta, PIOR_CASO_LOGOUT_MS);
    expect(terminou()).toBe(true);
    const signal: AbortSignal = apiFetchMock.mock.calls[0][1].signal;
    expect(signal.aborted).toBe(true);
    expect(inscricao.unsubscribe).toHaveBeenCalled();
  });

  it("até as APIs locais travam (Firebase, service worker, inscrição): termina no pior caso previsto", async () => {
    firebaseMock.isSupported.mockImplementation(nunca);
    navegador.serviceWorker.getRegistration.mockImplementation(nunca);
    registro.pushManager.getSubscription.mockImplementation(nunca);
    apiFetchMock.mockImplementation(nunca);
    cachesMock.keys.mockImplementation(nunca);
    const { sairDaConta, PIOR_CASO_LOGOUT_MS } = await carregar();

    const { terminou } = await sairComRelogio(sairDaConta, PIOR_CASO_LOGOUT_MS);
    expect(terminou()).toBe(true);
  });

  it("o servidor nunca responde: ainda cancela a inscrição e limpa as caches", async () => {
    apiFetchMock.mockImplementation(nunca);
    const { sairDaConta, PIOR_CASO_LOGOUT_MS } = await carregar();
    const { terminou } = await sairComRelogio(sairDaConta, PIOR_CASO_LOGOUT_MS);
    expect(terminou()).toBe(true);
    expect(inscricao.unsubscribe).toHaveBeenCalledTimes(1);
    expect(cachesMock.delete).toHaveBeenCalled();
  });
});

describe("desligar o push no logout (R2/PRIV-002)", () => {
  it("logout no servidor falha: a inscrição do aparelho é cancelada mesmo assim, sem deleteToken", async () => {
    apiFetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { sairDaConta, PIOR_CASO_LOGOUT_MS } = await carregar();
    const { terminou } = await sairComRelogio(sairDaConta, PIOR_CASO_LOGOUT_MS);
    expect(terminou()).toBe(true);
    expect(inscricao.unsubscribe).toHaveBeenCalledTimes(1);
    expect(firebaseMock.deleteToken).not.toHaveBeenCalled();
    expect(cachesMock.delete).toHaveBeenCalled();
  });

  it("unsubscribe atrasado da inscrição antiga não afeta a inscrição criada depois por outra conta", async () => {
    let terminarAntigo: (v: boolean) => void = () => {};
    inscricao.unsubscribe.mockImplementation(() => new Promise<boolean>((r) => (terminarAntigo = r)));
    const { sairDaConta, PIOR_CASO_LOGOUT_MS } = await carregar();

    // O cancelamento da inscrição antiga estoura o prazo e o logout segue (redireciona).
    const { terminou } = await sairComRelogio(sairDaConta, PIOR_CASO_LOGOUT_MS);
    expect(terminou()).toBe(true);

    // Outra conta entra e o aparelho ganha uma inscrição nova.
    const nova = { unsubscribe: vi.fn(async () => true) };
    registro.pushManager.getSubscription.mockResolvedValue(nova);

    // Só agora o unsubscribe antigo termina.
    terminarAntigo(true);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(inscricao.unsubscribe).toHaveBeenCalledTimes(1);
    expect(nova.unsubscribe).not.toHaveBeenCalled();
    expect(await (registro.pushManager.getSubscription as () => Promise<unknown>)()).toBe(nova);
    expect(firebaseMock.deleteToken).not.toHaveBeenCalled();
  });
});

describe("logout confirmado ou não (caso 1 do PR #79)", () => {
  it("servidor confirma: devolve true e mantém renovação e registro de push travados", async () => {
    const { sairDaConta, registroPush } = await carregar();
    await expect(sairDaConta()).resolves.toBe(true);
    expect(apiClientMock.suspenderRenovacaoDeSessao).toHaveBeenCalledTimes(1);
    expect(apiClientMock.suspenderRenovacaoDeSessao).toHaveBeenCalledWith(true);
    await expect(registroPush.registrarPush(async () => "x")).rejects.toBeInstanceOf(registroPush.RegistroPushBloqueado);
  });

  it.each([
    ["sem internet", () => apiFetchMock.mockRejectedValue(new TypeError("Failed to fetch"))],
    ["erro 500", () => apiFetchMock.mockResolvedValue(new Response("{}", { status: 500 }))],
    ["prazo esgotado", () => apiFetchMock.mockImplementation(nunca)],
  ])("%s: devolve false e libera de novo a sessão neste aparelho", async (_nome, preparar) => {
    preparar();
    const { sairDaConta, registroPush, PIOR_CASO_LOGOUT_MS } = await carregar();
    const promessa = sairDaConta();
    await vi.advanceTimersByTimeAsync(PIOR_CASO_LOGOUT_MS);
    await expect(promessa).resolves.toBe(false);
    expect(apiClientMock.suspenderRenovacaoDeSessao).toHaveBeenLastCalledWith(false);
    await expect(registroPush.registrarPush(async () => "x")).resolves.toBe("x");
    // Mesmo sem confirmação, o aparelho para de receber avisos e perde as caches.
    expect(inscricao.unsubscribe).toHaveBeenCalledTimes(1);
    expect(cachesMock.delete).toHaveBeenCalled();
  });
});

describe("corridas do logout (casos 2 e 3 do PR #79)", () => {
  it("espera o registro de push que já estava a caminho antes de avisar o servidor", async () => {
    const { sairDaConta, registroPush } = await carregar();
    let concluirRegistro: (v: string) => void = () => {};
    const registro = registroPush.registrarPush(() => new Promise<string>((r) => (concluirRegistro = r)));

    const promessa = sairDaConta();
    await vi.advanceTimersByTimeAsync(500);
    expect(apiFetchMock).not.toHaveBeenCalled();

    concluirRegistro("ok");
    await registro;
    await vi.advanceTimersByTimeAsync(0);
    await promessa;
    expect(apiFetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.anything());
  });

  it("registro de push que começa durante o logout é recusado", async () => {
    apiFetchMock.mockImplementation(nunca);
    const { sairDaConta, registroPush } = await carregar();
    void sairDaConta();
    const registrar = vi.fn(async () => "x");
    await expect(registroPush.registrarPush(registrar)).rejects.toBeInstanceOf(registroPush.RegistroPushBloqueado);
    expect(registrar).not.toHaveBeenCalled();
  });

  it("espera a renovação de sessão em andamento antes de avisar o servidor", async () => {
    let concluirRenovacao: () => void = () => {};
    apiClientMock.aguardarRenovacaoEmAndamento.mockImplementationOnce(() => new Promise<void>((r) => (concluirRenovacao = r)));
    const { sairDaConta } = await carregar();
    const promessa = sairDaConta();
    await vi.advanceTimersByTimeAsync(500);
    expect(apiClientMock.suspenderRenovacaoDeSessao).toHaveBeenCalledWith(true);
    expect(apiFetchMock).not.toHaveBeenCalled();
    concluirRenovacao();
    await vi.advanceTimersByTimeAsync(0);
    await expect(promessa).resolves.toBe(true);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("registro de push travado não prende o logout além do prazo", async () => {
    const { sairDaConta, registroPush, PRAZOS_LOGOUT_MS } = await carregar();
    void registroPush.registrarPush(nunca);
    const promessa = sairDaConta();
    await vi.advanceTimersByTimeAsync(PRAZOS_LOGOUT_MS.pendentes);
    await promessa;
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});
