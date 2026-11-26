/**
 * Aviso único às famílias "estamos definindo as turmas" (regras puras, sem banco — testáveis).
 *
 * Pedido da direção (26/11/2026): depois que os lembretes de matrícula chegam ao limite de envios,
 * a família recebe UMA mensagem informando que a escola precisa definir as turmas e organizar o
 * próximo ano. O texto é editável pela direção; em caso excepcional, a direção também envia à mão.
 *
 * Regras do envio automático:
 *  - a base são os contratos não assinados (aguardando assinatura ou devolvidos para correção):
 *    a tela lista todos; o automático sai quando um deles fica em LIMITE_ATINGIDO e continua pendente;
 *  - sai uma única vez por família (responsável), nunca repete;
 *  - respeita o intervalo da família: o aviso ocupa a vez do lembrete que sairia a seguir, e não
 *    sai no mesmo dia de outro lembrete;
 *  - só com os lembretes ligados, com o aviso ligado e fora do domingo (como os lembretes).
 */
import type { LembreteTipo } from "@prisma/client";
import { diasCorridos, primeiroNome, type ConfigLembretes, type PendenciaAvaliada } from "@/lib/lembretes";

/**
 * Base do aviso (decisão da direção, 26/11/2026): contratos não assinados. Rematrícula sem contrato,
 * mensalidade e autorização ficam de fora.
 */
export const TIPOS_AVISO_TURMAS: readonly LembreteTipo[] = ["CONTRATO"];

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
/** Envio manual (texto já com os nomes, inclusive o reenvio da mensagem recebida). */
export const LIMITE_TITULO_ENVIO_MANUAL = 160;
export const LIMITE_TEXTO_ENVIO_MANUAL = 600;

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
  | "EM_LEMBRETES" // contrato não assinado, ainda recebendo lembretes (o aviso vem depois do limite)
  | "PRONTO" // sai no próximo envio automático
  | "AGUARDANDO_INTERVALO" // família recebeu lembrete há pouco; sai quando completar o intervalo
  | "ENVIADO"; // já recebeu (não repete)

export interface FamiliaAvisoTurmas extends AvisoTurmasPlanejado {
  situacao: SituacaoAvisoTurmas;
  /** Lembretes já enviados (o maior entre os contratos da família). */
  envios: number;
  /** Data prevista (AGUARDANDO_INTERVALO). */
  proximoEm: Date | null;
}

const DIA_MS = 86_400_000;

/**
 * Famílias com contrato não assinado e a situação do aviso de cada uma (o automático só sai para
 * PRONTO, isto é, depois do limite de lembretes).
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
    if (!tipos.has(a.tipo)) continue;
    const lista = porFamilia.get(a.responsavelId) ?? [];
    lista.push(a);
    porFamilia.set(a.responsavelId, lista);
  }

  const familias: FamiliaAvisoTurmas[] = [];
  for (const [responsavelId, lista] of porFamilia) {
    const noLimite = lista.filter((p) => p.situacao === "LIMITE_ATINGIDO");
    // Aviso automático cita os alunos cujo contrato chegou ao limite; antes disso, todos.
    const alunos = [...new Set((noLimite.length ? noLimite : lista).map((p) => p.aluno))];
    const url = lista.every((p) => p.tipo === "CONTRATO") ? "/dashboard/contratos" : "/dashboard";
    const envios = Math.max(...lista.map((p) => p.envios));
    const base = { responsavelId, alunos, url, envios };
    if (jaAvisados.has(responsavelId)) {
      familias.push({ ...base, situacao: "ENVIADO", proximoEm: null });
      continue;
    }
    if (noLimite.length === 0) {
      familias.push({ ...base, situacao: "EM_LEMBRETES", proximoEm: null });
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
