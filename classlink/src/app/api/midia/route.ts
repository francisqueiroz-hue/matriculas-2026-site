import { NextRequest } from "next/server";
import { conferirLink } from "@/lib/midia-assinada";
import { lerDoBlob } from "@/lib/blob-storage";

/** Entrega uma mídia privada do Vercel Blob a quem tem o link assinado (e ainda válido). */
export async function GET(request: NextRequest) {
  const caminho = conferirLink(request.nextUrl.searchParams);
  if (!caminho) return new Response("Link inválido ou vencido", { status: 403 });
  try {
    const arquivo = await lerDoBlob(caminho);
    if (!arquivo || arquivo.statusCode !== 200) return new Response("Arquivo não encontrado", { status: 404 });
    return new Response(arquivo.stream, {
      headers: {
        "Content-Type": arquivo.blob.contentType,
        "Content-Length": String(arquivo.blob.size),
        // O conteúdo de um caminho nunca muda (nome aleatório): o navegador pode guardar.
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Falha ao ler mídia do Blob", err);
    return new Response("Não foi possível carregar o arquivo", { status: 502 });
  }
}
