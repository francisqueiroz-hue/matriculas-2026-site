const DESTINO_PADRAO = "/dashboard";
const TAMANHO_MAXIMO = 2048;
// Origem fictícia, só para o URL parser resolver o caminho (sem depender do navegador).
const ORIGEM_BASE = "http://classlink.invalid";

/**
 * Valida o parâmetro `next` da tela de login. O proxy só gera `next` com um caminho
 * interno do painel, mas a URL pode ser montada por qualquer pessoa (`/login?next=https://...`);
 * sem validar, o login redirecionaria para fora do app (open redirect). Só aceita caminhos
 * dentro de /dashboard na mesma origem; qualquer outra coisa volta para /dashboard.
 */
export function destinoPosLogin(next: string | null | undefined): string {
  if (typeof next !== "string" || next.length === 0 || next.length > TAMANHO_MAXIMO) return DESTINO_PADRAO;

  // Barra invertida e caracteres de controle (tab, quebra de linha) são normalizados de
  // formas diferentes pelos navegadores e servem para disfarçar "//" ou "https:".
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return DESTINO_PADRAO;
  if (!next.startsWith("/") || next.startsWith("//")) return DESTINO_PADRAO;

  let url: URL;
  try {
    url = new URL(next, ORIGEM_BASE);
  } catch {
    return DESTINO_PADRAO;
  }

  if (url.origin !== ORIGEM_BASE) return DESTINO_PADRAO;
  // Conferido depois de resolver "..": "/dashboard/../login" vira "/login" e é recusado.
  const dentroDoPainel = url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/");
  if (!dentroDoPainel) return DESTINO_PADRAO;

  return `${url.pathname}${url.search}${url.hash}`;
}
