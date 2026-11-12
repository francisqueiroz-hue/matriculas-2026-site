import { prisma } from "@/lib/prisma";
import { signAccessToken, generateRefreshToken, hashRefreshToken } from "@/lib/auth";
import { reusoSuspeito, situacaoRefresh } from "@/lib/renovacao-sessao";

/**
 * Troca um refresh token válido por um novo par (access + refresh), com rotação.
 * Retorna null se o token for inexistente, expirado, de conta desativada/excluída ou
 * reutilizado fora da janela de tolerância. Usado por /api/auth/refresh (chamadas da API)
 * e por /api/auth/renovar (abertura de página com o token de acesso vencido).
 */
export async function renovarSessao(refreshToken: string, agora = new Date()) {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { user: true },
  });
  const situacao = situacaoRefresh(stored, agora);
  if (!stored) return null;
  if (situacao === "invalido") {
    // Token já usado há mais que a janela de tolerância: pode ser cópia roubada. Encerra todas
    // as sessões da pessoa; ela entra de novo e o ladrão fica de fora.
    if (reusoSuspeito(stored, agora)) {
      await prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: agora } });
    }
    return null;
  }

  if (situacao === "valido") {
    // Só revoga se ainda não estiver revogado: duas renovações simultâneas não se pisam.
    await prisma.refreshToken.updateMany({ where: { id: stored.id, revokedAt: null }, data: { revokedAt: agora } });
  }

  const novo = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { tokenHash: novo.tokenHash, userId: stored.user.id, expiresAt: novo.expiresAt },
  });

  // Logout (ou troca de senha) no meio desta renovação: o token usado foi vencido depois que
  // o lemos. Só quem encerra sessões encurta expiresAt; nesse caso a sessão nova não vale.
  const conferido = await prisma.refreshToken.findUnique({
    where: { id: stored.id },
    select: { expiresAt: true, user: { select: { active: true, deletedAt: true } } },
  });
  if (
    !conferido ||
    conferido.expiresAt.getTime() < stored.expiresAt.getTime() ||
    !conferido.user.active ||
    conferido.user.deletedAt
  ) {
    await prisma.refreshToken.updateMany({ where: { tokenHash: novo.tokenHash }, data: { revokedAt: agora, expiresAt: agora } });
    return null;
  }
  const accessToken = await signAccessToken({
    sub: stored.user.id,
    role: stored.user.role,
    schoolId: stored.user.schoolId,
    name: stored.user.name,
  });
  return { accessToken, refreshToken: novo.token };
}
