import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/push";

/**
 * Cardápios semanais: a direção/coordenação cadastra com antecedência e, na segunda-feira
 * da semana (a partir das 6h de Brasília), o cardápio é publicado no Mural e as famílias
 * recebem notificação. A publicação roda pelo cron semanal e, como reserva, também quando
 * alguém abre o ClassLink depois desse horário (publicarCardapiosDevidos é idempotente).
 */

export const FUSO_ESCOLA = "America/Sao_Paulo";
/** Hora local (Brasília) a partir da qual o cardápio da semana é publicado na segunda. */
export const HORA_PUBLICACAO = 6;

export const DIAS = ["seg", "ter", "qua", "qui", "sex"] as const;
export type Dia = (typeof DIAS)[number];
export const NOME_DIA: Record<Dia, string> = {
  seg: "Segunda",
  ter: "Terça",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
};

export const REFEICOES_PADRAO = ["Lanche da manhã", "Almoço", "Lanche da tarde"];

export const conteudoCardapioSchema = z
  .object({
    refeicoes: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
    itens: z.object(Object.fromEntries(DIAS.map((d) => [d, z.array(z.string().trim().max(300))])) as Record<Dia, z.ZodArray<z.ZodString>>),
  })
  .refine((c) => DIAS.every((d) => c.itens[d].length === c.refeicoes.length), {
    message: "Cada dia precisa ter um campo para cada refeição",
  })
  .refine((c) => DIAS.some((d) => c.itens[d].some((t) => t.length > 0)), {
    message: "Preencha pelo menos uma refeição",
  });
export type ConteudoCardapio = z.infer<typeof conteudoCardapioSchema>;

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)");

export const salvarCardapioSchema = z.object({
  semanaInicio: dataISO.refine((d) => ehSegunda(d), "A semana precisa começar numa segunda-feira"),
  classId: z.string().min(1).nullable().optional(),
  conteudo: conteudoCardapioSchema,
  observacoes: z.string().trim().max(1000).nullable().optional(),
  imagemPath: z.string().max(500).nullable().optional(),
});

/** Pacote de importação: os mesmos cardápios (por segmento) para várias semanas. */
export const pacoteCardapiosSchema = z.object({
  versao: z.literal(1),
  fonte: z.string().max(300).optional(),
  semanas: z.array(dataISO.refine((d) => ehSegunda(d), "Toda semana precisa começar numa segunda-feira")).min(1).max(60),
  observacoes: z.string().trim().max(1000).nullable().optional(),
  segmentos: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(80),
        sugestao: z.array(z.string()).optional(),
        naoSugerir: z.array(z.string()).optional(),
        conteudo: conteudoCardapioSchema,
      }),
    )
    .min(1)
    .max(12),
});
export type PacoteCardapios = z.infer<typeof pacoteCardapiosSchema>;

/** O que o painel envia para importar: o pacote + para quem vai cada segmento. */
export const importarCardapiosSchema = z.object({
  semanas: pacoteCardapiosSchema.shape.semanas,
  observacoes: pacoteCardapiosSchema.shape.observacoes,
  segmentos: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(80),
        conteudo: conteudoCardapioSchema,
        /** Turmas que recebem este cardápio; vazio = segmento ignorado; null = toda a escola. */
        classIds: z.array(z.string().min(1)).max(100).nullable(),
      }),
    )
    .min(1)
    .max(12),
});

// ─── Datas (sempre no fuso da escola) ─────────────────────────────────────────

/** "AAAA-MM-DD" e hora local da escola para um instante. */
export function agoraNaEscola(instante = new Date()): { data: string; hora: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO_ESCOLA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: Number(partes.hour) };
}

/** Data ISO → Date em UTC 00:00 (como o Postgres guarda @db.Date). */
export function dataParaDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dateParaData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  const d = dataParaDate(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return dateParaData(d);
}

export function ehSegunda(iso: string): boolean {
  return dataParaDate(iso).getUTCDay() === 1;
}

/** Segunda-feira da semana de uma data (domingo conta como fim da semana anterior). */
export function segundaDaSemana(iso: string): string {
  const diaSemana = dataParaDate(iso).getUTCDay(); // 0 dom … 6 sáb
  return somarDias(iso, diaSemana === 0 ? -6 : 1 - diaSemana);
}

/** "13/10" */
export function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function tituloCardapio(semanaInicio: string, turma?: string | null): string {
  return `🍽️ Cardápio da semana ${diaMes(semanaInicio)} a ${diaMes(somarDias(semanaInicio, 4))}${turma ? ` — ${turma}` : ""}`;
}

