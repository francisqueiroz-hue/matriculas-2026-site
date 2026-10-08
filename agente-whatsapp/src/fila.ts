import { adicionar } from "./conhecimento";
import type { Db } from "./db";

export interface Chamado {
  id: number;
  telefone: string;
  categoria: string;
  prioridade: string;
  resumo: string;
  rascunho: string | null;
  status: string;
  criado_em: number;
}
export interface Sugestao {
  id: number;
  pergunta: string;
  resposta: string;
  frequencia: number;
  status: string;
}

export async function abrirChamado(db: Db, c: { telefone: string; categoria: string; prioridade: string; resumo: string; rascunho?: string }): Promise<number> {
  const r = await db.run("INSERT INTO chamados (telefone, categoria, prioridade, resumo, rascunho, criado_em) VALUES (?, ?, ?, ?, ?, ?)", [
    c.telefone, c.categoria, c.prioridade, c.resumo, c.rascunho ?? null, Date.now(),
  ]);
  return r.lastId;
}

export function listarChamados(db: Db, status?: string): Promise<Chamado[]> {
  const ordem = "ORDER BY CASE prioridade WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END, criado_em DESC";
  return status
    ? db.all<Chamado>(`SELECT * FROM chamados WHERE status = ? ${ordem}`, [status])
    : db.all<Chamado>(`SELECT * FROM chamados ${ordem}`);
}

export async function resolverChamado(db: Db, id: number): Promise<void> {
  await db.run("UPDATE chamados SET status = 'resolvido' WHERE id = ?", [id]);
}

export function listarSugestoes(db: Db): Promise<Sugestao[]> {
  return db.all<Sugestao>("SELECT id, pergunta, resposta, frequencia, status FROM sugestoes WHERE status = 'pendente' ORDER BY frequencia DESC, id");
}

/** Aprovar publica na base (com a resposta editada, se houver); rejeitar só encerra a sugestão. */
export async function decidirSugestao(db: Db, id: number, aprovar: boolean, respostaEditada?: string): Promise<void> {
  const s = await db.first<Sugestao>("SELECT * FROM sugestoes WHERE id = ? AND status = 'pendente'", [id]);
  if (!s) return;
  if (aprovar) await adicionar(db, s.pergunta, respostaEditada?.trim() || s.resposta, true);
  await db.run("UPDATE sugestoes SET status = ? WHERE id = ?", [aprovar ? "aprovada" : "rejeitada", id]);
}
