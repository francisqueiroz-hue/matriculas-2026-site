import type { Db } from "./db";
import { chaveTelefone } from "./telefone";
import type { Eco } from "./webhook";

export type Direcao = "entrada" | "lia" | "humano";
export interface Mensagem {
  id: number;
  telefone: string;
  direcao: Direcao;
  texto: string;
  wamid: string | null;
  ts: number;
}
const HORA = 3600_000;

export async function registrarMensagem(db: Db, m: { telefone: string; direcao: Direcao; texto: string; wamid?: string; ts?: number }): Promise<void> {
  const tel = chaveTelefone(m.telefone);
  const ts = m.ts ?? Date.now();
  await db.run("INSERT INTO mensagens (telefone, direcao, texto, wamid, ts) VALUES (?, ?, ?, ?, ?)", [tel, m.direcao, m.texto, m.wamid ?? null, ts]);
  await db.run("INSERT INTO conversas (telefone, ultima_msg_em) VALUES (?, ?) ON CONFLICT(telefone) DO UPDATE SET ultima_msg_em = MAX(ultima_msg_em, excluded.ultima_msg_em)", [tel, ts]);
}

export function historico(db: Db, telefone: string, limite = 50): Promise<Mensagem[]> {
  return db.all<Mensagem>(
    "SELECT * FROM (SELECT * FROM mensagens WHERE telefone = ? ORDER BY ts DESC, id DESC LIMIT ?) ORDER BY ts, id",
    [chaveTelefone(telefone), limite],
  );
}

export async function assumir(db: Db, telefone: string, horas = 12, agora = new Date()): Promise<void> {
  await db.run(
    "INSERT INTO conversas (telefone, humano_ate, ultima_msg_em) VALUES (?, ?, ?) ON CONFLICT(telefone) DO UPDATE SET humano_ate = excluded.humano_ate",
    [chaveTelefone(telefone), agora.getTime() + horas * HORA, agora.getTime()],
  );
}

export async function devolver(db: Db, telefone: string): Promise<void> {
  await db.run("UPDATE conversas SET humano_ate = 0 WHERE telefone = ?", [chaveTelefone(telefone)]);
}

export async function liaPausada(db: Db, telefone: string, agora = new Date()): Promise<boolean> {
  const c = await db.first<{ humano_ate: number }>("SELECT humano_ate FROM conversas WHERE telefone = ?", [chaveTelefone(telefone)]);
  return (c?.humano_ate ?? 0) > agora.getTime();
}

/** Resposta digitada pela equipe no app (coexistência): registra e pausa a Lia — exceto eco de mensagem da própria Lia. */
export async function registrarEco(db: Db, eco: Eco, horas = 12, agora = new Date()): Promise<void> {
  if (await db.first("SELECT id FROM mensagens WHERE wamid = ?", [eco.wamid])) return;
  await registrarMensagem(db, { telefone: eco.para, direcao: "humano", texto: eco.texto, wamid: eco.wamid, ts: eco.ts ? eco.ts * 1000 : agora.getTime() });
  await assumir(db, eco.para, horas, agora);
}

export async function liaLigada(db: Db): Promise<boolean> {
  return (await db.first<{ valor: string }>("SELECT valor FROM config WHERE chave = 'lia_ligada'"))?.valor !== "0";
}
export async function definirLiaLigada(db: Db, ligada: boolean): Promise<void> {
  await db.run("INSERT INTO config (chave, valor) VALUES ('lia_ligada', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [ligada ? "1" : "0"]);
}

export async function listarConversas(db: Db, agora = new Date()) {
  const linhas = await db.all<{ telefone: string; ts: number; humano_ate: number; ultima: string | null; abertos: number }>(
    `SELECT c.telefone AS telefone, c.ultima_msg_em AS ts, c.humano_ate AS humano_ate,
            (SELECT texto FROM mensagens m WHERE m.telefone = c.telefone ORDER BY ts DESC, id DESC LIMIT 1) AS ultima,
            (SELECT COUNT(*) FROM chamados h WHERE h.telefone = c.telefone AND h.status = 'aberto') AS abertos
       FROM conversas c ORDER BY c.ultima_msg_em DESC`,
  );
  return linhas.map((l) => ({ telefone: l.telefone, ultima: l.ultima ?? "", ts: l.ts, humano: l.humano_ate > agora.getTime(), chamadosAbertos: l.abertos }));
}

export async function apagarAntigas(db: Db, dias = 90, agora = new Date()): Promise<number> {
  const r = await db.run("DELETE FROM mensagens WHERE ts < ?", [agora.getTime() - dias * 24 * HORA]);
  return r.changes;
}
