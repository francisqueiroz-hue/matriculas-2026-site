export interface EventoAgenda {
  startsAt: string;
  endsAt: string | null;
}

/**
 * Separa a agenda em próximos (inclui o que está acontecendo agora) e anteriores.
 * Próximos: do mais cedo para o mais tarde — o primeiro é o destaque.
 * Anteriores: do mais recente para o mais antigo.
 */
export function separarEventos<T extends EventoAgenda>(eventos: T[], agora: Date = new Date()) {
  const t = agora.getTime();
  const fim = (e: T) => new Date(e.endsAt ?? e.startsAt).getTime();
  const inicio = (e: T) => new Date(e.startsAt).getTime();
  const proximos = eventos.filter((e) => fim(e) >= t).sort((a, b) => inicio(a) - inicio(b));
  const anteriores = eventos.filter((e) => fim(e) < t).sort((a, b) => inicio(b) - inicio(a));
  return { proximos, anteriores };
}
