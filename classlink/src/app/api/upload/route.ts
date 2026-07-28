import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { uploadMedia, getSignedMediaUrl } from "@/lib/firebase-storage";

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

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadMedia(buffer, kind, `classlink/${session.schoolId}`, file.type);
    const url = await getSignedMediaUrl(result.path);

    return NextResponse.json({ url, path: result.path, mediaType: result.resourceType });
  } catch (error) {
    return handleApiError(error);
  }
}
