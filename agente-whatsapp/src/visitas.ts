import type { Db } from "./db";
import { chaveTelefone } from "./telefone";

export interface Horario {
  id: number;
  data: string;
  turno: "manha" | "tarde";
  vagas: number;
}
export type ResultadoReserva = { ok: true; id: number } | { ok: false; motivo: "lotado" | "inexistente" | "duplicada" | "so_com_equipe" };

/** Hoje no fuso de Brasília (UTC-3), em AAAA-MM-DD. */
export const hojeBR = (agora = new Date()): string => new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Visitas acontecem à tarde (13h–17h), em dias úteis; a secretaria combina o horário exato.
 * Cria, sem duplicar, um dia de visita por dia útil dos próximos `dias`. A manhã (9h–11h) é
 * exceção combinada pela equipe e nunca é gerada nem reservada automaticamente.
 */
export async function gerarHorariosTarde(db: Db, agora = new Date(), dias = 14, vagas = 3): Promise<number> {
  const base = new Date(`${hojeBR(agora)}T00:00:00Z`).getTime();
  let criados = 0;
  for (let i = 1; i <= dias; i++) {
    const d = new Date(base + i * 86_400_000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const data = d.toISOString().slice(0, 10);
    if (await db.first("SELECT id FROM visitas_horarios WHERE data = ? AND turno = 'tarde'", [data])) continue;
    await db.run("INSERT INTO visitas_horarios (data, turno, vagas) VALUES (?, 'tarde', ?)", [data, vagas]);
    criados++;
  }
  return criados;
}

export function horariosLivres(db: Db, aPartirDe: string): Promise<Horario[]> {
  return db.all<Horario>("SELECT id, data, turno, vagas FROM visitas_horarios WHERE vagas > 0 AND data >= ? ORDER BY data, turno", [aPartirDe]);
}

/** A vaga é tomada por um UPDATE condicional (atômico no D1); só então a reserva é gravada. */
export async function reservar(db: Db, telefone: string, horarioId: number, serie: string): Promise<ResultadoReserva> {
  const chave = chaveTelefone(telefone);
  const horario = await db.first<{ data: string; turno: string }>("SELECT data, turno FROM visitas_horarios WHERE id = ?", [horarioId]);
  if (!horario || horario.data < hojeBR()) return { ok: false, motivo: "inexistente" };
  if (horario.turno !== "tarde") return { ok: false, motivo: "so_com_equipe" };
  if (await db.first("SELECT id FROM visitas WHERE telefone = ? AND horario_id = ?", [chave, horarioId])) return { ok: false, motivo: "duplicada" };
  const tomou = await db.run("UPDATE visitas_horarios SET vagas = vagas - 1 WHERE id = ? AND vagas > 0", [horarioId]);
  if (tomou.changes === 0) return { ok: false, motivo: "lotado" };
  try {
    const r = await db.run("INSERT INTO visitas (telefone, horario_id, serie, criado_em) VALUES (?, ?, ?, ?)", [chave, horarioId, serie, Date.now()]);
    return { ok: true, id: r.lastId };
  } catch {
    await db.run("UPDATE visitas_horarios SET vagas = vagas + 1 WHERE id = ?", [horarioId]);
    return { ok: false, motivo: "duplicada" };
  }
}
