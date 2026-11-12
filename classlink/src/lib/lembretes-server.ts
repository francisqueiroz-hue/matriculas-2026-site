/**
 * Lembretes automáticos de pendências: busca no banco o que cada família ainda precisa fazer,
 * aplica as regras de src/lib/lembretes.ts e envia (push no app; WhatsApp só para quem não tem
 * notificação ativa no celular). Usado pelo cron diário e pela tela da direção (prévia, sem enviar).
 */
import type { LembreteTipo } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyUsers, origemPublica } from "@/lib/push";
import { janelaWhatsApp } from "@/lib/canal-envio";
import { deveAvisarPorWhatsApp, parametrosModeloAviso } from "@/lib/avisos-equipe";
import { isWhatsAppConfigured, normalizePhoneBR, sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from "@/lib/whatsapp";
import { modeloDisponivel } from "@/lib/whatsapp-modelos";
import { executarComLimite } from "@/lib/concorrencia";
import { dataBR } from "@/lib/boleto-aviso";
import { CAMPANHA_REMATRICULA } from "@/lib/rematricula";
import {
  CONFIG_PADRAO,
  diasCorridos,
  ehDomingo,
  mensagemLembrete,
  planejarLembretes,
  primeiroNome,
  rematriculaJaAtendida,
  type ConfigLembretes,
  type ContratoDoAno,
  type Pendencia,
  type PlanoLembretes,
  type RegistroLembrete,
} from "@/lib/lembretes";

/** Comunicado sem prazo de resposta só gera lembrete nos primeiros 30 dias (evita cobrar passeio antigo). */
const JANELA_COMUNICADO_SEM_PRAZO_DIAS = 30;
/** Mensalidade vencida há mais de 45 dias sai dos lembretes automáticos: é cobrança da secretaria. */
const JANELA_BOLETO_VENCIDO_DIAS = 45;
/** Famílias por execução (cabe no tempo da função; o restante sai no dia seguinte). */
const MAX_FAMILIAS_POR_EXECUCAO = 300;
const DIA_MS = 86_400_000;

const responsavelAtivo = { active: true, deletedAt: null, role: "GUARDIAN" as const };

function tituloCurto(titulo: string): string {
  const limpo = titulo.replace(/\s+/g, " ").trim();
  return limpo.length > 60 ? `${limpo.slice(0, 59)}…` : limpo;
}

export async function carregarConfigLembretes(schoolId: string): Promise<ConfigLembretes> {
  const escola = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      lembretesAtivos: true,
      lembretesTipos: true,
      lembretesDiasInicio: true,
      lembretesIntervaloDias: true,
      lembretesMaxEnvios: true,
    },
  });
  if (!escola) return CONFIG_PADRAO;
  return {
    ativos: escola.lembretesAtivos,
    tipos: escola.lembretesTipos,
    diasInicio: escola.lembretesDiasInicio,
    intervaloDias: escola.lembretesIntervaloDias,
    maxEnvios: escola.lembretesMaxEnvios,
  };
}

async function pendenciasDeContrato(schoolId: string): Promise<Pendencia[]> {
  const contratos = await prisma.contrato.findMany({
    where: { schoolId, status: { in: ["AGUARDANDO_ASSINATURA", "DEVOLVIDO"] }, student: { deletedAt: null } },
    select: {
      id: true,
      anoLetivo: true,
      status: true,
      updatedAt: true,
      student: { select: { name: true, guardians: { where: { guardian: responsavelAtivo }, select: { guardianId: true } } } },
    },
  });
  return contratos.flatMap((c) =>
    c.student.guardians.map((g) => ({
      tipo: "CONTRATO" as const,
      referenciaId: c.id,
      responsavelId: g.guardianId,
      // Última mudança do contrato: devolução ou PDF refeito recomeçam a contagem.
      desde: c.updatedAt,
      aluno: c.student.name,
      descricao:
        c.status === "DEVOLVIDO"
          ? `reenviar o contrato de matrícula ${c.anoLetivo} de ${primeiroNome(c.student.name)}, que voltou para correção`
          : `assinar o contrato de matrícula ${c.anoLetivo} de ${primeiroNome(c.student.name)}`,
      url: "/dashboard/contratos",
    })),
  );
}

