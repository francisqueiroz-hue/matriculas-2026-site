/**
 * Lembretes automáticos de pendências às famílias (regras puras, sem banco — testáveis).
 *
 * Regras (configuráveis pela direção em Gestão › Lembretes):
 *  - 1º lembrete quando a pendência completa `diasInicio` dias corridos (padrão 3);
 *  - cada família recebe no máximo UMA mensagem a cada `intervaloDias` (padrão 3), com todas
 *    as pendências dela juntas — nunca uma mensagem por pendência;
 *  - cada pendência gera no máximo `maxEnvios` lembretes (padrão 4) e depois para;
 *  - a pendência resolvida (assinou, respondeu, pagou, confirmou) sai da lista na hora e os
 *    lembretes param sozinhos;
 *  - mensalidade segue o vencimento: 1 lembrete na véspera (com a data), e, se não for paga,
 *    no dia seguinte ao vencimento e depois a cada `intervaloDias` (ver `situacaoBoleto`);
 *  - nada sai aos domingos, e nada sai enquanto a escola não ativar o envio.
 * Os dias são contados no calendário de Brasília, não em horas: o agendador da Vercel pode
 * atrasar alguns minutos e um intervalo de 72h viraria 4 dias.
 */
import type { LembreteTipo } from "@prisma/client";

export type { LembreteTipo };

export const TIPOS_LEMBRETE: LembreteTipo[] = ["CONTRATO", "COMUNICADO", "BOLETO", "REMATRICULA"];

export const ROTULO_TIPO_LEMBRETE: Record<LembreteTipo, string> = {
  CONTRATO: "Contrato de matrícula para assinar",
  COMUNICADO: "Autorização ou confirmação sem resposta",
  BOLETO: "Mensalidade em aberto",
  REMATRICULA: "Rematrícula não confirmada",
};

export interface ConfigLembretes {
  ativos: boolean;
  tipos: LembreteTipo[];
  diasInicio: number;
  intervaloDias: number;
  maxEnvios: number;
}

export const CONFIG_PADRAO: ConfigLembretes = {
  ativos: false,
  tipos: [...TIPOS_LEMBRETE],
  diasInicio: 3,
  intervaloDias: 3,
  maxEnvios: 4,
};

/** Limites aceitos na tela de configuração (evitam intervalo diário ou lembretes sem fim). */
export const LIMITES = {
  diasInicio: { min: 1, max: 30 },
  intervaloDias: { min: 2, max: 30 },
  maxEnvios: { min: 1, max: 10 },
} as const;

const FUSO = "America/Sao_Paulo";
const DIA_MS = 86_400_000;

/** "2026-11-04" no calendário de Brasília. */
export function diaNoFuso(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
}

/** Dias de calendário (Brasília) entre duas datas: segunda → quinta = 3. */
export function diasCorridos(de: Date, ate: Date): number {
  const [a, b] = [diaNoFuso(de), diaNoFuso(ate)].map((d) => Date.parse(`${d}T00:00:00Z`));
  return Math.round((b - a) / DIA_MS);
}

/** Domingo em Brasília: sem lembretes (descanso da família). */
export function ehDomingo(data: Date): boolean {
  return new Intl.DateTimeFormat("en-US", { timeZone: FUSO, weekday: "short" }).format(data) === "Sun";
}

/** Uma pendência de uma família, recalculada da fonte a cada execução. */
export interface Pendencia {
  tipo: LembreteTipo;
  referenciaId: string;
  responsavelId: string;
  /** Desde quando está pendente; null = desde a primeira vez que o sistema viu (rematrícula). */
  desde: Date | null;
  /** Nome do aluno, para o resumo da direção. */
  aluno: string;
  /** Frase curta para a família, ex.: "assinar o contrato de matrícula 2027 de Ana". */
  descricao: string;
  /** Tela do ClassLink onde a família resolve. */
  url: string;
  /** Mensalidade: data de vencimento. Muda a regra (véspera, dia seguinte e a cada N dias). */
  vencimento?: Date;
}

/** O que já foi registrado para esta pendência (tabela LembretePendencia). */
export interface RegistroLembrete {
  tipo: LembreteTipo;
  referenciaId: string;
  responsavelId: string;
  pendenteDesde: Date;
  envios: number;
  ultimoEnvioEm: Date | null;
  resolvidoEm: Date | null;
}

export function chaveLembrete(p: { tipo: LembreteTipo; referenciaId: string; responsavelId: string }): string {
  return `${p.tipo}|${p.referenciaId}|${p.responsavelId}`;
}

export type SituacaoPendencia =
  | "AGUARDANDO_PRAZO" // ainda não completou os dias para o 1º lembrete
  | "PRONTA" // entra na próxima mensagem da família
  | "AGUARDANDO_INTERVALO" // a família recebeu lembrete há pouco tempo
  | "LIMITE_ATINGIDO"; // já recebeu o máximo de lembretes; fica só no resumo da direção

