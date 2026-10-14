import { formatarDataHora } from "@/lib/datas";

export interface ReciboLeitura {
  /** ✓ enviada · ✓✓ lida */
  marca: "✓" | "✓✓";
  lida: boolean;
  texto: string;
}

/** Recibo de uma mensagem enviada por mim: "Enviada" ou "Lida em 14/10/2026 às 14:05" (horário gravado pelo servidor). */
export function reciboDeLeitura(readAt: string | Date | null | undefined): ReciboLeitura {
  if (!readAt) return { marca: "✓", lida: false, texto: "Enviada" };
  return { marca: "✓✓", lida: true, texto: `Lida em ${formatarDataHora(readAt)}` };
}