async function pendenciasDeComunicado(schoolId: string, agora: Date): Promise<Pendencia[]> {
  const limiteSemPrazo = new Date(agora.getTime() - JANELA_COMUNICADO_SEM_PRAZO_DIAS * DIA_MS);
  const comunicados = await prisma.comunicado.findMany({
    where: {
      schoolId,
      // Circular só pede leitura: fica fora para não virar cobrança diária de leitura.
      tipo: { in: ["AUTORIZACAO_PASSEIO", "CONFIRMACAO_REUNIAO"] },
      OR: [{ prazoResposta: { gt: agora } }, { prazoResposta: null, dataCriacao: { gte: limiteSemPrazo } }],
    },
    select: { id: true, tipo: true, titulo: true, dataCriacao: true, audience: true, classId: true, alunoId: true },
  });
  if (comunicados.length === 0) return [];

  const respostas = await prisma.respostaComunicado.findMany({
    where: { comunicadoId: { in: comunicados.map((c) => c.id) }, resposta: { not: "PENDENTE_EXPIRADO" } },
    select: { comunicadoId: true, alunoId: true },
  });
  // Basta um responsável do aluno ter respondido: o outro não é lembrado.
  const respondido = new Set(respostas.map((r) => `${r.comunicadoId}:${r.alunoId}`));

  const vinculos = await prisma.guardianStudent.findMany({
    where: { guardian: { schoolId, ...responsavelAtivo }, student: { schoolId, deletedAt: null } },
    select: { guardianId: true, studentId: true, student: { select: { name: true, classId: true } } },
  });

  const pendencias: Pendencia[] = [];
  for (const c of comunicados) {
    const alvo = vinculos.filter((v) =>
      c.audience === "CLASS" ? v.student.classId === c.classId : c.audience === "STUDENT" ? v.studentId === c.alunoId : true,
    );
    for (const v of alvo) {
      if (respondido.has(`${c.id}:${v.studentId}`)) continue;
      const nome = primeiroNome(v.student.name);
      pendencias.push({
        tipo: "COMUNICADO",
        referenciaId: `${c.id}:${v.studentId}`,
        responsavelId: v.guardianId,
        desde: c.dataCriacao,
        aluno: v.student.name,
        descricao:
          c.tipo === "AUTORIZACAO_PASSEIO"
            ? `responder a autorização "${tituloCurto(c.titulo)}" de ${nome}`
            : `confirmar a presença em "${tituloCurto(c.titulo)}" (${nome})`,
        url: `/dashboard/comunicados/${c.id}`,
      });
    }
  }
  return pendencias;
}

async function pendenciasDeBoleto(schoolId: string, agora: Date): Promise<Pendencia[]> {
  const boletos = await prisma.boleto.findMany({
    where: {
      schoolId,
      status: { in: ["PENDENTE", "VENCIDO"] },
      vencimento: { gte: new Date(agora.getTime() - JANELA_BOLETO_VENCIDO_DIAS * DIA_MS) },
      student: { deletedAt: null, bolsista: false },
    },
    select: {
      id: true,
      vencimento: true,
      createdAt: true,
      student: {
        select: {
          name: true,
          // Mesmo responsável que recebe o aviso do boleto (o 1º vinculado): dado financeiro
          // não vai para os demais responsáveis.
          guardians: { orderBy: { createdAt: "asc" }, take: 1, select: { guardianId: true, guardian: { select: { active: true, deletedAt: true } } } },
        },
      },
    },
  });
  return boletos.flatMap((b) => {
    const g = b.student.guardians[0];
    if (!g || !g.guardian.active || g.guardian.deletedAt) return [];
    const nome = primeiroNome(b.student.name);
    const data = dataBR(b.vencimento);
    const diasAte = diasCorridos(agora, b.vencimento);
    return [
      {
        tipo: "BOLETO" as const,
        referenciaId: b.id,
        responsavelId: g.guardianId,
        desde: b.createdAt,
        vencimento: b.vencimento,
        aluno: b.student.name,
        descricao:
          diasAte < 0
            ? `pagar a mensalidade de ${nome}, vencida em ${data}`
            : diasAte === 1
              ? `pagar a mensalidade de ${nome}, que vence amanhã (${data})`
              : `pagar a mensalidade de ${nome}, com vencimento em ${data}`,
        url: "/dashboard/financeiro",
      },
    ];
  });
}

