/**
 * Regras (puras, sem banco) para decidir se um refresh token ainda pode renovar a sessão.
 *
 * O token é rotativo: cada uso o revoga e emite outro. Só que o PWA, ao abrir, costuma
 * disparar várias requisições ao mesmo tempo (ou duas abas); a segunda chegaria com o token
 * já revogado pela primeira e derrubaria a pessoa no login. Por isso um token revogado há
 * poucos segundos ainda é aceito ("reuso recente"). Depois da janela, reuso é tratado como
 * possível roubo e recusado.
 */
export const JANELA_REUSO_MS = 15_000;

export type SituacaoRefresh = "valido" | "reuso_recente" | "invalido";

export interface RefreshArmazenado {
  revokedAt: Date | null;
  expiresAt: Date;
  user: { active: boolean; deletedAt: Date | null };
}

export function situacaoRefresh(stored: RefreshArmazenado | null | undefined, agora: Date): SituacaoRefresh {
  if (!stored) return "invalido";
  if (!stored.user.active || stored.user.deletedAt) return "invalido";
  if (stored.expiresAt.getTime() <= agora.getTime()) return "invalido";
  if (!stored.revokedAt) return "valido";
  const aposRevogar = agora.getTime() - stored.revokedAt.getTime();
  return aposRevogar >= 0 && aposRevogar <= JANELA_REUSO_MS ? "reuso_recente" : "invalido";
}

/**
 * Endereço para onde o proxy manda quem abriu uma página do painel sem token de acesso
 * válido (o token dura 15 min). O cookie de renovação só é enviado a /api/auth, então a
 * renovação precisa acontecer numa rota desse caminho, e não no próprio proxy.
 */
export function caminhoParaRenovar(pathname: string, search = ""): string {
  return `/api/auth/renovar?next=${encodeURIComponent(`${pathname}${search}`)}`;
}
