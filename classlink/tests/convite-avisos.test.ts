// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISPENSOU_AVISOS_KEY, PEDIDO_AUTOMATICO_KEY, modoConvite } from "@/lib/convite-avisos";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/firebase-client", () => ({ requestPushToken: vi.fn(async () => "token-123") }));
const apiFetch = vi.fn(async (...args: unknown[]) => new Response(String(args.length)));
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args), apiJson: vi.fn() }));

const { ConviteAtivarAvisos } = await import("@/components/AvisosMensagens");
const { UserProvider } = await import("@/components/UserContext");

describe("modoConvite", () => {
  const base = { admin: false, dispensou: false, pedidoAutomaticoFeito: false };

  it("não mostra nada com a permissão já decidida ou sem suporte", () => {
    for (const permissao of ["granted", "denied", "indisponivel"] as const) {
      expect(modoConvite({ ...base, permissao })).toBe("nenhum");
      expect(modoConvite({ ...base, permissao, admin: true })).toBe("nenhum");
    }
  });

  it("demais perfis: convite até responderem uma vez", () => {
    expect(modoConvite({ ...base, permissao: "default" })).toBe("convite");
    expect(modoConvite({ ...base, permissao: "default", dispensou: true })).toBe("nenhum");
  });

  it("Administração: pedido automático uma única vez, mesmo se antes tocou em Agora não", () => {
    expect(modoConvite({ ...base, permissao: "default", admin: true, dispensou: true })).toBe("pedir-no-primeiro-toque");
    expect(modoConvite({ ...base, permissao: "default", admin: true, pedidoAutomaticoFeito: true })).toBe("nenhum");
  });
});

function permissao(inicial: NotificationPermission, resposta: NotificationPermission) {
  const Notif = { permission: inicial, requestPermission: vi.fn(async () => resposta) };
  vi.stubGlobal("Notification", Notif);
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
  return Notif;
}

function montar(role: "ADMIN" | "STAFF" | "GUARDIAN") {
  const user = { id: "u1", name: "Teste", email: null, role, schoolId: "s1", schoolName: "Escola", isCoordenacao: false };
  return render(createElement(UserProvider, { user } as never, createElement(ConviteAtivarAvisos)));
}

describe("ConviteAtivarAvisos", () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockClear();
    vi.stubGlobal("AudioContext", undefined);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("Administração: sem convite; o primeiro clique abre o pedido e inscreve o aparelho, só uma vez", async () => {
    const Notif = permissao("default", "granted");
    montar("ADMIN");
    await act(async () => {});
    expect(screen.queryByText(/Ativar avisos/)).toBeNull();

    await act(async () => fireEvent.click(document.body));
    expect(Notif.requestPermission).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/api/push/register", expect.objectContaining({ method: "POST" }));
    expect(localStorage.getItem(PEDIDO_AUTOMATICO_KEY)).toBe("1");

    await act(async () => fireEvent.click(document.body));
    expect(Notif.requestPermission).toHaveBeenCalledTimes(1);

    // Novo acesso no mesmo aparelho: não pede de novo.
    cleanup();
    montar("ADMIN");
    await act(async () => fireEvent.click(document.body));
    expect(Notif.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("janela fechada sem escolha: explica uma vez e o convite não volta no próximo acesso", async () => {
    permissao("default", "default");
    montar("STAFF");
    await act(async () => {});
    const botao = await screen.findByText("Ativar avisos");
    await act(async () => fireEvent.click(botao));
    expect(screen.getByRole("status").textContent).toMatch(/não confirmou/);
    expect(localStorage.getItem(DISPENSOU_AVISOS_KEY)).toBe("1");

    cleanup();
    montar("STAFF");
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(screen.queryByText("Ativar avisos")).toBeNull();
  });

  it("com a permissão já dada, não mostra convite nem pede de novo", async () => {
    const Notif = permissao("granted", "granted");
    montar("ADMIN");
    await act(async () => fireEvent.click(document.body));
    expect(Notif.requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByText(/Ativar avisos/)).toBeNull();
  });
});
