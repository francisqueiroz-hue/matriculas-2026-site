import { v2 as cloudinary } from "cloudinary";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Credenciais do Cloudinary não configuradas (CLOUDINARY_*)");
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

export interface UploadResult {
  url: string;
  resourceType: "image" | "video";
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB (imagem já deve chegar comprimida do cliente)
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB

export function assertUploadSize(bytes: number, kind: "image" | "video") {
  const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (bytes > limit) {
    throw new Error(`Arquivo muito grande. Limite de ${Math.round(limit / 1024 / 1024)}MB para ${kind}.`);
  }
}

export async function uploadMedia(buffer: Buffer, kind: "image" | "video", folder: string): Promise<UploadResult> {
  ensureConfigured();
  assertUploadSize(buffer.byteLength, kind);

  const result = await new Promise<{ secure_url: string; resource_type: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: kind, folder },
      (error, uploadResult) => {
        if (error || !uploadResult) return reject(error ?? new Error("Falha no upload"));
        resolve(uploadResult as { secure_url: string; resource_type: string });
      },
    );
    stream.end(buffer);
  });

  return { url: result.secure_url, resourceType: kind };
}
