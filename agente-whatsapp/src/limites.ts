import type { Db } from "./db";

// Mês no fuso de Brasília (UTC-3); tokens por dia UTC, que é quando o Workers AI renova a cota.
const mesChave = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 7);
const diaChave = (d: Date) => d.toISOString().slice(0, 10);

async function somar(db: Db, chave: string, n: number) {
  await db.run("INSERT INTO uso (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = valor + ?", [chave, n, n]);
}
async function ler(db: Db, chave: string): Promise<number> {
  return (await db.first<{ valor: number }>("SELECT valor FROM uso WHERE chave = ?", [chave]))?.valor ?? 0;
}

export async function podeEnviar(db: Db, limiteMes: number, agora = new Date()): Promise<boolean> {
  return (await ler(db, `msg:${mesChave(agora)}`)) < limiteMes;
}
export const registrarEnvio = (db: Db, agora = new Date()) => somar(db, `msg:${mesChave(agora)}`, 1);
export const registrarTokens = (db: Db, n: number, agora = new Date()) => somar(db, `tok:${diaChave(agora)}`, n);
export async function usoDoMes(db: Db, agora = new Date()) {
  return { mensagens: await ler(db, `msg:${mesChave(agora)}`), tokensHoje: await ler(db, `tok:${diaChave(agora)}`) };
}
