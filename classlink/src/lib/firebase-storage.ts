import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";

export interface UploadResult {
  /** Caminho interno do objeto no bucket — não é uma URL pública (o bucket fica privado por padrão). */
  path: string;
  resourceType: "image" | "video";
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB (imagem já deve chegar comprimida do cliente)
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB
const SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export function isFirebaseStorageConfigured() {
  return Boolean(getFirebaseAdminApp() && process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
}

export function assertUploadSize(bytes: number, kind: "image" | "video") {
  const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (bytes > limit) {
    throw new Error(`Arquivo muito grande. Limite de ${Math.round(limit / 1024 / 1024)}MB para ${kind}.`);
  }
}

function getBucket() {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase não configurado (FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY)");
  return getStorage(app).bucket();
}

/**
 * Envia o arquivo para o Firebase Storage. O bucket permanece privado — nunca
 * geramos link público fixo (fotos de alunos exigem cuidado de acesso, LGPD).
 * Leitura sempre passa por `getSignedMediaUrl`, com validade curta.
 */
export async function uploadMedia(
  buffer: Buffer,
  kind: "image" | "video",
  folder: string,
  mimeType: string,
): Promise<UploadResult> {
  assertUploadSize(buffer.byteLength, kind);

  const extension = mimeType.split("/")[1] ?? (kind === "image" ? "jpg" : "mp4");
  const path = `${folder}/${randomUUID()}.${extension}`;

  const file = getBucket().file(path);
  await file.save(buffer, { metadata: { contentType: mimeType }, resumable: false });

  return { path, resourceType: kind };
}

/** Gera uma URL assinada de leitura, válida por tempo limitado, para exibir a mídia no app. */
export async function getSignedMediaUrl(path: string): Promise<string> {
  const [url] = await getBucket()
    .file(path)
    .getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
  return url;
}
