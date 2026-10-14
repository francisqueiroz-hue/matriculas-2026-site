/** Acima disso, o aviso aparece recolhido com "Ler mais" (cardápios e comunicados longos não tomam o Mural). */
export const LIMITE_CARACTERES = 360;
export const LIMITE_LINHAS = 7;

export function precisaRecolher(texto: string): boolean {
  return texto.length > LIMITE_CARACTERES || texto.split("\n").length > LIMITE_LINHAS;
}
