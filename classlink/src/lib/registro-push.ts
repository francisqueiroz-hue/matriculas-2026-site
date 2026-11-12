"use client";

/**
 * Registros do token de push deste aparelho no servidor (/api/push/register).
 *
 * O registro roda ao abrir o painel; se a pessoa tocar em Sair enquanto ele está a caminho,
 * o servidor poderia gravar o token DEPOIS de o logout apagá-lo, e o aparelho continuaria
 * recebendo avisos da conta. Por isso o logout bloqueia registros novos e espera os que já
 * saíram terminarem antes de avisar o servidor.
 */
const emAndamento = new Set<Promise<unknown>>();
let bloqueado = false;

export class RegistroPushBloqueado extends Error {
  constructor() {
    super("Saindo da conta: o aparelho não é registrado para avisos");
  }
}

/** Roda `registrar` (a chamada a /api/push/register), a não ser que o logout já tenha começado. */
export function registrarPush<T>(registrar: () => Promise<T>): Promise<T> {
  if (bloqueado) return Promise.reject(new RegistroPushBloqueado());
  const promessa = registrar();
  const acompanhada = promessa.catch(() => undefined).finally(() => emAndamento.delete(acompanhada));
  emAndamento.add(acompanhada);
  return promessa;
}

/** Logout: bloqueia registros novos (ou libera de novo, se o logout não se confirmou). */
export function bloquearRegistroPush(bloquear: boolean) {
  bloqueado = bloquear;
}

/** Espera os registros já enviados terminarem (sem lançar). */
export async function aguardarRegistrosPush(): Promise<void> {
  await Promise.all([...emAndamento]);
}
