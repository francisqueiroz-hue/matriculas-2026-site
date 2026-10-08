import type { Db } from "./db";
import { chaveTelefone } from "./telefone";

export interface Horario {
  id: number;
  data: string;
  turno: "manha" | "tarde";
  vagas: number;
}
export type ResultadoReserva = { ok: true; id: number } | { ok: false; motivo: "lotado" | "inexistente" | "duplicada" };

export function horariosLivres(db: Db, aPartirDe: string): Promise<Horario[]> {
  return db.all<Horario>("SELECT id, data, turno, vagas FROM visitas_horarios WHERE vagas > 0 AND data >= ? ORDER BY data, turno", [aPartirDe]);
}

/** A vaga é tomada por um UPDATE condicional (atômico no D1); só então a reserva é gravada. */
export async function reservar(db: Db, telefone: string, horarioId: number, serie: string): Promise<ResultadoReserva> {
  const chave = chaveTelefone(telefone);
  if (!(await db.first("SELECT id FROM visitas_horarios WHERE id = ?", [horarioId]))) return { ok: false, motivo: "inexistente" };
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
