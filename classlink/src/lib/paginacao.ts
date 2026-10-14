/** Acrescenta uma página nova à lista atual, sem repetir itens (por id) e mantendo a ordem. */
export function juntarPaginas<T extends { id: string }>(atual: T[], nova: T[]): T[] {
  const vistos = new Set(atual.map((item) => item.id));
  const extras: T[] = [];
  for (const item of nova) {
    if (vistos.has(item.id)) continue;
    vistos.add(item.id);
    extras.push(item);
  }
  return extras.length === 0 ? atual : [...atual, ...extras];
}
