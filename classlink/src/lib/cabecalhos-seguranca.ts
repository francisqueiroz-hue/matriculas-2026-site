/**
 * Cabeçalhos de segurança aplicados a todas as respostas (ver next.config.ts).
 *
 * A CSP aqui é deliberadamente restrita ao que não quebra páginas: impede que o sistema
 * seja embutido em outro site (clickjacking), plug-ins e <base>/formulários para fora.
 * Uma CSP completa (script-src) exige mapear scripts do Next, Firebase e da página de
 * matrículas, e fica para um passo à parte, primeiro em modo de relatório.
 */
export const CABECALHOS_SEGURANCA: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];
