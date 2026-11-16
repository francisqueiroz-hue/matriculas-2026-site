import { createHmac } from "node:crypto";
import type { LoginIdentifier } from "@/lib/login-identifier";

/** Quantas tentativas valem dentro da janela, e por quanto tempo o bloqueio dura. */
export type Politica = { max: number; janelaMs: number; bloqueioMs: number };

/**
 * Login por conta: 5 tentativas em 15 minutos; a 6ª já é bloqueada por 5 minutos.
 * O bloqueio é curto para a família que errou a senha não ficar presa; quando ele acaba o
 * contador zera, então no pior caso são ~60 tentativas por hora em uma conta, o que segue
 * inviável para adivinhar senha (cada tentativa ainda passa pelo bcrypt).
 */
export const POLITICA_LOGIN_CONTA: Politica = { max: 5, janelaMs: 15 * 60_000, bloqueioMs: 5 * 60_000 };

/**
 * Login por IP: só conta senha errada. O limite é folgado de propósito, porque a escola
 * inteira pode sair por um mesmo IP; serve para barrar "password spraying" (uma senha
 * comum testada em muitas contas) sem trancar quem digitou errado uma vez.
 */
export const POLITICA_LOGIN_IP: Politica = { max: 30, janelaMs: 15 * 60_000, bloqueioMs: 5 * 60_000 };

/** "Esqueci a senha": cada pedido troca a senha e dispara mensagem paga, então é bem restrito. */
export const POLITICA_ESQUECI_CONTA: Politica = { max: 3, janelaMs: 60 * 60_000, bloqueioMs: 60 * 60_000 };
export const POLITICA_ESQUECI_IP: Politica = { max: 10, janelaMs: 60 * 60_000, bloqueioMs: 60 * 60_000 };

export function mensagemBloqueio(segundos: number): string {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return `Muitas tentativas. Tente novamente em ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`;
}

/**
 * Chave do contador: HMAC do identificador normalizado, para não gravar e-mail, telefone ou IP
 * em texto no banco (LGPD) e para o hash não ser desfeito por força bruta sem o segredo.
 * O escopo ("login", "esqueci") separa os contadores de cada ação.
 */
export function chaveTentativa(escopo: string, identifier: LoginIdentifier, segredo: string): string {
  return createHmac("sha256", segredo).update(`${escopo}:${identifier.type}:${identifier.value}`).digest("hex");
}

export function chaveLogin(identifier: LoginIdentifier, segredo: string): string {
  return chaveTentativa("login", identifier, segredo);
}

export function chaveIp(escopo: string, ip: string, segredo: string): string {
  return createHmac("sha256", segredo).update(`${escopo}:ip:${ip}`).digest("hex");
}