export interface PendenciaAvaliada extends Pendencia {
  pendenteDesde: Date;
  diasPendente: number;
  envios: number;
  ultimoEnvioEm: Date | null;
  situacao: SituacaoPendencia;
  /** Data prevista do próximo lembrete (null se atingiu o limite). */
  proximoEm: Date | null;
}

export interface EnvioPlanejado {
  responsavelId: string;
  pendencias: PendenciaAvaliada[];
}

export interface PlanoLembretes {
  avaliadas: PendenciaAvaliada[];
  envios: EnvioPlanejado[];
  /** Registros que deixaram de estar pendentes: marcar como resolvidos. */
  resolvidos: RegistroLembrete[];
}

function maisRecente(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * DIA_MS);
}

/**
 * Data de início da pendência: a da fonte; se a linha existente já tinha sido resolvida e a
 * pendência voltou (ex.: contrato devolvido para correção), conta de novo a partir da volta.
 */
export function inicioDaPendencia(p: Pendencia, registro: RegistroLembrete | undefined, agora: Date): Date {
  if (registro && !registro.resolvidoEm) return p.desde ?? registro.pendenteDesde;
  const base = p.desde ?? agora;
  return registro?.resolvidoEm && registro.resolvidoEm.getTime() > base.getTime() ? registro.resolvidoEm : base;
}

/**
 * Mensalidade (decisão da direção, 04/11/2026): lembrete na véspera do vencimento, informando a
 * data; se não for paga, no dia seguinte ao vencimento e depois a cada `intervaloDias`. Domingo
 * não tem envio: a véspera que cairia no domingo sai no sábado, e o aviso de atraso sai na segunda.
 * O limite de lembretes conta a véspera. Não depende do intervalo da família: tem data certa.
 */
export function situacaoBoleto(
  vencimento: Date,
  envios: number,
  ultimoEnvioEm: Date | null,
  config: ConfigLembretes,
  agora: Date,
): { situacao: SituacaoPendencia; proximoEm: Date | null } {
  if (envios >= config.maxEnvios) return { situacao: "LIMITE_ATINGIDO", proximoEm: null };
  const diasAte = diasCorridos(agora, vencimento);
  // Último envio feito antes do dia do vencimento = o lembrete da véspera.
  const enviouAntes = ultimoEnvioEm !== null && diasCorridos(ultimoEnvioEm, vencimento) > 0;

  if (diasAte >= 1) {
    if (enviouAntes) return { situacao: "AGUARDANDO_PRAZO", proximoEm: somarDias(vencimento, 1) };
    const vesperaNoDomingo = ehDomingo(somarDias(vencimento, -1));
    const hojeEhDia = diasAte === 1 || (diasAte === 2 && vesperaNoDomingo);
    return hojeEhDia
      ? { situacao: "PRONTA", proximoEm: agora }
      : { situacao: "AGUARDANDO_PRAZO", proximoEm: somarDias(vencimento, vesperaNoDomingo ? -2 : -1) };
  }
  if (diasAte === 0) return { situacao: "AGUARDANDO_PRAZO", proximoEm: somarDias(vencimento, 1) };

  // Vencida: 1º aviso no dia seguinte; depois, a cada intervaloDias desde o último aviso de atraso.
  if (!ultimoEnvioEm || enviouAntes || diasCorridos(ultimoEnvioEm, vencimento) === 0) {
    return { situacao: "PRONTA", proximoEm: agora };
  }
  const desde = diasCorridos(ultimoEnvioEm, agora);
  return desde >= config.intervaloDias
    ? { situacao: "PRONTA", proximoEm: agora }
    : { situacao: "AGUARDANDO_INTERVALO", proximoEm: somarDias(agora, config.intervaloDias - desde) };
}

/**
 * Decide quem recebe lembrete agora. Pura: recebe as pendências atuais e os registros e
 * devolve o plano (quem recebe, o que vai em cada mensagem e o que foi resolvido).
 */
