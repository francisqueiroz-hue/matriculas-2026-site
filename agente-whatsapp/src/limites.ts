import type { Db } from "./db";
import type { Provedor } from "./provedor";

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

/** Conta mais uma resposta para o contato na hora corrente; devolve o total da hora. */
export async function contarContato(db: Db, telefone: string, agora = new Date()): Promise<number> {
  const chave = `c:${telefone}:${agora.toISOString().slice(0, 13)}`;
  await somar(db, chave, 1);
  return ler(db, chave);
}

/** Corte diário de IA (LIMITE_TOKENS_DIA); 0 ou ausente = sem corte. */
export async function podeUsarIA(db: Db, limiteTokens: number, agora = new Date()): Promise<boolean> {
  return !(limiteTokens > 0) || (await ler(db, `tok:${diaChave(agora)}`)) < limiteTokens;
}

/** Envolve um provedor para somar ao contador do dia os tokens de TODA chamada (triagem, resposta, cron). */
export function contandoTokens(db: Db, p: Provedor): Provedor {
  return {
    async gerar(req) {
      const r = await p.gerar(req);
      if (r.tokens > 0) await registrarTokens(db, r.tokens).catch(() => undefined);
      return r;
    },
  };
}
