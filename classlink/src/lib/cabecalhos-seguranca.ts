/**
 * Cabeçalhos de segurança aplicados a todas as respostas (ver next.config.ts).
 *
 * A CSP completa vale de verdade (Content-Security-Policy): o navegador bloqueia o que não está
 * listado e avisa em /api/csp-report (vai para o banco e o quadro "Saúde do sistema" do
 * Painel). Ativada em 28/10/2026 depois de uma semana em modo Report-Only sem violações
 * legítimas (a única recorrente era o teste de eval do Zod, desligado em zod-sem-eval).
 */
export const CSP_COMPLETA = [
  "default-src 'self'",
  // 'unsafe-inline': o Next e a página de matrículas usam scripts inline; o passo seguinte
  // (nonce por requisição) tira isso. gstatic: service worker do Firebase (importScripts).
  "script-src 'self' 'unsafe-inline' https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  // Fotos dos avisos/cardápios: URLs assinadas do Google Cloud Storage.
  "img-src 'self' data: blob: https://storage.googleapis.com",
  "media-src 'self' blob: https://storage.googleapis.com",
  "font-src 'self' data:",
  // Firebase (instalações, FCM) e Storage ficam em *.googleapis.com.
  // Vercel Blob: envio direto de arquivos grandes (link pré-assinado) a partir do navegador.
  "connect-src 'self' https://*.googleapis.com https://vercel.com https://*.blob.vercel-storage.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/csp-report",
].join("; ");

export const CABECALHOS_SEGURANCA: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: CSP_COMPLETA },
];
