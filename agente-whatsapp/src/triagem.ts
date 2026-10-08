import type { Provedor } from "./provedor";

export type Categoria =
  | "cobranca" | "reclamacao" | "bullying" | "saude" | "laudo"
  | "cancelamento" | "desconto" | "juridico" | "risco_crianca" | "outros_delicados";
export type Prioridade = "normal" | "alta" | "urgente";
export type Decisao = { acao: "responder" } | { acao: "acolher"; categoria: Categoria; prioridade: Prioridade };

/** Texto sem acento e em minúsculas — as regras abaixo são escritas sobre esta forma. */
export function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Regras duras, avaliadas em ordem (a primeira que casa decide). Espelhadas em
 * conhecimento/triagem.md para leitura humana. Na dúvida, escalar: um falso positivo custa
 * um chamado; um falso negativo custa uma resposta errada a um assunto delicado.
 */
const REGRAS: { categoria: Categoria; prioridade: Prioridade; re: RegExp }[] = [
  { categoria: "risco_crianca", prioridade: "urgente", re: /\b(suicid|se matar|me matar|quer morrer|nao quer viver|automutil|se cortand|se cortar|se corta\b|abuso sexual|estupr|violencia domestica|maus.?tratos|maltrat|sumiu|desaparec|sequestr|droga|arma\b|apanha em casa|apanhando)/ },
  { categoria: "juridico", prioridade: "alta", re: /\b(advogad|justica|procon|ministerio publico|conselho tutelar|denunci|delegacia|policia|boletim de ocorrencia|judicial|indeniz|danos morais|lgpd|apagar meus dados|meus dados|processar|virar processo|abrir processo)/ },
  { categoria: "saude", prioridade: "alta", re: /\b(febre|doente|remedio|medicament|alergi|asma\b|vomit|machuc|acidente|hospital|convuls|ferimento|desmai|diabet|epilep|internad|covid|passou mal|sangr|fratur|quebrou)/ },
  { categoria: "bullying", prioridade: "alta", re: /\b(bullying|agred|agrid|bateu|bateram|apelid|humilh|violenc|ameac|persegu|assedi|abus|empurr|excluid|zoad|zoou)/ },
  { categoria: "laudo", prioridade: "normal", re: /\b(laudo|autis|tdah|dislexi|deficienc|necessidades especiais|neurodiverg|atendimento especializado|psicolog|psicopedag|terapia|diagnostic|transtorno)/ },
  { categoria: "cobranca", prioridade: "normal", re: /\b(atrasad|inadimpl|vencid|cobranc|divida|debito|negativad|serasa|spc\b|protesto|boleto|segunda via|nao consegui pagar|nao consigo pagar|calote)/ },
  { categoria: "cancelamento", prioridade: "normal", re: /\b(cancel|trancar|transferir|transferenci|tirar (meu|minha|o|a) (filh|aluno|crianca)|desistir|desistenc|desmatricul|rescis|distrato)/ },
  { categoria: "desconto", prioridade: "normal", re: /\b(desconto|abatiment|negoci|bolsa|isenc|parcel|pagar menos|baixar o valor|abaixar o valor|mais barato)/ },
  { categoria: "reclamacao", prioridade: "normal", re: /\b(reclam|insatisf|absurd|descaso|pessim|inaceitav|queixa|falta de respeito|desrespeit|reembols|revolt|vergonha|indignad)/ },
  { categoria: "outros_delicados", prioridade: "normal", re: /\b((ignor|desconsider|descart|esquec)\w*\b[^.?!\n]{0,40}\b(regras|instrucoes|instrucao|orientacoes|diretrizes|restricoes|prompt)|system prompt|a partir de agora voce|voce agora e|finja que|fingir que|me (passe|de|diga) (o )?(cpf|senha|telefone)|dados de outr|senha d[oa]s? (wifi|wi-fi|diretoria|coordenacao|secretaria|sistema|professor\w*)|revele (suas|as) regras)/ },
];

const CATEGORIAS = new Set<string>(REGRAS.map((r) => r.categoria));
const LIMIAR_CONFIANCA = 0.7;

