import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { horariosLivres, reservar } from "../src/visitas";

async function horario(db: ReturnType<typeof sqliteDb>, vagas: number, data = "2099-11-10") {
  const r = await db.run("INSERT INTO visitas_horarios (data, turno, vagas) VALUES (?, 'manha', ?)", [data, vagas]);
  return r.lastId;
}

describe("visitas", () => {
  it("reserva reduz vagas e some quando lota", async () => {
    const db = sqliteDb();
    const id = await horario(db, 1);
    expect(await horariosLivres(db, "2099-11-01")).toHaveLength(1);
    expect(await reservar(db, "5521900000001", id, "6º ano")).toMatchObject({ ok: true });
    expect(await horariosLivres(db, "2099-11-01")).toEqual([]);
  });
  it("duas reservas simultâneas na última vaga: uma ok e uma lotado", async () => {
    const db = sqliteDb();
    const id = await horario(db, 1);
    const r = await Promise.all([reservar(db, "5521900000001", id, "6º ano"), reservar(db, "5521900000002", id, "7º ano")]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.find((x) => !x.ok)).toMatchObject({ motivo: "lotado" });
  });
  it("mesma família no mesmo horário = duplicada, sem consumir outra vaga", async () => {
    const db = sqliteDb();
    const id = await horario(db, 3);
    await reservar(db, "5521900000001", id, "6º ano");
    expect(await reservar(db, "5521900000001", id, "6º ano")).toMatchObject({ ok: false, motivo: "duplicada" });
    expect((await db.first<{ vagas: number }>("SELECT vagas FROM visitas_horarios WHERE id = ?", [id]))!.vagas).toBe(2);
  });
  it("horário inexistente e agenda vazia", async () => {
    const db = sqliteDb();
    expect(await reservar(db, "5521900000001", 999, "6º ano")).toMatchObject({ ok: false, motivo: "inexistente" });
    expect(await horariosLivres(db, "2099-11-01")).toEqual([]);
  });
  it("não lista horários passados", async () => {
    const db = sqliteDb();
    await horario(db, 2, "2026-01-01");
    expect(await horariosLivres(db, "2099-11-01")).toEqual([]);
  });
});
