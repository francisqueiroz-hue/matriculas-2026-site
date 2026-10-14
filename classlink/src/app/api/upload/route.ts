import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { uploadMedia, getSignedMediaUrl, assertUploadSize } from "@/lib/firebase-storage";
import { detectarTipoMidia } from "@/lib/tipo-midia";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
    }

    let kind: "image" | "video";
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) kind = "image";
    else if (ALLOWED_VIDEO_TYPES.includes(file.type)) kind = "video";
    else return NextResponse.json({ error: "Tipo de arquivo não suportado" }, { status: 415 });

    // Recusa antes de ler o corpo inteiro para a memória.
    assertUploadSize(file.size, kind);

    const buffer = Buffer.from(await file.arrayBuffer());
    // O tipo informado pelo navegador é falsificável: vale o que os bytes do arquivo dizem.
    const real = detectarTipoMidia(buffer);
    if (!real || real.kind !== kind) {
      return NextResponse.json({ error: "O conteúdo do arquivo não corresponde a uma imagem ou vídeo suportado" }, { status: 415 });
    }
    const result = await uploadMedia(buffer, real.kind, `classlink/${session.schoolId}`, real.mime);
    const url = await getSignedMediaUrl(result.path);

    return NextResponse.json({ url, path: result.path, mediaType: result.resourceType });
  } catch (error) {
    return handleApiError(error);
  }
}