async function pendenciasDeRematricula(schoolId: string): Promise<Pendencia[]> {
  if (!CAMPANHA_REMATRICULA.ativa) return [];
  const ano = CAMPANHA_REMATRICULA.ano;
  const [alunos, confirmacoes, contratos] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId, deletedAt: null },
      select: { id: true, name: true, guardians: { where: { guardian: responsavelAtivo }, select: { guardianId: true } } },
    }),
    prisma.solicitacaoMatricula.findMany({
      where: { schoolId, tipo: "REMATRICULA", anoLetivo: ano, responsavelId: { not: null }, status: { not: "DESISTIU" } },
      select: { responsavelId: true },
    }),
    prisma.contrato.findMany({ where: { schoolId, anoLetivo: ano }, select: { studentId: true } }),
  ]);
  const confirmaram = new Set(confirmacoes.map((c) => c.responsavelId));
  const comContrato = new Set(contratos.map((c) => c.studentId));

  return alunos.flatMap((a) => {
    // Mesma regra do painel de rematrícula: qualquer responsável que confirmou vale pelo aluno.
    if (comContrato.has(a.id) || a.guardians.some((g) => confirmaram.has(g.guardianId))) return [];
    return a.guardians.map((g) => ({
      tipo: "REMATRICULA" as const,
      referenciaId: `${ano}:${a.id}`,
      responsavelId: g.guardianId,
      desde: null, // conta a partir do dia em que o sistema viu a pendência pela primeira vez
      aluno: a.name,
      descricao: `confirmar a rematrícula ${ano} de ${primeiroNome(a.name)}`,
      url: "/dashboard",
    }));
  });
}

export async function coletarPendencias(schoolId: string, tipos: LembreteTipo[], agora: Date): Promise<Pendencia[]> {
  const quer = new Set(tipos);
  const partes = await Promise.all([
    quer.has("CONTRATO") ? pendenciasDeContrato(schoolId) : [],
    quer.has("COMUNICADO") ? pendenciasDeComunicado(schoolId, agora) : [],
    quer.has("BOLETO") ? pendenciasDeBoleto(schoolId, agora) : [],
    quer.has("REMATRICULA") ? pendenciasDeRematricula(schoolId) : [],
  ]);
  return partes.flat();
}

async function carregarRegistros(schoolId: string, agora: Date): Promise<RegistroLembrete[]> {
  // Os resolvidos só importam pelo último envio (intervalo da família): basta o último mês.
  return prisma.lembretePendencia.findMany({
    where: { schoolId, OR: [{ resolvidoEm: null }, { ultimoEnvioEm: { gte: new Date(agora.getTime() - 31 * DIA_MS) } }] },
    select: { tipo: true, referenciaId: true, responsavelId: true, pendenteDesde: true, envios: true, ultimoEnvioEm: true, resolvidoEm: true },
  });
}

export async function planejarDaEscola(schoolId: string, agora = new Date()) {
  const config = await carregarConfigLembretes(schoolId);
  const [pendencias, registros] = await Promise.all([coletarPendencias(schoolId, config.tipos, agora), carregarRegistros(schoolId, agora)]);
  return { config, registros, plano: planejarLembretes(pendencias, registros, config, agora) };
}

export type CanalLembrete = "push" | "whatsapp" | "nenhum";

