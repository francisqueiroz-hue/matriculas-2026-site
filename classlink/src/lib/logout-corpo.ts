import { z } from "zod";

/** Limite do corpo do logout: o token do FCM tem ~160 caracteres; nada legítimo passa disso. */
export const TAMANHO_MAXIMO_CORPO_LOGOUT = 8192;

const corpoLogoutSchema = z.object({ pushToken: z.string().trim().min(1).max(4096) });

/**
 * Lê o token de push (opcional) do corpo do logout. Corpo vazio, grande demais, JSON
 * inválido ou fora do formato: retorna null e o logout segue normalmente, só sem apagar
 * o token do aparelho.
 */
export function lerTokenPushDoLogout(corpo: string): string | null {
  if (!corpo || corpo.length > TAMANHO_MAXIMO_CORPO_LOGOUT) return null;
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return null;
  }
  const resultado = corpoLogoutSchema.safeParse(json);
  return resultado.success ? resultado.data.pushToken : null;
}
