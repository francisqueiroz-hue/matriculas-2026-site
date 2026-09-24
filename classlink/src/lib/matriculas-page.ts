/**
 * A página pública de matrículas tem uma única fonte: `site/index.html` (na raiz do
 * repositório), que também é publicada no GitHub Pages e pode ser enviada para a
 * hospedagem do site da escola. Dentro do ClassLink ela é servida em `/matriculas`
 * a partir de `public/matriculas.html`, gerado por `npm run sync:matriculas` com
 * esta transformação:
 *  - imagens `assets/...` passam a usar as logos que o app já tem em `/logos/...`;
 *  - links absolutos para o ClassLink viram caminhos relativos, abrindo na mesma aba.
 */

/** Endereço público do ClassLink usado nos links da versão estática da página. */
export const CLASSLINK_URL = "https://matriculas-2026-site-murex.vercel.app";

export const GENERATED_HEADER =
  "<!-- Arquivo gerado a partir de site/index.html por `npm run sync:matriculas`. Não edite à mão. -->\n";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toClassLinkPage(siteHtml: string): string {
  const appUrl = escapeRegExp(CLASSLINK_URL);

  const html = siteHtml
    .replace(/(src|href)="assets\//g, '$1="/logos/')
    .replace(new RegExp(`href="${appUrl}(/[^"]*)"\\s+target="_blank"\\s+rel="noopener"`, "g"), 'href="$1"')
    .replace(new RegExp(appUrl, "g"), "");

  if (/(src|href)="assets\//.test(html)) {
    throw new Error("Sobrou referência a assets/ na página de matrículas.");
  }

  return html.replace(/^<!doctype html>\n?/i, (doctype) => doctype + GENERATED_HEADER);
}
