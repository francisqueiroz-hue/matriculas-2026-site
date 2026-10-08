import { anonimizar } from "./anonimizar";
import { termos } from "./conhecimento";
import type { Db } from "./db";
import type { Provedor } from "./provedor";

const MIN_OCORRENCIAS = 3;
const SIMILARIDADE = 0.6;

const SISTEMA = `Você ajuda a secretaria de uma escola a montar respostas-modelo para perguntas frequentes das famílias.
Recebe várias formulações parecidas da mesma dúvida. Devolva JSON: {"pergunta": "forma clara e geral da dúvida", "resposta": "rascunho curto em português do Brasil"}.
Regras: não invente valores, datas, horários ou regras; onde faltar um dado da escola escreva [CONFIRMAR]; nada de dados pessoais.`;

/** Coeficiente de sobreposição: perguntas curtas ("tem natação?") ainda casam com as longas que a contêm. */
function similaridade(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const menor = Math.min(a.size, b.size);
  return menor ? inter / menor : 0;
}

/**
 * Agrupa (sem IA) as perguntas não resolvidas parecidas e, para cada grupo com 3+ ocorrências,
 * pede ao provedor um rascunho de item da base. Vira apenas `sugestoes` pendentes: nada é
 * publicado sem aprovação humana, e nenhum dado pessoal sai da conversa.
 */
export async function gerarSugestoes(db: Db, provedor: Provedor, desde: Date): Promise<number> {
  const linhas = await db.all<{ texto_anon: string }>("SELECT texto_anon FROM perguntas WHERE resolvida = 0 AND criado_em >= ? ORDER BY id", [desde.getTime()]);
  const grupos: { chave: Set<string>; textos: string[] }[] = [];
  for (const l of linhas) {
    const chave = new Set(termos(l.texto_anon));
    if (!chave.size) continue;
    const g = grupos.find((x) => similaridade(x.chave, chave) >= SIMILARIDADE);
    if (g) g.textos.push(l.texto_anon);
    else grupos.push({ chave, textos: [l.texto_anon] });
  }

  let criadas = 0;
  for (const g of grupos.filter((x) => x.textos.length >= MIN_OCORRENCIAS)) {
    try {
      const r = await provedor.gerar({ sistema: SISTEMA, json: true, mensagens: [{ papel: "user", conteudo: g.textos.slice(0, 8).map((t) => `- ${anonimizar(t)}`).join("\n") }] });
      const j = JSON.parse(r.texto.match(/\{[\s\S]*\}/)?.[0] ?? "");
      if (typeof j.pergunta !== "string" || typeof j.resposta !== "string") continue;
      const existente = await db.first<{ id: number }>("SELECT id FROM sugestoes WHERE pergunta = ? AND status = 'pendente'", [j.pergunta]);
      if (existente) {
        await db.run("UPDATE sugestoes SET frequencia = ? WHERE id = ?", [g.textos.length, existente.id]);
        continue;
      }
      await db.run("INSERT INTO sugestoes (pergunta, resposta, frequencia, criado_em) VALUES (?, ?, ?, ?)", [j.pergunta, j.resposta, g.textos.length, Date.now()]);
      criadas++;
    } catch {
      continue;
    }
  }
  return criadas;
}
