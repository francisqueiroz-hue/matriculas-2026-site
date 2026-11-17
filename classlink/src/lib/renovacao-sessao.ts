import type { Prisma } from "@prisma/client";

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
 * Reuso de um token que já foi trocado (revogado) fora da janela de tolerância, ainda dentro da
 * validade e de conta ativa. Logout vence o token (expiresAt), então não cai aqui.
 */
export function reusoSuspeito(stored: RefreshArmazenado, agora: Date): boolean {
  return Boolean(stored.revokedAt) && situacaoRefresh(stored, agora) === "invalido" &&
    stored.user.active && !stored.user.deletedAt && stored.expiresAt.getTime() > agora.getTime();
}

/**
 * Endereço para onde o proxy manda quem abriu uma página do painel sem token de acesso
 * válido (o token dura 15 min). O cookie de renovação só é enviado a /api/auth, então a
 * renovação precisa acontecer numa rota desse caminho, e não no próprio proxy.
 */
export function caminhoParaRenovar(pathname: string, search = ""): string {
  return `/api/auth/renovar?next=${encodeURIComponent(`${pathname}${search}`)}`;
}

/**
 * Família de um refresh token = a sessão de um aparelho (do login até o logout, passando por
 * todas as renovações). Token criado antes da coluna existir não tem família; os filhos dele
 * usam o id dele.
 */
export function familiaDe(stored: { id: string; familia?: string | null }): string {
  return stored.familia ?? stored.id;
}

/**
 * Argumentos de `refreshToken.updateMany` que encerram na hora a sessão de UM aparelho (a
 * família do token): reuso suspeito e logout. Os outros aparelhos da pessoa seguem conectados.
 * Vence o token (não só revoga) para a janela de reuso não reabrir a sessão.
 *
 * Token antigo, sem família: não dá para saber qual cadeia é a dele, então encerra os filhos
 * dele e as sessões antigas da pessoa (como era antes), poupando quem já entrou depois desta
 * mudança. Isso some sozinho quando os tokens antigos vencerem (30 dias).
 */
export function encerrarFamilia(
  stored: { id: string; userId: string; familia?: string | null },
  agora = new Date(),
): Prisma.RefreshTokenUpdateManyArgs {
  const data = { revokedAt: agora, expiresAt: agora };
  if (stored.familia) {
    return { where: { familia: stored.familia, expiresAt: { gt: agora } }, data };
  }
  return {
    where: {
      expiresAt: { gt: agora },
      OR: [{ familia: stored.id }, { userId: stored.userId, familia: null }],
    },
    data,
  };
}

/**
 * Argumentos de `refreshToken.updateMany` que encerram na hora TODAS as sessões de um usuário
 * (troca/redefinição de senha, exclusão). Só revogar não basta: a janela de reuso acima ainda
 * aceitaria por 15 s um token recém-revogado (ou já trocado há pouco), e quem o tivesse
 * ganharia uma sessão nova depois da troca de senha. Vencer o token o torna "invalido".
 */
export function encerrarTodasAsSessoes(userId: string, agora = new Date()) {
  return {
    where: { userId, expiresAt: { gt: agora } },
    data: { revokedAt: agora, expiresAt: agora },
  };
}
