/** "24/09/2026 às 12:36" — formato único de data e hora do app, sem segundos. */
export function formatarDataHora(valor: string | Date): string {
  const d = typeof valor === "string" ? new Date(valor) : valor;
  const data = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
}

function inicioDoDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Hoje", "Amanhã" ou null — para destacar eventos próximos sem esconder a data completa. */
export function rotuloDiaRelativo(valor: string | Date, agora: Date = new Date()): "Hoje" | "Amanhã" | null {
  const d = typeof valor === "string" ? new Date(valor) : valor;
  const dias = Math.round((inicioDoDia(d) - inicioDoDia(agora)) / 86_400_000);
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  return null;
}
