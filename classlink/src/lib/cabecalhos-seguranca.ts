/**
 * Cabeçalhos de segurança aplicados a todas as respostas (ver next.config.ts).
 *
 * A CSP aqui é deliberadamente restrita ao que não quebra páginas: impede que o sistema
 * seja embutido em outro site (clickjacking), plug-ins e <base>/formulários para fora.
 *
 * A CSP completa (script-src etc.) roda em modo Report-Only: o navegador NÃO bloqueia nada,
 * só avisa em /api/csp-report (log da Vercel) o que uma política restritiva barraria. Depois
 * de alguns dias sem violações legítimas, a mesma política passa a valer (Content-Security-Policy).
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
  "connect-src 'self' https://*.googleapis.com",
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
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "Content-Security-Policy-Report-Only", value: CSP_COMPLETA },
];
