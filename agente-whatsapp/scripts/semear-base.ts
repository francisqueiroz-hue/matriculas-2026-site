/** Gera SQL para semear a base aprovada a partir de conhecimento/*.md (itens A_PREENCHER são ignorados). */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lerArquivoBase } from "../src/conhecimento";

const dir = join(import.meta.dirname, "..", "conhecimento");
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const linhas: string[] = ["DELETE FROM base_fts;", "DELETE FROM base;"];
let id = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith(".md") && !["persona.md", "triagem.md"].includes(n))) {
  for (const { pergunta, resposta } of lerArquivoBase(readFileSync(join(dir, f), "utf8"))) {
    if (resposta.includes("A_PREENCHER")) continue;
    id++;
    linhas.push(`INSERT INTO base (id, pergunta, resposta, aprovado, criado_em) VALUES (${id}, ${q(pergunta)}, ${q(resposta)}, 1, 0);`);
    linhas.push(`INSERT INTO base_fts (rowid, pergunta, resposta) VALUES (${id}, ${q(pergunta)}, ${q(resposta)});`);
  }
}
console.log(linhas.join("\n"));
