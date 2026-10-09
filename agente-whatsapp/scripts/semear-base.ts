/**
 * Gera o SQL que carrega conhecimento/*.md na base aprovada.
 * É seguro rodar a cada implantação: não apaga nada. Perguntas dos arquivos são criadas ou têm a
 * resposta atualizada (os arquivos são a fonte da verdade delas); itens criados pelo painel ou
 * pelas sugestões aprovadas, com outras perguntas, ficam intactos. Itens A_PREENCHER são ignorados.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lerArquivoBase } from "../src/conhecimento";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function gerarSqlSemente(dir = join(import.meta.dirname, "..", "conhecimento")): string {
  const sql: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md") && !["persona.md", "triagem.md"].includes(n)).sort()) {
    for (const { pergunta, resposta } of lerArquivoBase(readFileSync(join(dir, f), "utf8"))) {
      if (resposta.includes("A_PREENCHER")) continue;
      const P = q(pergunta);
      sql.push(
        `INSERT INTO base (pergunta, resposta, aprovado, criado_em) SELECT ${P}, ${q(resposta)}, 1, 0 WHERE NOT EXISTS (SELECT 1 FROM base WHERE pergunta = ${P});`,
        `UPDATE base SET resposta = ${q(resposta)}, aprovado = 1 WHERE pergunta = ${P};`,
        `DELETE FROM base_fts WHERE rowid IN (SELECT id FROM base WHERE pergunta = ${P});`,
        `INSERT INTO base_fts (rowid, pergunta, resposta) SELECT id, pergunta, resposta FROM base WHERE pergunta = ${P};`,
      );
    }
  }
  return sql.join("\n");
}

if (process.argv[1]?.endsWith("semear-base.ts")) console.log(gerarSqlSemente());
