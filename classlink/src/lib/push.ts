import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";

/** Envia notificação push para os tokens de um conjunto de usuários. No-op silencioso se o Firebase não estiver configurado. */
export async function notifyUsers(userIds: string[], notification: { title: string; body: string; url?: string }) {
  const app = getFirebaseAdminApp();
  if (!app || userIds.length === 0) return;

  const tokens = await prisma.pushToken.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, token: true },
  });
  if (tokens.length === 0) return;

  const messaging = getMessaging(app);
  const response = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    notification: { title: notification.title, body: notification.body },
    webpush: notification.url ? { fcmOptions: { link: notification.url } } : undefined,
  });

  const staleTokenIds = response.responses
    .map((res, i) => (!res.success ? tokens[i].id : null))
    .filter((id): id is string => id !== null);

  if (staleTokenIds.length > 0) {
    await prisma.pushToken.deleteMany({ where: { id: { in: staleTokenIds } } });
  }
}
