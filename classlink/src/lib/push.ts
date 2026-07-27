import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma";

function getAdminApp() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) return null;

  const existing = getApps()[0];
  if (existing) return existing;

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

/** Envia notificação push para os tokens de um conjunto de usuários. No-op silencioso se o Firebase não estiver configurado. */
export async function notifyUsers(userIds: string[], notification: { title: string; body: string; url?: string }) {
  const app = getAdminApp();
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
