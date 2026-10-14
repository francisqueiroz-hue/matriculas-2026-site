import { ErroDeUsuario } from "@/lib/erros";

/**
 * Tipos de pergunta das enquetes. Para criar um tipo novo basta acrescentar uma entrada em
 * TIPOS_PERGUNTA (e o rótulo/entrada na tela): o banco guarda "tipo" como texto, sem migração.
 */
export interface PerguntaEnquete {
  id: string;
  tipo: string;
  texto: string;
  obrigatoria: boolean;
  opcoes: unknown;
}

/** Valor já validado, pronto para gravar: número, texto ou ambos nulos (pergunta opcional sem resposta). */
export interface ValorResposta {
  numero: number | null;
  texto: string | null;
}

interface DefinicaoTipo {
  rotulo: string;
  /** Valida a configuração informada ao criar a pergunta; devolve a versão normalizada a gravar. */
  normalizarOpcoes(opcoes: unknown): unknown;
  /** Valida a resposta enviada pela família (valor bruto do cliente). */
  validarResposta(opcoes: unknown, bruto: unknown): ValorResposta;
}

export const TEXTO_LIVRE_MAX = 2000;
export const NOTA_MAX_PADRAO = 5;
export const ESCOLHAS_MIN = 2;
export const ESCOLHAS_MAX = 10;

const VAZIO: ValorResposta = { numero: null, texto: null };

function listaDeEscolhas(opcoes: unknown): string[] {
  const lista = (opcoes as { escolhas?: unknown } | null)?.escolhas;
  return Array.isArray(lista) ? lista.filter((e): e is string => typeof e === "string") : [];
}

export const TIPOS_PERGUNTA: Record<string, DefinicaoTipo> = {
  /** Nota de 1 a 5 (estrelas/carinhas). */
  NOTA: {
    rotulo: "Nota de 1 a 5",
    normalizarOpcoes: () => ({ max: NOTA_MAX_PADRAO }),
    validarResposta(_opcoes, bruto) {
      if (typeof bruto !== "number" || !Number.isInteger(bruto) || bruto < 1 || bruto > NOTA_MAX_PADRAO) {
        throw new ErroDeUsuario(`A nota deve ser um número de 1 a ${NOTA_MAX_PADRAO}.`);
      }
      return { numero: bruto, texto: null };
    },
  },
  /** Uma escolha entre as opções cadastradas. */
  ESCOLHA: {
    rotulo: "Múltipla escolha (uma resposta)",
    normalizarOpcoes(opcoes) {
      const escolhas = listaDeEscolhas(opcoes)
        .map((e) => e.trim())
        .filter(Boolean);
      if (escolhas.length < ESCOLHAS_MIN || escolhas.length > ESCOLHAS_MAX) {
        throw new ErroDeUsuario(`A pergunta de múltipla escolha precisa de ${ESCOLHAS_MIN} a ${ESCOLHAS_MAX} opções.`);
      }
      if (new Set(escolhas.map((e) => e.toLowerCase())).size !== escolhas.length) {
        throw new ErroDeUsuario("As opções da pergunta de múltipla escolha não podem se repetir.");
      }
      if (escolhas.some((e) => e.length > 200)) {
        throw new ErroDeUsuario("Cada opção pode ter no máximo 200 caracteres.");
      }
      return { escolhas };
    },
    validarResposta(opcoes, bruto) {
      const escolhas = listaDeEscolhas(opcoes);
      if (typeof bruto !== "string" || !escolhas.includes(bruto)) {
        throw new ErroDeUsuario("Escolha uma das opções oferecidas.");
      }
      return { numero: null, texto: bruto };
    },
  },
  SIM_NAO: {
    rotulo: "Sim ou não",
    normalizarOpcoes: () => null,
    validarResposta(_opcoes, bruto) {
      if (bruto !== "Sim" && bruto !== "Não") throw new ErroDeUsuario("Responda Sim ou Não.");
      return { numero: null, texto: bruto };
    },
  },
  TEXTO: {
    rotulo: "Texto livre",
    normalizarOpcoes: () => null,
    validarResposta(_opcoes, bruto) {
      if (typeof bruto !== "string") throw new ErroDeUsuario("Escreva a resposta.");
      const texto = bruto.trim();
      if (texto.length > TEXTO_LIVRE_MAX) {
        throw new ErroDeUsuario(`O texto pode ter no máximo ${TEXTO_LIVRE_MAX} caracteres.`);
      }
      return texto ? { numero: null, texto } : VAZIO;
    },
  },
};

export function tipoConhecido(tipo: string): boolean {
  return Object.prototype.hasOwnProperty.call(TIPOS_PERGUNTA, tipo);
}

/** Valida/normaliza a configuração de uma pergunta nova. */
export function normalizarOpcoesPergunta(tipo: string, opcoes: unknown): unknown {
  if (!tipoConhecido(tipo)) throw new ErroDeUsuario("Tipo de pergunta inválido.");
  return TIPOS_PERGUNTA[tipo].normalizarOpcoes(opcoes);
}

