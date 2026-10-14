export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/**
 * CORS do formulário público. Sem MATRICULAS_ALLOWED_ORIGINS fica aberto (`*`, sem cookies),
 * como sempre foi. Com a variável (origens separadas por vírgula, ex.:
 * "https://espacokidspiratininga.com.br,https://www.institutofokus.com.br"), só essas origens
 * recebem permissão; as demais ficam sem `Access-Control-Allow-Origin` e o navegador bloqueia.
 * Atenção: liste TODOS os sites que hospedam o formulário (inclusive o GitHub Pages, se usado).
 */
export function cabecalhosCors(origem: string | null, permitidas = process.env.MATRICULAS_ALLOWED_ORIGINS): Record<string, string> {
  const lista = (permitidas ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (lista.length === 0) return { ...CORS_HEADERS };
  const { "Access-Control-Allow-Origin": _aberto, ...resto } = CORS_HEADERS;
  void _aberto;
  const base: Record<string, string> = { ...resto, Vary: "Origin" };
  if (origem && lista.includes(origem.replace(/\/$/, ""))) base["Access-Control-Allow-Origin"] = origem;
  return base;
}
