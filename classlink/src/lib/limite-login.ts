import { createHmac } from "node:crypto";
import type { LoginIdentifier } from "@/lib/login-identifier";

/** 5 senhas erradas dentro de 15 minutos bloqueiam o login por 15 minutos. */
export const MAX_FALHAS = 5;
export const JANELA_MS = 15 * 60_000;
export const BLOQUEIO_MS = 15 * 60_000;

export type RegistroLogin = {
  falhas: number;
  primeiraFalhaEm: Date;
  bloqueadoAte: Date | null;
};

export type SituacaoLogin = { bloqueado: false } | { bloqueado: true; segundos: number };

export function situacaoLogin(reg: RegistroLogin | null | undefined, agora: Date): SituacaoLogin {
  if (!reg?.bloqueadoAte) return { bloqueado: false };
  const restanteMs = reg.bloqueadoAte.getTime() - agora.getTime();
  if (restanteMs <= 0) return { bloqueado: false };
  return { bloqueado: true, segundos: Math.ceil(restanteMs / 1000) };
}

/** Novo estado depois de uma falha de login. Bloqueio ou janela vencidos recomeçam a contagem. */
export function registrarFalha(reg: RegistroLogin | null | undefined, agora: Date): RegistroLogin {
  const bloqueioVencido = !!reg?.bloqueadoAte && reg.bloqueadoAte.getTime() <= agora.getTime();
  const janelaVencida = !!reg && agora.getTime() - reg.primeiraFalhaEm.getTime() > JANELA_MS;

  if (!reg || bloqueioVencido || janelaVencida) {
    return { falhas: 1, primeiraFalhaEm: agora, bloqueadoAte: null };
  }

  const falhas = reg.falhas + 1;
  return {
    falhas,
    primeiraFalhaEm: reg.primeiraFalhaEm,
    bloqueadoAte: falhas >= MAX_FALHAS ? new Date(agora.getTime() + BLOQUEIO_MS) : null,
  };
}

export function mensagemBloqueio(segundos: number): string {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return `Muitas tentativas. Tente novamente em ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`;
}

/**
 * Chave do contador: HMAC do identificador normalizado, para não gravar e-mail ou telefone
 * em texto no banco (LGPD) e para o hash não ser desfeito por força bruta sem o segredo.
 */
export function chaveLogin(identifier: LoginIdentifier, segredo: string): string {
  return createHmac("sha256", segredo).update(`login:${identifier.type}:${identifier.value}`).digest("hex");
}