/** Texto do cardápio para o Mural (e para a notificação). */
export function textoCardapio(semanaInicio: string, conteudo: ConteudoCardapio, observacoes?: string | null): string {
  const blocos = DIAS.map((dia, i) => {
    const linhas = conteudo.refeicoes
      .map((refeicao, r) => ({ refeicao, item: conteudo.itens[dia][r]?.trim() }))
      .filter((l) => l.item)
      .map((l) => `• ${l.refeicao}: ${l.item}`);
    if (linhas.length === 0) return null;
    return `${NOME_DIA[dia]} (${diaMes(somarDias(semanaInicio, i))})\n${linhas.join("\n")}`;
  }).filter(Boolean);
  const obs = observacoes?.trim() ? `\n\nObservações: ${observacoes.trim()}` : "";
  return `${blocos.join("\n\n")}${obs}`;
}

// ─── Publicação ───────────────────────────────────────────────────────────────

/** Publica um cardápio agendado: cria a publicação no Mural e notifica as famílias. */
export async function publicarCardapio(cardapioId: string): Promise<boolean> {
  const cardapio = await prisma.cardapio.findUnique({
    where: { id: cardapioId },
    include: { class: { select: { id: true, name: true } } },
  });
  if (!cardapio || cardapio.status !== "AGENDADO") return false;

  // Reserva o cardápio antes de publicar: duas execuções ao mesmo tempo (cron + abertura
  // do app) não geram duas publicações.
  const reservado = await prisma.cardapio.updateMany({
    where: { id: cardapio.id, status: "AGENDADO" },
    data: { status: "PUBLICADO", publicadoEm: new Date() },
  });
  if (reservado.count === 0) return false;

  const semana = dateParaData(cardapio.semanaInicio);
  const conteudo = cardapio.conteudo as ConteudoCardapio;
  const titulo = tituloCardapio(semana, cardapio.class?.name);
  const post = await prisma.post.create({
    data: {
      title: titulo,
      body: textoCardapio(semana, conteudo, cardapio.observacoes),
      audience: cardapio.classId ? "CLASS" : "SCHOOL",
      classId: cardapio.classId,
      mediaUrl: cardapio.imagemPath,
      mediaType: cardapio.imagemPath ? "image" : null,
      schoolId: cardapio.schoolId,
      authorId: cardapio.criadoPorId,
    },
  });
  await prisma.cardapio.update({ where: { id: cardapio.id }, data: { postId: post.id } });

  const familias = await prisma.user.findMany({
    where: {
      schoolId: cardapio.schoolId,
      role: "GUARDIAN",
      active: true,
      deletedAt: null,
      studentLinks: { some: { student: { deletedAt: null, ...(cardapio.classId ? { classId: cardapio.classId } : {}) } } },
    },
    select: { id: true },
  });
  await notifyUsers(
    familias.map((f) => f.id),
    { title: titulo, body: "Veja o que as crianças vão comer nesta semana.", url: "/dashboard/cardapio" },
  ).catch((err) => console.error("push do cardápio falhou", err));
  return true;
}

/**
 * Publica o cardápio agendado da semana atual (na segunda, a partir das 6h de Brasília;
 * se o cron falhar, sai na primeira abertura do app depois disso). Semanas passadas não
 * são publicadas: cardápio velho só confundiria as famílias.
 */
export async function publicarCardapiosDevidos(instante = new Date(), schoolId?: string): Promise<number> {
  const { data, hora } = agoraNaEscola(instante);
  const segundaAtual = segundaDaSemana(data);
  if (data === segundaAtual && hora < HORA_PUBLICACAO) return 0;

  const devidos = await prisma.cardapio.findMany({
    where: { status: "AGENDADO", semanaInicio: dataParaDate(segundaAtual), ...(schoolId ? { schoolId } : {}) },
    select: { id: true },
  });
  let publicados = 0;
  for (const { id } of devidos) {
    if (await publicarCardapio(id)) publicados++;
  }
  return publicados;
}

/** Segunda-feira da semana atual, no fuso da escola. */
export function segundaAtual(instante = new Date()): string {
  return segundaDaSemana(agoraNaEscola(instante).data);
}

/** Atualiza a publicação do Mural de um cardápio já publicado (depois de uma edição). */
export async function atualizarPublicacao(cardapioId: string): Promise<void> {
  const c = await prisma.cardapio.findUnique({ where: { id: cardapioId }, include: { class: { select: { name: true } } } });
  if (!c?.postId) return;
  const semana = dateParaData(c.semanaInicio);
  await prisma.post.update({
    where: { id: c.postId },
    data: {
      title: tituloCardapio(semana, c.class?.name),
      body: textoCardapio(semana, c.conteudo as ConteudoCardapio, c.observacoes),
      mediaUrl: c.imagemPath,
      mediaType: c.imagemPath ? "image" : null,
    },
  });
}
