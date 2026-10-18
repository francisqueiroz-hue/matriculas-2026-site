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

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({})), getApps: vi.fn(() => []) }));
vi.mock("firebase/messaging", () => firebaseMock);
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));

let inscricao: { unsubscribe: ReturnType<typeof vi.fn> };
let registro: { active: object; pushManager: { getSubscription: ReturnType<typeof vi.fn> } };
let navegador: { serviceWorker: { getRegistration: ReturnType<typeof vi.fn> } };
let cachesMock: { keys: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
let notificacao: { permission: string; requestPermission: ReturnType<typeof vi.fn> };

async function carregar() {
  vi.resetModules();
  return import("@/lib/logout-client");
}

/** Roda sairDaConta e avança o relógio falso; diz se terminou dentro de `ms`. */
async function sairComRelogio(sairDaConta: () => Promise<void>, ms: number) {
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
  it("envia o token do aparelho, apaga no Firebase e limpa as caches", async () => {
    const { sairDaConta } = await carregar();
    const { terminou, promessa } = await sairComRelogio(sairDaConta, 0);
    await promessa;
    expect(terminou()).toBe(true);
    const [caminho, init] = apiFetchMock.mock.calls[0];
    expect(caminho).toBe("/api/auth/logout");
    expect(JSON.parse(init.body)).toEqual({ pushToken: "tok-1" });
    expect(firebaseMock.deleteToken).toHaveBeenCalledTimes(1);
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
  it("tudo trava: termina em até 10 s e aborta a requisição do logout", async () => {
    firebaseMock.getToken.mockImplementation(nunca);
    apiFetchMock.mockImplementation(nunca);
    inscricao.unsubscribe.mockImplementation(nunca);
    cachesMock.keys.mockImplementation(nunca);
    const { sairDaConta } = await carregar();

    const { terminou } = await sairComRelogio(sairDaConta, 10_000);
    expect(terminou()).toBe(true);
    const signal: AbortSignal = apiFetchMock.mock.calls[0][1].signal;
    expect(signal.aborted).toBe(true);
    // Sem token, o push é desligado direto pela inscrição do navegador.
    expect(inscricao.unsubscribe).toHaveBeenCalled();
  });

  it("até as APIs locais travam (Firebase, service worker, inscrição): termina em até 10 s", async () => {
    firebaseMock.isSupported.mockImplementation(nunca);
    navegador.serviceWorker.getRegistration.mockImplementation(nunca);
    registro.pushManager.getSubscription.mockImplementation(nunca);
    apiFetchMock.mockImplementation(nunca);
    cachesMock.keys.mockImplementation(nunca);
    const { sairDaConta } = await carregar();

    const { terminou } = await sairComRelogio(sairDaConta, 10_000);
    expect(terminou()).toBe(true);
  });

  it("o servidor nunca responde: ainda desliga o push e limpa as caches", async () => {
    apiFetchMock.mockImplementation(nunca);
    const { sairDaConta } = await carregar();
    const { terminou } = await sairComRelogio(sairDaConta, 10_000);
    expect(terminou()).toBe(true);
    expect(firebaseMock.deleteToken).toHaveBeenCalled();
    expect(cachesMock.delete).toHaveBeenCalled();
  });
});

describe("desligar o push quando o Firebase falha (R2)", () => {
  it("logout no servidor e revogação do Firebase falham juntos: cancela a inscrição do navegador", async () => {
    apiFetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    firebaseMock.deleteToken.mockRejectedValue(new Error("messaging/token-unsubscribe-failed"));
    const { sairDaConta } = await carregar();
    const { terminou } = await sairComRelogio(sairDaConta, 10_000);
    expect(terminou()).toBe(true);
    expect(firebaseMock.deleteToken).toHaveBeenCalled();
    expect(inscricao.unsubscribe).toHaveBeenCalledTimes(1);
    expect(cachesMock.delete).toHaveBeenCalled();
  });

  it("deleteToken nunca termina: depois do prazo, cancela a inscrição do navegador", async () => {
    firebaseMock.deleteToken.mockImplementation(nunca);
    const { sairDaConta } = await carregar();
    const { terminou } = await sairComRelogio(sairDaConta, 10_000);
    expect(terminou()).toBe(true);
    expect(inscricao.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("deleteToken funciona: não cancela a inscrição de novo", async () => {
    const { sairDaConta } = await carregar();
    await (await sairComRelogio(sairDaConta, 0)).promessa;
    expect(inscricao.unsubscribe).not.toHaveBeenCalled();
  });
});