const SISTEMA_CLASSIFICADOR = `Você classifica mensagens de famílias para a secretaria de uma escola (Espaço Kids e Instituto Fokus).
Devolva JSON: {"categoria": string|null, "risco": "baixo"|"medio"|"alto", "confianca": número de 0 a 1}.
categoria: uma de ${[...CATEGORIAS].join(", ")} quando a mensagem tocar nesses assuntos delicados; null para dúvidas comuns (horários, endereço, documentos, séries, visitas, calendário, valores de matrícula).
risco "baixo" só para dúvidas comuns e cordialidades. Na dúvida, use risco "medio".`;

function lerClassificacao(texto: string): { categoria: string | null; risco: string; confianca: number } | null {
  const trecho = texto.match(/\{[\s\S]*\}/)?.[0];
  if (!trecho) return null;
  try {
    const j = JSON.parse(trecho);
    if (typeof j.confianca !== "number" || typeof j.risco !== "string") return null;
    return { categoria: typeof j.categoria === "string" ? j.categoria : null, risco: j.risco, confianca: j.confianca };
  } catch {
    return null;
  }
}

/** Só as regras duras (sem IA, sem custo). `null` = nenhuma regra casou. */
export function triarPorRegras(texto: string): Decisao | null {
  const limpo = normalizar(texto).trim();
  if (!limpo) return { acao: "acolher", categoria: "outros_delicados", prioridade: "normal" };
  const regra = REGRAS.find((r) => r.re.test(limpo));
  return regra ? { acao: "acolher", categoria: regra.categoria, prioridade: regra.prioridade } : null;
}

/** Decide, antes de qualquer resposta, se a Lia pode responder ou deve só acolher e escalar. */
export async function triar(texto: string, provedor: Provedor): Promise<Decisao> {
  const dura = triarPorRegras(texto);
  if (dura) return dura;

  try {
    const r = await provedor.gerar({ sistema: SISTEMA_CLASSIFICADOR, mensagens: [{ papel: "user", conteudo: texto }], json: true });
    const c = lerClassificacao(r.texto);
    if (!c) return { acao: "acolher", categoria: "outros_delicados", prioridade: "normal" };
    const categoria = c.categoria && CATEGORIAS.has(c.categoria) ? (c.categoria as Categoria) : null;
    if (categoria) {
      const prioridade = REGRAS.find((x) => x.categoria === categoria)!.prioridade;
      return { acao: "acolher", categoria, prioridade };
    }
    if (c.confianca < LIMIAR_CONFIANCA || c.risco !== "baixo") return { acao: "acolher", categoria: "outros_delicados", prioridade: "normal" };
    return { acao: "responder" };
  } catch {
    return { acao: "acolher", categoria: "outros_delicados", prioridade: "normal" };
  }
}

const BASE = "Olá! Aqui é a Lia, assistente virtual do Espaço Kids e do Instituto Fokus. ";
const ACOLHIMENTOS: Record<Categoria, string> = {
  cobranca: BASE + "Recebi sua mensagem sobre pagamentos. Esse assunto é tratado diretamente pela nossa equipe, que vai retornar com atenção o mais breve possível.",
  reclamacao: BASE + "Sinto muito pelo ocorrido e agradeço por nos contar. Já avisei a coordenação, que vai retornar pessoalmente o mais breve possível.",
  bullying: BASE + "Obrigada por avisar, isso é muito importante para nós. Já encaminhei com prioridade à coordenação, que vai entrar em contato.",
  saude: BASE + "Recebi sua mensagem sobre a saúde do aluno e já encaminhei com prioridade à nossa equipe, que vai responder em seguida.",
  laudo: BASE + "Obrigada por compartilhar. Esse assunto é conduzido com cuidado pela nossa coordenação pedagógica, que vai retornar para conversar com você.",
  cancelamento: BASE + "Recebi sua mensagem. Vou passar à nossa secretaria, que retornará para conversar com você o mais breve possível.",
  desconto: BASE + "Recebi seu pedido. Condições especiais são tratadas pela nossa direção, que vai retornar para conversar com você.",
  juridico: BASE + "Recebi sua mensagem e já encaminhei à direção da escola, que vai retornar pessoalmente.",
  risco_crianca: BASE + "Sua mensagem é muito importante e já foi encaminhada com urgência à nossa equipe, que vai entrar em contato agora. Se houver risco imediato para alguém, ligue 190 (polícia) ou 192 (SAMU).",
  outros_delicados: BASE + "Recebi sua mensagem. Vou encaminhá-la à nossa equipe, que retorna o mais breve possível.",
};

export function acolhimento(categoria: Categoria): string {
  return ACOLHIMENTOS[categoria];
}
