import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { ErroDeUsuario } from "@/lib/erros";
import { credenciaisDaConta, getFirebaseAdminApp } from "@/lib/firebase-admin";
import { limparValorPublico } from "@/lib/firebase-config-publica";
import { apagarDoBlob, isBlobConfigured, linkDoBlob, salvarNoBlob } from "@/lib/blob-storage";
import { linkAssinado } from "@/lib/midia-assinada";

export interface UploadResult {
  /** Caminho interno do objeto no bucket — não é uma URL pública (o bucket fica privado por padrão). */
  path: string;
  resourceType: "image" | "video";
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB (imagem já deve chegar comprimida do cliente)
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB
const SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/**
 * Onde as mídias ficam: no Vercel Blob (privado) quando há um Blob store conectado ao
 * projeto; senão, no Firebase Storage. O resto do app não precisa saber qual é.
 */
export function provedorDeMidia(): "blob" | "firebase" {
  return isBlobConfigured() ? "blob" : "firebase";
}

export function isFirebaseStorageConfigured() {
  return isBlobConfigured() || Boolean(getFirebaseAdminApp() && candidatosDeBucket(process.env).length > 0);
}

/**
 * Nomes possíveis do bucket: o configurado (sem "gs://", espaços ou aspas) e, como reserva,
 * os padrões do Firebase para o projeto — "<projeto>.firebasestorage.app" (projetos novos)
 * e "<projeto>.appspot.com" (antigos). Assim o upload funciona mesmo se a variável faltar.
 */
export function candidatosDeBucket(env: Record<string, string | undefined>): string[] {
  const configurado = limparValorPublico(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)?.replace(/^gs:\/\//i, "").replace(/\/+$/, "");
  const projeto = credenciaisDaConta(env).projectId ?? limparValorPublico(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const nomes = [configurado, projeto && `${projeto}.firebasestorage.app`, projeto && `${projeto}.appspot.com`];
  return [...new Set(nomes.filter((n): n is string => Boolean(n)))];
}

/** Erro de configuração do Storage, com a explicação para a equipe (a família nunca chama o upload). */
export class ErroStorage extends ErroDeUsuario {
  constructor(message: string) {
    super(message, 503);
    this.name = "ErroStorage";
  }
}

/** Traduz o erro do Google Cloud Storage para o que a escola precisa ajustar. */
export function explicarErroStorage(err: unknown): string {
  const e = err as { code?: number | string; message?: string };
  const msg = (e?.message ?? String(err)).toLowerCase();
  if (msg.includes("invalid_grant") || msg.includes("credential"))
    return "o Google recusou a conta de serviço. Gere uma nova chave privada e cole o JSON inteiro em FIREBASE_PRIVATE_KEY.";
  if (e?.code === 404 || msg.includes("bucket does not exist") || msg.includes("not found"))
    return "o bucket do Storage não existe. No Firebase, abra Storage e clique em \"Começar\" (ou confira NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET na Vercel).";
  if (e?.code === 403 || msg.includes("permission") || msg.includes("does not have"))
    return "a conta de serviço não tem permissão no Storage. Use a chave da conta \"firebase-adminsdk\" do mesmo projeto.";
  if (msg.includes("bucket name"))
    return "o nome do bucket não está configurado. Preencha NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET na Vercel.";
  return e?.message ?? String(err);
}

let bucketEscolhido: string | null = null;

export function assertUploadSize(bytes: number, kind: "image" | "video") {
  const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (bytes > limit) {
    throw new ErroDeUsuario(`Arquivo muito grande. Limite de ${Math.round(limit / 1024 / 1024)}MB para ${kind}.`);
  }
}

/** Bucket a usar: o primeiro candidato que existe (resultado guardado enquanto o servidor estiver de pé). */
async function getBucket() {
  const app = getFirebaseAdminApp();
  if (!app) throw new ErroStorage("Envio de imagens indisponível: as credenciais do Firebase não estão configuradas no servidor.");
  const storage = getStorage(app);
  if (bucketEscolhido) return storage.bucket(bucketEscolhido);

  const candidatos = candidatosDeBucket(process.env);
  if (candidatos.length === 0) throw new ErroStorage(`Envio de imagens indisponível: ${explicarErroStorage(new Error("bucket name"))}`);
  let ultimoErro: unknown = null;
  for (const nome of candidatos) {
    try {
      const [existe] = await storage.bucket(nome).exists();
      if (existe) {
        bucketEscolhido = nome;
        return storage.bucket(nome);
      }
    } catch (err) {
      // Sem permissão para consultar o bucket (storage.buckets.get) não quer dizer que não dá
      // para gravar nele: usa assim mesmo; se a gravação falhar, o erro diz o motivo.
      if ((err as { code?: number }).code === 403) {
        bucketEscolhido = nome;
        return storage.bucket(nome);
      }
      ultimoErro = err;
    }
  }
  console.error("Firebase Storage: nenhum bucket utilizável", candidatos, ultimoErro);
  throw new ErroStorage(`Envio de imagens indisponível: ${explicarErroStorage(ultimoErro ?? { code: 404 })}`);
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
  await guardarArquivo(path, buffer, mimeType);
  return { path, resourceType: kind };
}

/** Grava um arquivo já validado no armazenamento privado (Blob ou Firebase), no caminho dado. */
export async function guardarArquivo(path: string, buffer: Buffer, mimeType: string): Promise<void> {
  if (provedorDeMidia() === "blob") {
    try {
      await salvarNoBlob(path, buffer, mimeType);
    } catch (err) {
      console.error("Vercel Blob: falha ao gravar", err);
      throw new ErroStorage(`Não foi possível guardar a imagem: ${(err as Error)?.message ?? String(err)}`);
    }
    return;
  }

  const file = (await getBucket()).file(path);
  try {
    await file.save(buffer, { metadata: { contentType: mimeType }, resumable: false });
  } catch (err) {
    console.error("Firebase Storage: falha ao gravar", err);
    throw new ErroStorage(`Não foi possível guardar a imagem: ${explicarErroStorage(err)}`);
  }
}

/** Gera uma URL assinada de leitura, válida por tempo limitado, para exibir a mídia no app. */
export async function getSignedMediaUrl(path: string): Promise<string> {
  if (provedorDeMidia() === "blob") return linkDoBlob(path, SIGNED_URL_TTL_MS);
  const [url] = await (await getBucket()).file(path).getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
  return url;
}

const HORA_MS = 60 * 60 * 1000;

/**
 * Link curto (1 a 2 horas) e estável dentro da mesma hora: telas que consultam a cada poucos
 * segundos (conversa) recebem o mesmo endereço e o navegador não baixa a imagem de novo.
 */
export async function getShortSignedMediaUrl(path: string, agora = Date.now()): Promise<string> {
  const inicioDaHora = Math.floor(agora / HORA_MS) * HORA_MS;
  if (provedorDeMidia() === "blob") return linkAssinado(path, 2 * HORA_MS, inicioDaHora);
  const [url] = await (await getBucket()).file(path).getSignedUrl({ action: "read", expires: inicioDaHora + 2 * HORA_MS });
  return url;
}

/** Diagnóstico: grava e apaga um arquivo de teste no bucket. */
export async function testarStorage(): Promise<{ ok: boolean; detalhe?: string }> {
  if (provedorDeMidia() === "blob") {
    const caminho = `classlink/diagnostico/teste-${randomUUID()}.txt`;
    try {
      await salvarNoBlob(caminho, Buffer.from("ok"), "text/plain");
      await apagarDoBlob(caminho).catch(() => undefined);
      return { ok: true, detalhe: "Vercel Blob (privado)" };
    } catch (err) {
      return { ok: false, detalhe: `Vercel Blob: ${(err as Error)?.message ?? String(err)}` };
    }
  }
  try {
    const bucket = await getBucket();
    const arquivo = bucket.file(`diagnostico/teste-${randomUUID()}.txt`);
    await arquivo.save("ok", { resumable: false, metadata: { contentType: "text/plain" } });
    await arquivo.getSignedUrl({ action: "read", expires: Date.now() + 60_000 });
    await arquivo.delete().catch(() => undefined);
    return { ok: true, detalhe: `bucket ${bucket.name}` };
  } catch (err) {
    return { ok: false, detalhe: err instanceof ErroDeUsuario ? err.message : explicarErroStorage(err) };
  }
}