function vazio(bruto: unknown): boolean {
  return bruto === undefined || bruto === null || (typeof bruto === "string" && bruto.trim() === "");
}

/**
 * Confere as respostas da família contra as perguntas da enquete. Devolve um item por pergunta
 * respondida; pergunta opcional em branco é ignorada, obrigatória em branco é recusada, e respostas a
 * perguntas que não existem na enquete são recusadas.
 */
export function validarRespostas(
  perguntas: PerguntaEnquete[],
  respostas: Record<string, unknown>,
): { perguntaId: string; numero: number | null; texto: string | null }[] {
  const ids = new Set(perguntas.map((p) => p.id));
  for (const id of Object.keys(respostas)) {
    if (!ids.has(id)) throw new ErroDeUsuario("Há resposta para uma pergunta que não existe nesta enquete.");
  }
  const itens: { perguntaId: string; numero: number | null; texto: string | null }[] = [];
  for (const p of perguntas) {
    const bruto = respostas[p.id];
    if (vazio(bruto)) {
      if (p.obrigatoria) throw new ErroDeUsuario(`Responda a pergunta: ${p.texto}`);
      continue;
    }
    if (!tipoConhecido(p.tipo)) throw new ErroDeUsuario("Esta enquete tem uma pergunta que o aplicativo ainda não reconhece.", 500);
    const valor = TIPOS_PERGUNTA[p.tipo].validarResposta(p.opcoes, bruto);
    if (valor.numero === null && valor.texto === null) {
      if (p.obrigatoria) throw new ErroDeUsuario(`Responda a pergunta: ${p.texto}`);
      continue;
    }
    itens.push({ perguntaId: p.id, ...valor });
  }
  return itens;
}

/** Em enquete anônima, o painel só mostra detalhes a partir deste número de respostas (evita identificar alguém em grupos pequenos). */
export const MINIMO_RESPOSTAS_ANONIMAS = 3;

export function detalhesLiberados(anonima: boolean, totalRespostas: number): boolean {
  return !anonima || totalRespostas >= MINIMO_RESPOSTAS_ANONIMAS;
}

export interface ResultadoPergunta {
  perguntaId: string;
  texto: string;
  tipo: string;
  respondentes: number;
  /** NOTA: média e contagem por nota. */
  media?: number;
  /** NOTA/ESCOLHA/SIM_NAO: contagem por valor, na ordem de apresentação. */
  distribuicao?: { valor: string; total: number }[];
  /** TEXTO: respostas livres em ordem embaralhada (sem horário) para não expor quem escreveu primeiro. */
  textos?: string[];
}

interface ItemBruto {
  perguntaId: string;
  numero: number | null;
  texto: string | null;
}

/** Ordem estável e sem relação com o horário (hash simples do texto), para listar comentários anônimos. */
function ordemEmbaralhada(textos: string[]): string[] {
  const chave = (t: string) => {
    let h = 7;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    return h;
  };
  return [...textos].sort((a, b) => chave(a) - chave(b) || a.localeCompare(b));
}

export function agregarResultados(perguntas: PerguntaEnquete[], itens: ItemBruto[]): ResultadoPergunta[] {
  return perguntas.map((p) => {
    const dela = itens.filter((i) => i.perguntaId === p.id);
    const base = { perguntaId: p.id, texto: p.texto, tipo: p.tipo, respondentes: dela.length };
    if (p.tipo === "NOTA") {
      const notas = dela.map((i) => i.numero).filter((n): n is number => n !== null);
      const media = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100 : 0;
      const distribuicao = Array.from({ length: NOTA_MAX_PADRAO }, (_, k) => k + 1).map((n) => ({
        valor: String(n),
        total: notas.filter((x) => x === n).length,
      }));
      return { ...base, media, distribuicao };
    }
    if (p.tipo === "ESCOLHA") {
      const distribuicao = listaDeEscolhas(p.opcoes).map((e) => ({ valor: e, total: dela.filter((i) => i.texto === e).length }));
      return { ...base, distribuicao };
    }
    if (p.tipo === "SIM_NAO") {
      return {
        ...base,
        distribuicao: ["Sim", "Não"].map((v) => ({ valor: v, total: dela.filter((i) => i.texto === v).length })),
      };
    }
    return { ...base, textos: ordemEmbaralhada(dela.map((i) => i.texto).filter((t): t is string => !!t)) };
  });
}

/** Enquete aberta: não encerrada manualmente e dentro do prazo (quando houver). */
export function enqueteAberta(e: { encerradaEm: Date | null; prazo: Date | null }, agora = new Date()): boolean {
  if (e.encerradaEm) return false;
  if (e.prazo && e.prazo < agora) return false;
  return true;
}
