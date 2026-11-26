/**
 * Aviso único "estamos definindo as turmas" (banco e envio). Regras em src/lib/aviso-turmas.ts.
 * O automático roda junto com os lembretes (cron diário); o manual é da direção (Gestão › Lembretes).
 */
import { prisma } from "@/lib/prisma";
import { executarComLimite } from "@/lib/concorrencia";
import { CAMPANHA_REMATRICULA } from "@/lib/rematricula";
import { enviarMensagemFamilia, type CanalLembrete } from "@/lib/envio-familia";
import { ultimoEnvioPorFamilia, type ConfigLembretes, type PendenciaAvaliada, type RegistroLembrete } from "@/lib/lembretes";
import { avaliarAvisoTurmas, mensagemAvisoTurmas, modeloAvisoTurmas, type ModeloAvisoTurmas } from "@/lib/aviso-turmas";

/** Ano letivo citado no aviso ({ano}): o da campanha de matrícula/rematrícula. */
export const ANO_AVISO_TURMAS = CAMPANHA_REMATRICULA.ano;

export interface ConfigAvisoTurmas {
  ativo: boolean;
  /** Texto salvo pela direção (null = usa o padrão). */
  salvo: { titulo: string | null; texto: string | null };
  modelo: ModeloAvisoTurmas;
}

export async function carregarAvisoTurmas(schoolId: string): Promise<ConfigAvisoTurmas> {
  const escola = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { avisoTurmasAtivo: true, avisoTurmasTitulo: true, avisoTurmasTexto: true },
  });
  const salvo = { titulo: escola?.avisoTurmasTitulo ?? null, texto: escola?.avisoTurmasTexto ?? null };
  return { ativo: escola?.avisoTurmasAtivo ?? false, salvo, modelo: modeloAvisoTurmas(salvo) };
}

/** Entrega que não falhou (ou está em andamento): conta como "já recebeu". */
const NAO_FALHOU = { OR: [{ status: null }, { status: { not: "FALHOU" } }] };

/** Responsáveis que já receberam o aviso (automático ou manual). */
export async function responsaveisJaAvisados(schoolId: string): Promise<Set<string>> {
  const linhas = await prisma.avisoTurmasEnvio.findMany({ where: { schoolId, ...NAO_FALHOU }, select: { responsavelId: true } });
  return new Set(linhas.map((l) => l.responsavelId));
}

/** Último aviso de cada responsável, para a tela da direção. */
export async function ultimosAvisosTurmas(schoolId: string, responsavelIds: string[]) {
  if (responsavelIds.length === 0) return new Map<string, UltimoAvisoTurmas>();
  const linhas = await prisma.avisoTurmasEnvio.findMany({
    where: { schoolId, responsavelId: { in: responsavelIds } },
    orderBy: { enviadoEm: "desc" },
    select: { responsavelId: true, automatico: true, titulo: true, texto: true, canal: true, status: true, falha: true, enviadoEm: true },
  });
  const ultimo = new Map<string, UltimoAvisoTurmas>();
  for (const l of linhas) if (!ultimo.has(l.responsavelId)) ultimo.set(l.responsavelId, l);
  return ultimo;
}
export interface UltimoAvisoTurmas {
  responsavelId: string;
  automatico: boolean;
  /** Texto como a família recebeu (a direção pode editar e reenviar). */
  titulo: string;
  texto: string;
  canal: string | null;
  status: string | null;
  falha: string | null;
  enviadoEm: Date;
}

const chaveAutomatico = (schoolId: string, responsavelId: string) => `${schoolId}:${responsavelId}`;

