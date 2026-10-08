import { describe, expect, it } from "vitest";
import { sqliteDb } from "./sqlite-db";
import { podeEnviar, registrarEnvio, registrarTokens, usoDoMes } from "../src/limites";

describe("limites de custo", () => {
  it("bloqueia ao atingir o limite e zera na virada do mês", async () => {
    const db = sqliteDb();
    const out = new Date("2026-10-20T12:00:00Z");
    for (let i = 0; i < 3; i++) {
      expect(await podeEnviar(db, 3, out)).toBe(true);
      await registrarEnvio(db, out);
    }
    expect(await podeEnviar(db, 3, out)).toBe(false);
    expect(await podeEnviar(db, 3, new Date("2026-11-02T12:00:00Z"))).toBe(true);
  });
  it("contagem concorrente não perde incrementos", async () => {
    const db = sqliteDb();
    const agora = new Date("2026-10-20T12:00:00Z");
    await Promise.all(Array.from({ length: 20 }, () => registrarEnvio(db, agora)));
    expect((await usoDoMes(db, agora)).mensagens).toBe(20);
  });
  it("acumula tokens do dia", async () => {
    const db = sqliteDb();
    const agora = new Date("2026-10-20T12:00:00Z");
    await registrarTokens(db, 100, agora);
    await registrarTokens(db, 50, agora);
    expect((await usoDoMes(db, agora)).tokensHoje).toBe(150);
  });
});