/** Envia a mensagem única da família. Nunca lança: falha vira "nenhum" e tenta de novo amanhã. */
export async function enviarLembreteFamilia(
  responsavelId: string,
  pendencias: Pendencia[],
): Promise<CanalLembrete> {
  const { titulo, texto, url } = mensagemLembrete(pendencias);
  let push = 0;
  try {
    push = (await notifyUsers([responsavelId], { title: titulo, body: texto, url })).enviados;
  } catch (err) {
    console.error("lembretes: falha no push", err);
  }
  if (push > 0) return "push";

  // Sem notificação no celular: WhatsApp da escola, como já é feito com as mensagens.
  try {
    if (!isWhatsAppConfigured()) return "nenhum";
    const pessoa = await prisma.user.findUnique({
      where: { id: responsavelId },
      select: { phone: true, avisosWhatsApp: true, whatsappUltimaMensagemEm: true, _count: { select: { pushTokens: true } } },
    });
    if (!pessoa) return "nenhum";
    // Quem tem aparelho com push ativo e o envio falhou agora não recebe WhatsApp: tenta amanhã.
    if (!deveAvisarPorWhatsApp({ avisosWhatsApp: pessoa.avisosWhatsApp, aparelhosComPush: pessoa._count.pushTokens })) return "nenhum";
    const telefone = pessoa.phone ? normalizePhoneBR(pessoa.phone) : null;
    if (!telefone) return "nenhum";
    const link = `${origemPublica() ?? ""}${url}`;
    if (janelaWhatsApp(pessoa.whatsappUltimaMensagemEm).aberta) {
      await sendWhatsAppTextMessage(telefone, `${titulo}\n\n${texto}\n${link}`);
      return "whatsapp";
    }
    const modelo = await modeloDisponivel("aviso");
    if (!modelo) return "nenhum";
    await sendWhatsAppTemplateMessage(telefone, modelo, parametrosModeloAviso("Secretaria", texto, link));
    return "whatsapp";
  } catch (err) {
    console.error("lembretes: falha no WhatsApp", err);
    return "nenhum";
  }
}

export interface ResultadoExecucao {
  ativos: boolean;
  domingo: boolean;
  pendencias: number;
  familiasProntas: number;
  enviadas: number;
  porPush: number;
  porWhatsApp: number;
  semCanal: number;
  resolvidas: number;
}

/**
 * Execução diária para uma escola: registra pendências novas (para contar os dias), marca as
 * resolvidas e, se a escola ativou e não é domingo, envia uma mensagem por família pronta.
 */
export async function executarLembretesDaEscola(schoolId: string, agora = new Date()): Promise<ResultadoExecucao> {
  const { config, registros, plano } = await planejarDaEscola(schoolId, agora);
  const domingo = ehDomingo(agora);
  const resultado: ResultadoExecucao = {
    ativos: config.ativos,
    domingo,
    pendencias: plano.avaliadas.length,
    familiasProntas: plano.envios.length,
    enviadas: 0,
    porPush: 0,
    porWhatsApp: 0,
    semCanal: 0,
    resolvidas: plano.resolvidos.length,
  };

  await registrarSituacao(schoolId, plano, registros, agora);

  if (!config.ativos || domingo) return resultado;

  const lote = plano.envios.slice(0, MAX_FAMILIAS_POR_EXECUCAO);
  await executarComLimite(
    lote.map((envio) => async () => {
      const canal = await enviarLembreteFamilia(envio.responsavelId, envio.pendencias);
      if (canal === "nenhum") {
        resultado.semCanal++;
        return;
      }
      resultado.enviadas++;
      if (canal === "push") resultado.porPush++;
      else resultado.porWhatsApp++;
      await prisma.lembretePendencia.updateMany({
        where: {
          schoolId,
          responsavelId: envio.responsavelId,
          OR: envio.pendencias.map((p) => ({ tipo: p.tipo, referenciaId: p.referenciaId })),
        },
        data: { envios: { increment: 1 }, ultimoEnvioEm: agora },
      });
    }),
    4,
  );
  return resultado;
}