function ehUnicidade(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export interface ResultadoAvisoTurmas {
  ativo: boolean;
  prontos: number;
  enviados: number;
  semCanal: number;
  adiados: number;
}

/**
 * Envio automático (chamado pelos lembretes, depois dos lembretes do dia). A linha é gravada com a
 * chave única ANTES do envio: se outra execução já gravou, nada sai (nunca duplica).
 */
export async function executarAvisoTurmasDaEscola(
  schoolId: string,
  dados: {
    avaliadas: PendenciaAvaliada[];
    registros: RegistroLembrete[];
    lembradosAgora: Set<string>;
    config: ConfigLembretes;
    agora: Date;
    encerrarEm?: number;
  },
): Promise<ResultadoAvisoTurmas> {
  const aviso = await carregarAvisoTurmas(schoolId);
  const resultado: ResultadoAvisoTurmas = { ativo: aviso.ativo, prontos: 0, enviados: 0, semCanal: 0, adiados: 0 };
  if (!aviso.ativo) return resultado;

  const familias = avaliarAvisoTurmas(
    dados.avaliadas,
    ultimoEnvioPorFamilia(dados.registros),
    await responsaveisJaAvisados(schoolId),
    dados.lembradosAgora,
    dados.config,
    dados.agora,
  ).filter((f) => f.situacao === "PRONTO");
  resultado.prontos = familias.length;

  await executarComLimite(
    familias.map((f) => async () => {
      if (dados.encerrarEm !== undefined && Date.now() >= dados.encerrarEm) {
        resultado.adiados++;
        return;
      }
      const msg = mensagemAvisoTurmas(aviso.modelo, { alunos: f.alunos, ano: ANO_AVISO_TURMAS, url: f.url });
      let id: string;
      try {
        ({ id } = await prisma.avisoTurmasEnvio.create({
          data: {
            schoolId,
            responsavelId: f.responsavelId,
            automatico: true,
            chaveAutomatico: chaveAutomatico(schoolId, f.responsavelId),
            titulo: msg.titulo,
            texto: msg.texto,
            enviadoEm: dados.agora,
          },
          select: { id: true },
        }));
      } catch (err) {
        if (ehUnicidade(err)) return; // já avisado por outra execução
        throw err;
      }
      const envio = await enviarMensagemFamilia(f.responsavelId, msg);
      if (envio.canal === "nenhum") {
        // Nada saiu: libera para tentar no próximo envio.
        await prisma.avisoTurmasEnvio.delete({ where: { id } });
        resultado.semCanal++;
        return;
      }
      await registrarCanal(id, envio.canal, envio.mensagemId, dados.agora);
      resultado.enviados++;
    }),
    4,
  );
  return resultado;
}

async function registrarCanal(id: string, canal: Exclude<CanalLembrete, "nenhum">, mensagemId: string | undefined, agora: Date) {
  await prisma.avisoTurmasEnvio.update({
    where: { id },
    data: {
      canal,
      mensagemId: mensagemId ?? null,
      // Pelo WhatsApp começa "enviado" e o webhook da Meta atualiza; pelo app não há confirmação.
      status: canal === "whatsapp" ? "ENVIADO" : null,
      statusEm: canal === "whatsapp" ? agora : null,
    },
  });
}

/**
 * Envio manual pela direção (caso excepcional), com o texto salvo ou um texto só para esta família.
 * Não usa a chave do automático: depois dele, o automático não manda de novo a esta família.
 */
export async function enviarAvisoTurmasManual(
  schoolId: string,
  dados: { responsavelId: string; enviadoPorId: string; modelo: ModeloAvisoTurmas; alunos: string[]; url: string },
): Promise<{ canal: CanalLembrete }> {
  const agora = new Date();
  const msg = mensagemAvisoTurmas(dados.modelo, { alunos: dados.alunos, ano: ANO_AVISO_TURMAS, url: dados.url });
  const { id } = await prisma.avisoTurmasEnvio.create({
    data: {
      schoolId,
      responsavelId: dados.responsavelId,
      automatico: false,
      enviadoPorId: dados.enviadoPorId,
      titulo: msg.titulo,
      texto: msg.texto,
      enviadoEm: agora,
    },
    select: { id: true },
  });
  const envio = await enviarMensagemFamilia(dados.responsavelId, msg);
  if (envio.canal === "nenhum") {
    await prisma.avisoTurmasEnvio.delete({ where: { id } });
    return { canal: "nenhum" };
  }
  await registrarCanal(id, envio.canal, envio.mensagemId, agora);
  return { canal: envio.canal };
}

/**
 * A Meta avisou que a entrega falhou: marca a falha e libera o automático para tentar de novo no
 * próximo envio (a família não recebeu). Devolve quantos avisos foram acertados.
 */
export async function falhaAvisoTurmas(mensagemId: string, falha?: { motivo?: string; em?: Date }): Promise<number> {
  const { count } = await prisma.avisoTurmasEnvio.updateMany({
    where: { mensagemId },
    data: { status: "FALHOU", statusEm: falha?.em ?? new Date(), falha: falha?.motivo ?? null, chaveAutomatico: null },
  });
  return count;
}

/** Entregue/lido pela Meta. Só avança: "entregue" atrasado não desfaz "lido"; falha não volta. */
export async function registrarStatusAvisoTurmas(mensagemId: string, status: "delivered" | "read", em: Date): Promise<number> {
  const novo = status === "read" ? "LIDO" : "ENTREGUE";
  const anteriores = status === "read" ? ["ENVIADO", "ENTREGUE"] : ["ENVIADO"];
  const { count } = await prisma.avisoTurmasEnvio.updateMany({
    where: { mensagemId, status: { in: anteriores } },
    data: { status: novo, statusEm: em },
  });
  return count;
}
