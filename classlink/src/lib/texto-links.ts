/**
 * Divide um texto em trechos comuns e endereços https:// (para exibir como link). Só https: nada
 * de javascript:, http: ou outros esquemas. Pontuação final ("." "," ")") fica fora do link.
 */
export function partesComLinks(texto: string): { texto: string; link: boolean }[] {
  const partes: { texto: string; link: boolean }[] = [];
  const re = /https:\/\/[^\s<>"]+/g;
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    let url = m[0];
    const sobra = url.match(/[.,;:!?)\]]+$/)?.[0] ?? "";
    if (sobra) url = url.slice(0, -sobra.length);
    const inicio = m.index ?? 0;
    if (inicio > ultimo) partes.push({ texto: texto.slice(ultimo, inicio), link: false });
    partes.push({ texto: url, link: true });
    ultimo = inicio + url.length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), link: false });
  return partes;
}
