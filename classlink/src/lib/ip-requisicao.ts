/**
 * IP do cliente, para limitar abuso. Na Vercel, `x-vercel-forwarded-for` e `x-real-ip` são
 * escritos pela plataforma e o cliente não consegue forjar; o primeiro item de `x-forwarded-for`
 * é só o último recurso (fora da Vercel ele pode ser forjado, então vale menos).
 * Devolve null quando não há IP, e quem chama deve então pular o limite por IP
 * (um balde "desconhecido" compartilhado bloquearia todo mundo junto).
 */
export function ipDaRequisicao(headers: Pick<Headers, "get">): string | null {
  const candidatos = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const bruto of candidatos) {
    const ip = bruto?.trim();
    if (ip && ip.length <= 64) return ip;
  }
  return null;
}
