import type { Db } from "./db";
import { normalizar } from "./triagem";

export interface ItemBase {
  id: number;
  pergunta: string;
  resposta: string;
}

const PALAVRAS_COMUNS = new Set([
  "de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "no", "na", "um", "uma", "que", "qual", "quais", "como",
  "quando", "onde", "para", "por", "com", "voce", "voces", "tem", "ter", "tenho", "vai", "vao", "ser", "sao", "meu", "minha",
  "se", "eu", "me", "ao", "ou", "mais", "ja", "nao", "sim", "pode", "posso", "gostaria", "queria", "quero", "bom", "boa", "dia", "tarde", "noite",
]);

/** Termos de busca seguros para FTS5: sem operadores, com prefixo e plural simplificado. */
function termos(consulta: string): string[] {
  const palavras = normalizar(consulta).match(/[a-z0-9]{2,}/g) ?? [];
  const unicos = new Set<string>();
  for (const p of palavras) {
    if (PALAVRAS_COMUNS.has(p)) continue;
    unicos.add(p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p);
  }
  return [...unicos];
}

export async function adicionar(db: Db, pergunta: string, resposta: string, aprovado: boolean): Promise<number> {
  const r = await db.run("INSERT INTO base (pergunta, resposta, aprovado, criado_em) VALUES (?, ?, ?, ?)", [pergunta, resposta, aprovado ? 1 : 0, Date.now()]);
  await db.run("INSERT INTO base_fts (rowid, pergunta, resposta) VALUES (?, ?, ?)", [r.lastId, pergunta, resposta]);
  return r.lastId;
}

export async function aprovar(db: Db, id: number): Promise<void> {
  await db.run("UPDATE base SET aprovado = 1 WHERE id = ?", [id]);
}

/** Só itens aprovados, mais relevantes primeiro. */
export async function buscar(db: Db, consulta: string, limite = 4): Promise<ItemBase[]> {
  const t = termos(consulta);
  if (!t.length) return [];
  const match = t.map((x) => `"${x}"*`).join(" OR ");
  return db.all<ItemBase>(
    `SELECT b.id AS id, b.pergunta AS pergunta, b.resposta AS resposta
       FROM base_fts JOIN base b ON b.id = base_fts.rowid
      WHERE base_fts MATCH ? AND b.aprovado = 1
      ORDER BY bm25(base_fts) LIMIT ?`,
    [match, limite],
  );
}

/** Formato dos arquivos em conhecimento/: "## Pergunta" seguido da resposta. */
export function lerArquivoBase(texto: string): { pergunta: string; resposta: string }[] {
  const itens: { pergunta: string; resposta: string }[] = [];
  for (const bloco of texto.split(/^## /m).slice(1)) {
    const [primeira, ...resto] = bloco.split("\n");
    const resposta = resto.join("\n").trim();
    if (primeira.trim() && resposta) itens.push({ pergunta: primeira.trim(), resposta });
  }
  return itens;
}