export function planejarLembretes(
  pendencias: Pendencia[],
  registros: RegistroLembrete[],
  config: ConfigLembretes,
  agora: Date,
): PlanoLembretes {
  const porChave = new Map(registros.map((r) => [chaveLembrete(r), r]));
  const tiposAtivos = new Set(config.tipos);

  // Último lembrete que cada família recebeu, de qualquer pendência (inclusive já resolvida).
  const ultimoDaFamilia = new Map<string, Date | null>();
  for (const r of registros) {
    ultimoDaFamilia.set(r.responsavelId, maisRecente(ultimoDaFamilia.get(r.responsavelId) ?? null, r.ultimoEnvioEm));
  }

  const vistas = new Set<string>();
  const avaliadas: PendenciaAvaliada[] = [];

  for (const p of pendencias) {
    if (!tiposAtivos.has(p.tipo)) continue;
    const chave = chaveLembrete(p);
    if (vistas.has(chave)) continue; // a mesma pendência nunca entra duas vezes
    vistas.add(chave);

    const registro = porChave.get(chave);
    const reaberta = Boolean(registro?.resolvidoEm);
    const envios = reaberta ? 0 : (registro?.envios ?? 0);
    const ultimoEnvioEm = reaberta ? null : (registro?.ultimoEnvioEm ?? null);
    const pendenteDesde = inicioDaPendencia(p, registro, agora);
    const diasPendente = Math.max(diasCorridos(pendenteDesde, agora), 0);
    const ultimoFamilia = ultimoDaFamilia.get(p.responsavelId) ?? null;

    let situacao: SituacaoPendencia;
    let proximoEm: Date | null;
    if (p.vencimento) {
      ({ situacao, proximoEm } = situacaoBoleto(p.vencimento, envios, ultimoEnvioEm, config, agora));
    } else if (envios >= config.maxEnvios) {
      situacao = "LIMITE_ATINGIDO";
      proximoEm = null;
    } else if (diasPendente < config.diasInicio) {
      situacao = "AGUARDANDO_PRAZO";
      proximoEm = somarDias(agora, config.diasInicio - diasPendente);
    } else if (ultimoFamilia && diasCorridos(ultimoFamilia, agora) < config.intervaloDias) {
      situacao = "AGUARDANDO_INTERVALO";
      proximoEm = somarDias(agora, config.intervaloDias - diasCorridos(ultimoFamilia, agora));
    } else {
      situacao = "PRONTA";
      proximoEm = agora;
    }

    avaliadas.push({ ...p, pendenteDesde, diasPendente, envios, ultimoEnvioEm, situacao, proximoEm });
  }

  const porFamilia = new Map<string, PendenciaAvaliada[]>();
  for (const a of avaliadas) {
    if (a.situacao !== "PRONTA") continue;
    const lista = porFamilia.get(a.responsavelId) ?? [];
    lista.push(a);
    porFamilia.set(a.responsavelId, lista);
  }
  const envios = [...porFamilia.entries()].map(([responsavelId, lista]) => ({ responsavelId, pendencias: lista }));

  // Só marca como resolvido o que é de um tipo avaliado agora; tipo desligado fica como está.
  const resolvidos = registros.filter((r) => !r.resolvidoEm && tiposAtivos.has(r.tipo) && !vistas.has(chaveLembrete(r)));

  return { avaliadas, envios, resolvidos };
}

/** Título e texto da mensagem única da família (push e WhatsApp). Sem valores em dinheiro. */
export function mensagemLembrete(pendencias: Pick<Pendencia, "descricao" | "url">[]): { titulo: string; texto: string; url: string } {
  if (pendencias.length === 1) {
    const [p] = pendencias;
    return {
      titulo: "Lembrete da escola",
      texto: `Ainda falta ${p.descricao}. Toque para ver no ClassLink. Se já resolveu, desconsidere.`,
      url: p.url,
    };
  }
  const itens = pendencias.map((p) => p.descricao);
  const lista = `${itens.slice(0, -1).join("; ")} e ${itens[itens.length - 1]}`;
  return {
    titulo: `Lembrete da escola: ${pendencias.length} pendências`,
    texto: `Ainda falta ${lista}. Toque para ver no ClassLink. Se já resolveu, desconsidere.`,
    url: "/dashboard",
  };
}

/** Primeiro nome do aluno (o nome completo fica no app; a notificação aparece na tela bloqueada). */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

/** Contrato do ano letivo, com o aluno e os responsáveis que podem tê-lo pedido. */
export interface ContratoDoAno {
  anoLetivo: number;
  alunoNome: string;
  responsavelIds: string[];
}

function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Uma rematrícula deixa de depender da escola assim que existe contrato do ano para a família:
 * a renovação já foi feita (enviada, assinada, validada ou confirmada pela direção). Se ainda falta
 * documento, o próprio contrato aparece como pendência (em conferência ou aguardando a via original).
 * Vale pelo responsável que pediu (logado) ou, só sem ele, pelo nome de um dos alunos da solicitação.
 */
export function rematriculaJaAtendida(
  sol: { tipo: string; anoLetivo: number; responsavelId: string | null; alunoNome: string },
  contratos: ContratoDoAno[],
): boolean {
  if (sol.tipo !== "REMATRICULA") return false;
  const doAno = contratos.filter((c) => c.anoLetivo === sol.anoLetivo);
  // Pedido de responsável logado: vale só o vínculo (aluno homônimo de outra família não conta).
  if (sol.responsavelId) return doAno.some((c) => c.responsavelIds.includes(sol.responsavelId!));
  const nomes = new Set(sol.alunoNome.split(",").map(normalizarNome).filter(Boolean));
  return doAno.some((c) => nomes.has(normalizarNome(c.alunoNome)));
}
