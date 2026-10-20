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

export interface ViolacaoCsp {
  /** Diretiva efetiva (ex.: script-src-elem). */
  diretiva: string;
  /** O que foi bloqueado: origem (sem caminho/consulta) ou palavra-chave (inline, eval, data...). */
  bloqueado: string;
  /** Só o caminho da página (sem domínio, consulta nem fragmento). */
  pagina: string;
  /** Chave de agrupamento: a mesma violação repetida soma no mesmo registro. */
  chave: string;
}

/** Reduz uma URL a protocolo+host (ou ao esquema, como chrome-extension). Sem dados pessoais. */
export function origemDe(valor: string): string {
  const v = valor.trim();
  if (!v) return "(vazio)";
  try {
    const url = new URL(v);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    return `${url.protocol}//`;
  } catch {
    return v.slice(0, 40);
  }
}

function caminhoDe(valor: string): string {
  try {
    return new URL(valor).pathname.slice(0, 120) || "/";
  } catch {
    return "(desconhecida)";
  }
}

/** Extrai a violação agrupável de um relatório; null se o formato não for reconhecido. */
export function extrairViolacao(corpo: unknown): ViolacaoCsp | null {
  const r = extrair(corpo);
  if (!r) return null;
  const diretiva = curto(r["effective-directive"] || r["violated-directive"]).split(" ")[0] || "(desconhecida)";
  const bloqueado = origemDe(curto(r["blocked-uri"]));
  const pagina = caminhoDe(curto(r["document-uri"]));
  return { diretiva, bloqueado, pagina, chave: `${diretiva}|${bloqueado}|${pagina}` };
}
