import type { Db } from "./db";
import { chaveTelefone } from "./telefone";
import { triarPorRegras } from "./triagem";

const MAX_FATOS = 12;
const MAX_TEXTO = 200;
export const SENSIVEL = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|[\w.+-]+@[\w-]+\.[\w.]+/;

/** Fatos curtos e privados de uma família (série do filho, período preferido, último assunto). */
export async function salvarFato(db: Db, telefone: string, texto: string, agora = Date.now()): Promise<void> {
  const dura = triarPorRegras(texto);
  const delicado = dura?.acao === "acolher" && ["saude", "laudo", "risco_crianca"].includes(dura.categoria);
  if (SENSIVEL.test(texto) || delicado) throw new Error("dado sensível não pode ir para a memória");
  const chave = chaveTelefone(telefone);
  await db.run("INSERT INTO fatos (telefone, texto, criado_em, usado_em) VALUES (?, ?, ?, ?)", [chave, texto.trim().slice(0, MAX_TEXTO), agora, agora]);
  await db.run(
    `DELETE FROM fatos WHERE telefone = ? AND id NOT IN (
       SELECT id FROM fatos WHERE telefone = ? ORDER BY usado_em DESC, id DESC LIMIT ?)`,
    [chave, chave, MAX_FATOS],
  );
}

export async function lerFatos(db: Db, telefone: string, agora = Date.now()): Promise<string[]> {
  const chave = chaveTelefone(telefone);
  const linhas = await db.all<{ texto: string }>("SELECT texto FROM fatos WHERE telefone = ? ORDER BY usado_em DESC, id DESC", [chave]);
  if (linhas.length) await db.run("UPDATE fatos SET usado_em = ? WHERE telefone = ?", [agora, chave]);
  return linhas.map((l) => l.texto);
}

export async function esquecer(db: Db, telefone: string): Promise<void> {
  await db.run("DELETE FROM fatos WHERE telefone = ?", [chaveTelefone(telefone)]);
}
