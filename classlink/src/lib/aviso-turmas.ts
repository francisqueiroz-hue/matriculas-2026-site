/**
 * Aviso único às famílias "estamos definindo as turmas" (regras puras, sem banco — testáveis).
 *
 * Pedido da direção (26/11/2026): depois que os lembretes de matrícula chegam ao limite de envios,
 * a família recebe UMA mensagem informando que a escola precisa definir as turmas e organizar o
 * próximo ano. O texto é editável pela direção; em caso excepcional, a direção também envia à mão.
 *
 * Regras do envio automático:
 *  - vale para as pendências de matrícula (contrato para assinar/reenviar e rematrícula não
 *    confirmada), quando uma delas fica em LIMITE_ATINGIDO e continua pendente;
 *  - sai uma única vez por família (responsável), nunca repete;
 *  - respeita o intervalo da família: o aviso ocupa a vez do lembrete que sairia a seguir, e não
 *    sai no mesmo dia de outro lembrete;
 *  - só com os lembretes ligados, com o aviso ligado e fora do domingo (como os lembretes).
 */
import type { LembreteTipo } from "@prisma/client";
import { diasCorridos, primeiroNome, type ConfigLembretes, type PendenciaAvaliada } from "@/lib/lembretes";

/** Pendências de matrícula que levam ao aviso. Mensalidade e autorização ficam de fora. */
export const TIPOS_AVISO_TURMAS: readonly LembreteTipo[] = ["CONTRATO", "REMATRICULA"];

/**
 * Texto padrão (proposta para revisão da direção). Marcadores: {alunos} = primeiro nome dos
 * alunos ("Ana e Pedro"), {ano} = ano letivo. Tom acolhedor e sem prometer data de turma.
 */
export const TITULO_PADRAO_AVISO_TURMAS = "Organização das turmas de {ano}";
export const TEXTO_PADRAO_AVISO_TURMAS =
  "Olá! A escola está definindo as turmas e organizando o ano letivo de {ano}. " +
  "Para incluirmos {alunos} nesse planejamento, precisamos que a matrícula seja concluída no ClassLink. " +
  "Se houver qualquer dificuldade, fale com a secretaria: estamos aqui para ajudar.";

/** O modelo de WhatsApp mostra até 300 caracteres; com os nomes, o texto precisa caber nisso. */
export const LIMITE_TITULO_AVISO_TURMAS = 80;
export const LIMITE_TEXTO_AVISO_TURMAS = 280;

export interface ModeloAvisoTurmas {
  titulo: string;
  texto: string;
}

/** Texto salvo pela direção ou, sem ele (null/vazio), o padrão. */
export function modeloAvisoTurmas(salvo: { titulo: string | null; texto: string | null }): ModeloAvisoTurmas {
  return {
    titulo: salvo.titulo?.trim() || TITULO_PADRAO_AVISO_TURMAS,
    texto: salvo.texto?.trim() || TEXTO_PADRAO_AVISO_TURMAS,
  };
}

/** "Ana", "Ana e Pedro", "Ana, Pedro e Luiza". Sem nomes: "seu(sua) filho(a)". */
export function listaAlunos(nomes: string[]): string {
  const unicos = [...new Set(nomes.map(primeiroNome).filter(Boolean))];
  if (unicos.length === 0) return "seu(sua) filho(a)";
  if (unicos.length === 1) return unicos[0];
  return `${unicos.slice(0, -1).join(", ")} e ${unicos[unicos.length - 1]}`;
}

/** Troca os marcadores {alunos} e {ano}; sem diferença de maiúsculas. */
export function preencherModelo(modelo: string, dados: { alunos: string[]; ano: number }): string {
  return modelo
    .replace(/\{alunos\}/gi, listaAlunos(dados.alunos))
    .replace(/\{ano\}/gi, String(dados.ano))
    .replace(/\s+/g, " ")
    .trim();
}

export function mensagemAvisoTurmas(
  modelo: ModeloAvisoTurmas,
  dados: { alunos: string[]; ano: number; url: string },
): { titulo: string; texto: string; url: string } {
  return { titulo: preencherModelo(modelo.titulo, dados), texto: preencherModelo(modelo.texto, dados), url: dados.url };
}

export interface AvisoTurmasPlanejado {
  responsavelId: string;
  /** Nome completo dos alunos com a matrícula pendente no limite. */
  alunos: string[];
  /** Onde a família resolve: contratos, se for só contrato; senão o painel. */
  url: string;
}

export type SituacaoAvisoTurmas =
  | "PRONTO" // sai no próximo envio automático
  | "AGUARDANDO_INTERVALO" // família recebeu lembrete há pouco; sai quando completar o intervalo
  | "ENVIADO"; // já recebeu (não repete)

export interface FamiliaAvisoTurmas extends AvisoTurmasPlanejado {
  situacao: SituacaoAvisoTurmas;
  /** Data prevista (AGUARDANDO_INTERVALO). */
  proximoEm: Date | null;
}

const DIA_MS = 86_400_000;

/**
 * Famílias com pendência de matrícula no limite de lembretes e a situação do aviso de cada uma.
 * `jaAvisados`: responsáveis que já receberam o aviso (automático ou manual, entrega não falhou).
 * `lembradosAgora`: responsáveis que recebem lembrete nesta execução (o aviso fica para depois).
 */
export function avaliarAvisoTurmas(
  avaliadas: PendenciaAvaliada[],
  ultimoDaFamilia: Map<string, Date | null>,
  jaAvisados: Set<string>,
  lembradosAgora: Set<string>,
  config: Pick<ConfigLembretes, "intervaloDias">,
  agora: Date,
): FamiliaAvisoTurmas[] {
  const tipos = new Set(TIPOS_AVISO_TURMAS);
  const porFamilia = new Map<string, PendenciaAvaliada[]>();
  for (const a of avaliadas) {
    if (!tipos.has(a.tipo) || a.situacao !== "LIMITE_ATINGIDO") continue;
    const lista = porFamilia.get(a.responsavelId) ?? [];
    lista.push(a);
    porFamilia.set(a.responsavelId, lista);
  }

  const familias: FamiliaAvisoTurmas[] = [];
  for (const [responsavelId, lista] of porFamilia) {
    const alunos = [...new Set(lista.map((p) => p.aluno))];
    const url = lista.every((p) => p.tipo === "CONTRATO") ? "/dashboard/contratos" : "/dashboard";
    const base = { responsavelId, alunos, url };
    if (jaAvisados.has(responsavelId)) {
      familias.push({ ...base, situacao: "ENVIADO", proximoEm: null });
      continue;
    }
    // O último lembrete da família, inclusive o que sai agora, conta para o intervalo.
    const ultimo = lembradosAgora.has(responsavelId) ? agora : (ultimoDaFamilia.get(responsavelId) ?? null);
    const desde = ultimo ? diasCorridos(ultimo, agora) : Infinity;
    if (desde < config.intervaloDias) {
      familias.push({ ...base, situacao: "AGUARDANDO_INTERVALO", proximoEm: new Date(agora.getTime() + (config.intervaloDias - desde) * DIA_MS) });
    } else {
      familias.push({ ...base, situacao: "PRONTO", proximoEm: agora });
    }
  }
  return familias;
}
