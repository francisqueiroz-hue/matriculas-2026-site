/**
 * Resume um relatório de violação de CSP (formatos `application/csp-report` e
 * `application/reports+json`) em uma linha curta para o log. Só copia campos conhecidos e
 * limita o tamanho: o endpoint é público e o conteúdo vem do navegador de qualquer pessoa.
 */
const CAMPOS = ["effective-directive", "violated-directive", "blocked-uri", "document-uri", "source-file", "line-number", "disposition"] as const;

function curto(v: unknown): string {
  return String(v ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 200);
}

function extrair(corpo: unknown): Record<string, unknown> | null {
  if (!corpo || typeof corpo !== "object") return null;
  const obj = corpo as Record<string, unknown>;
  if (obj["csp-report"] && typeof obj["csp-report"] === "object") return obj["csp-report"] as Record<string, unknown>;
  if (Array.isArray(corpo)) {
    const item = corpo.find((r) => r && typeof r === "object" && (r as { type?: string }).type === "csp-violation") as
      | { body?: Record<string, unknown> }
      | undefined;
    const b = item?.body;
    if (!b) return null;
    // Reporting API usa camelCase; normaliza para os nomes do formato antigo.
    return {
      "effective-directive": b.effectiveDirective,
      "violated-directive": b.effectiveDirective,
      "blocked-uri": b.blockedURL,
      "document-uri": b.documentURL,
      "source-file": b.sourceFile,
      "line-number": b.lineNumber,
      disposition: b.disposition,
    };
  }
  return null;
}

export function resumirRelatorioCsp(corpo: unknown): string | null {
  const r = extrair(corpo);
  if (!r) return null;
  return CAMPOS.map((c) => `${c}=${curto(r[c])}`).join(" ");
}