/** Cria as linhas das pendências novas, reabre as que voltaram e fecha as resolvidas. */
async function registrarSituacao(schoolId: string, plano: PlanoLembretes, registros: RegistroLembrete[], agora: Date) {
  const chave = (r: { tipo: string; referenciaId: string; responsavelId: string }) => `${r.tipo}|${r.referenciaId}|${r.responsavelId}`;
  const existentes = new Map(registros.map((r) => [chave(r), r]));

  const novas = plano.avaliadas.filter((a) => !existentes.has(chave(a)));
  if (novas.length > 0) {
    // skipDuplicates: linha resolvida há mais de um mês (fora da consulta) é tratada abaixo.
    await prisma.lembretePendencia.createMany({
      data: novas.map((a) => ({
        schoolId,
        tipo: a.tipo,
        referenciaId: a.referenciaId,
        responsavelId: a.responsavelId,
        pendenteDesde: a.pendenteDesde,
      })),
      skipDuplicates: true,
    });
    // Linha antiga já resolvida (não veio na consulta) e a pendência voltou: reabre do zero.
    await prisma.lembretePendencia.updateMany({
      where: {
        schoolId,
        resolvidoEm: { not: null },
        OR: novas.map((a) => ({ tipo: a.tipo, referenciaId: a.referenciaId, responsavelId: a.responsavelId })),
      },
      data: { resolvidoEm: null, envios: 0, ultimoEnvioEm: null, pendenteDesde: agora },
    });
  }

  const reabrir = plano.avaliadas.filter((a) => existentes.get(chave(a))?.resolvidoEm);
  for (const a of reabrir) {
    await prisma.lembretePendencia.updateMany({
      where: { tipo: a.tipo, referenciaId: a.referenciaId, responsavelId: a.responsavelId },
      data: { resolvidoEm: null, envios: 0, ultimoEnvioEm: null, pendenteDesde: a.pendenteDesde },
    });
  }

  if (plano.resolvidos.length > 0) {
    await prisma.lembretePendencia.updateMany({
      where: {
        schoolId,
        resolvidoEm: null,
        OR: plano.resolvidos.map((r) => ({ tipo: r.tipo, referenciaId: r.referenciaId, responsavelId: r.responsavelId })),
      },
      data: { resolvidoEm: agora },
    });
  }
}

/** Pendências que dependem da escola (não da família), para o resumo da direção. */
export async function pendenciasDaEscola(schoolId: string, diasInicio: number, agora = new Date()) {
  const limite = new Date(agora.getTime() - diasInicio * DIA_MS);
  const [contratos, solicitacoes] = await Promise.all([
    prisma.contrato.findMany({
      where: { schoolId, status: { in: ["EM_CONFERENCIA", "AGUARDANDO_ORIGINAL"] }, updatedAt: { lte: limite } },
      orderBy: { updatedAt: "asc" },
      select: { id: true, status: true, anoLetivo: true, updatedAt: true, student: { select: { name: true } } },
    }),
    prisma.solicitacaoMatricula.findMany({
      where: { schoolId, status: "NOVA", createdAt: { lte: limite } },
      orderBy: { createdAt: "asc" },
      select: { id: true, tipo: true, anoLetivo: true, responsavelId: true, alunoNome: true, responsavelNome: true, createdAt: true },
    }),
  ]);

  // Rematrícula com contrato do ano já renovado não é pendência: a falta de documento aparece pelo contrato.
  const anos = [...new Set(solicitacoes.filter((s) => s.tipo === "REMATRICULA").map((s) => s.anoLetivo))];
  const contratosDoAno: ContratoDoAno[] = anos.length
    ? (
        await prisma.contrato.findMany({
          where: { schoolId, anoLetivo: { in: anos } },
          select: { anoLetivo: true, student: { select: { name: true, guardians: { select: { guardianId: true } } } } },
        })
      ).map((c) => ({ anoLetivo: c.anoLetivo, alunoNome: c.student.name, responsavelIds: c.student.guardians.map((g) => g.guardianId) }))
    : [];

  return {
    contratos,
    solicitacoes: solicitacoes
      .filter((s) => !rematriculaJaAtendida(s, contratosDoAno))
      .map(({ id, tipo, alunoNome, responsavelNome, createdAt }) => ({ id, tipo, alunoNome, responsavelNome, createdAt })),
  };
}
