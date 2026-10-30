import { apiFetch } from "@/lib/api-client";
import { requestPushToken } from "@/lib/firebase-client";

/** A pessoa tocou em "Agora não" ou já respondeu ao convite neste aparelho. */
export const DISPENSOU_AVISOS_KEY = "classlink-avisos-mensagens-dispensado";
/** A Administração já recebeu o pedido automático neste aparelho (só é feito uma vez). */
export const PEDIDO_AUTOMATICO_KEY = "classlink-avisos-pedido-automatico";

export type PermissaoAvisos = NotificationPermission | "indisponivel";

/**
 * O que mostrar ao entrar no painel:
 * - "nenhum": já permitiu (o PushRegister inscreve sozinho), bloqueou (Minha conta explica como
 *   liberar) ou já respondeu ao convite neste aparelho;
 * - "pedir-no-primeiro-toque": Administração — o pedido do navegador abre no primeiro clique
 *   em qualquer lugar do app, uma única vez, sem convite na tela;
 * - "convite": demais perfis — faixa com "Ativar avisos" / "Agora não".
 */
export function modoConvite(opcoes: {
  permissao: PermissaoAvisos;
  admin: boolean;
  dispensou: boolean;
  pedidoAutomaticoFeito: boolean;
}): "nenhum" | "pedir-no-primeiro-toque" | "convite" {
  if (opcoes.permissao !== "default") return "nenhum";
  if (opcoes.admin) return opcoes.pedidoAutomaticoFeito ? "nenhum" : "pedir-no-primeiro-toque";
  return opcoes.dispensou ? "nenhum" : "convite";
}

export function permissaoAtual(): PermissaoAvisos {
  if (typeof Notification === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return "indisponivel";
  }
  return Notification.permission;
}

export function lerMarca(chave: string): boolean {
  try {
    return Boolean(localStorage.getItem(chave));
  } catch {
    return false; // sem localStorage (modo privado etc.)
  }
}

export function gravarMarca(chave: string) {
  try {
    localStorage.setItem(chave, "1");
  } catch {
    // ignora
  }
}

/**
 * Abre o pedido de permissão do navegador e, se a pessoa permitir, inscreve o aparelho no push.
 * Precisa partir de um clique ou tecla (o Firefox e o Safari ignoram o pedido fora disso).
 * Devolve a resposta do navegador: "default" quando a janela foi fechada sem escolha ou
 * nem apareceu (o Chrome pode mostrar só um ícone na barra de endereço).
 */
export async function pedirPermissaoEInscrever(): Promise<NotificationPermission> {
  const resultado = await Notification.requestPermission();
  if (resultado !== "granted") return resultado;
  try {
    // Com o Firebase configurado, registra também o push (avisa com o navegador fechado).
    const token = await requestPushToken(false);
    if (token) await apiFetch("/api/push/register", { method: "POST", body: JSON.stringify({ token }) });
  } catch {
    // push indisponível: os avisos com a aba aberta seguem funcionando
  }
  return resultado;
}
