// Boletos do ano emitidos pela própria família (servidor). A família, em Faturas, emite de uma
// vez no Banco Inter as parcelas do ano do contrato assinado (uma por mês, vencimento dia 05).
// Só acontece com tudo isto ao mesmo tempo:
// - a direção ligou a opção (School.familiaEmiteBoletosAno, desligada por padrão);
// - o Inter está configurado e o aluno está liberado no Inter (lista de piloto, quando existe);
// - quem pede é o responsável financeiro do aluno, com CPF e endereço completos;
// - o contrato do ano está assinado e tem valor de parcela (ver boletos-do-ano.ts).
// Nada é criado para dezembro/2026 ou meses fora do contrato; mês que a escola já lançou com
// outro valor não é tocado.
import { prisma } from "@/lib/prisma";
import { escolaEhDemonstracao } from "@/lib/escola-demonstracao";
import { alunoLiberadoNoInter, isBancoInterConfigured } from "@/lib/banco-inter";
import { camposFaltandoNoEndereco, emitirBoletoNoInter } from "@/lib/boleto-emissao";
import { destinosDosAlunos } from "@/lib/contratos-server";
import { valoresDoContrato, type CondicoesContrato } from "@/lib/contrato-modelo/tipos";
import { executarComLimite } from "@/lib/concorrencia";
import { ErroDeUsuario } from "@/lib/erros";
import { planoDoAno, type MesDoAno } from "@/lib/boletos-do-ano";

/** Emissões simultâneas no Inter: o lote de 12 cabe no tempo da função sem forçar o banco. */
const EMISSOES_SIMULTANEAS = 3;

export interface AnoDoAluno {
  studentId: string;
  alunoNome: string;
  anoLetivo: number;
  parcela: number | null;
  /** Motivo de não poder emitir nada para este aluno (null = pode, nos meses A_EMITIR). */
  bloqueio: string | null;
  meses: MesDoAno[];
}

export interface EstadoBoletosDoAno {
  /** A opção aparece para a família (direção ligou e o Inter está configurado). */
  disponivel: boolean;
  alunos: AnoDoAluno[];
}

type Endereco = Partial<Record<"cep" | "logradouro" | "numero" | "bairro" | "cidade" | "uf", unknown>>;

export async function opcaoLigada(schoolId: string): Promise<boolean> {
  if (!isBancoInterConfigured() || (await escolaEhDemonstracao(schoolId))) return false;
  const escola = await prisma.school.findUnique({ where: { id: schoolId }, select: { familiaEmiteBoletosAno: true } });
  return Boolean(escola?.familiaEmiteBoletosAno);
}

/** O que cada filho do responsável tem para emitir no ano do contrato assinado. */
export async function estadoBoletosDoAno(guardianId: string, schoolId: string, hoje: Date): Promise<EstadoBoletosDoAno> {
  if (!(await opcaoLigada(schoolId))) return { disponivel: false, alunos: [] };

  const [responsavel, vinculos] = await Promise.all([
    prisma.user.findUnique({ where: { id: guardianId }, select: { cpf: true, enderecoCobranca: true, active: true } }),
    prisma.guardianStudent.findMany({
      where: { guardianId, student: { schoolId, deletedAt: null } },
      select: { student: { select: { id: true, name: true, bolsista: true } } },
    }),
  ]);
  const alunos = vinculos.map((v) => v.student);
  if (alunos.length === 0) return { disponivel: true, alunos: [] };

  const endereco = (responsavel?.enderecoCobranca ?? null) as Endereco | null;
  const semDados =
    !responsavel?.cpf || !endereco || camposFaltandoNoEndereco(endereco).length > 0
      ? "Cadastre CPF e endereço completos em “Editar dados de cobrança” para emitir."
      : null;

  const ids = alunos.map((a) => a.id);
  const anoAtual = hoje.getFullYear();
  const [destinos, contratos, boletos] = await Promise.all([
    destinosDosAlunos(ids),
    prisma.contrato.findMany({
      where: { studentId: { in: ids }, status: "COMPLETO", anoLetivo: { gte: anoAtual }, modelo: { not: null } },
      orderBy: [{ anoLetivo: "desc" }, { updatedAt: "desc" }],
      select: { studentId: true, anoLetivo: true, condicoes: true },
    }),
    prisma.boleto.findMany({
      where: { studentId: { in: ids }, mesReferencia: { gte: `${anoAtual}-01` } },
      select: { studentId: true, mesReferencia: true, valor: true, status: true, codigoSolicitacao: true, porResponsavelFinanceiro: true, destinatarioId: true },
    }),
  ]);

  const resultado: AnoDoAluno[] = [];
  for (const aluno of alunos) {
    // O contrato mais recente assinado deste ano letivo em diante (o de 2027, hoje).
    const contrato = contratos.find((c) => c.studentId === aluno.id);
    const vazio = { studentId: aluno.id, alunoNome: aluno.name, parcela: null, meses: [] as MesDoAno[] };
    if (!contrato) {
      resultado.push({ ...vazio, anoLetivo: anoAtual + 1, bloqueio: "O contrato do próximo ano ainda não está assinado." });
      continue;
    }
    const destino = destinos.get(aluno.id);
    let bloqueio: string | null = null;
    if (aluno.bolsista) bloqueio = "Aluno isento de mensalidade: não há boletos a emitir.";
    else if (!alunoLiberadoNoInter(aluno.id)) bloqueio = "A emissão pelo app ainda não foi liberada para este aluno.";
    else if (destino?.ids[0] !== guardianId) bloqueio = "Só o responsável financeiro do aluno emite os boletos.";
    else if (!responsavel?.active) bloqueio = "Conta desativada.";
    else if (semDados) bloqueio = semDados;

    const condicoes = contrato.condicoes as Partial<CondicoesContrato> | null;
    const plano = planoDoAno(
      {
        anoLetivo: contrato.anoLetivo,
        valores: valoresDoContrato(contrato.condicoes),
        primeiroUltimo: condicoes?.config?.parcelas?.primeiroUltimo ?? null,
      },
      boletos
        .filter((b) => b.studentId === aluno.id)
        .map((b) => ({ ...b, valor: Number(b.valor) })),
      hoje,
      guardianId,
    );
    resultado.push({
      studentId: aluno.id,
      alunoNome: aluno.name,
      anoLetivo: contrato.anoLetivo,
      parcela: plano.parcela,
      bloqueio: bloqueio ?? plano.bloqueio,
      meses: plano.meses,
    });
  }
  return { disponivel: true, alunos: resultado };
}

export interface ResultadoEmissaoDoAno {
  emitidos: number;
  erros: number;
  /** Primeiro motivo de erro do Inter, para mostrar à família. */
  erro?: string;
}

/**
 * Emite no Inter os meses A_EMITIR do aluno. Recalcula tudo no servidor (não confia na tela):
 * cria o lançamento do mês que ainda não existe (com o valor do contrato) e emite; o que a
 * escola já lançou com o mesmo valor é só emitido. Emissão duplicada é barrada pela reserva de
 * `emitirBoletoNoInter` e pelo índice único (aluno, mês).
 */
export async function emitirBoletosDoAno(guardianId: string, schoolId: string, studentId: string, hoje: Date): Promise<ResultadoEmissaoDoAno> {
  const estado = await estadoBoletosDoAno(guardianId, schoolId, hoje);
  if (!estado.disponivel) throw new ErroDeUsuario("A emissão dos boletos do ano pelo app não está ligada pela escola.", 409);
  const aluno = estado.alunos.find((a) => a.studentId === studentId);
  if (!aluno) throw new ErroDeUsuario("Aluno não encontrado entre os seus.", 404);
  if (aluno.bloqueio) throw new ErroDeUsuario(aluno.bloqueio, 409);
  const aEmitir = aluno.meses.filter((m) => m.situacao === "A_EMITIR");
  if (aEmitir.length === 0) return { emitidos: 0, erros: 0 };

  const responsavel = await prisma.user.findUniqueOrThrow({ where: { id: guardianId }, select: { name: true, cpf: true, enderecoCobranca: true } });
  const resultado: ResultadoEmissaoDoAno = { emitidos: 0, erros: 0 };

  const tarefas = aEmitir.map((mes) => async () => {
    const [a, m] = mes.vencimento.split("-").map(Number);
    const vencimento = new Date(a, m - 1, 5, 12, 0, 0);
    let boleto = await prisma.boleto.findUnique({ where: { studentId_mesReferencia: { studentId, mesReferencia: mes.mesReferencia } } });
    if (!boleto) {
      try {
        boleto = await prisma.boleto.create({
          data: {
            studentId,
            schoolId,
            mesReferencia: mes.mesReferencia,
            valor: mes.valor,
            vencimento,
            status: "PENDENTE",
            porResponsavelFinanceiro: true,
            destinatarioId: guardianId,
          },
        });
      } catch {
        // Criado agora por outra requisição (dois toques, ou o lançamento mensal da escola).
        boleto = await prisma.boleto.findUnique({ where: { studentId_mesReferencia: { studentId, mesReferencia: mes.mesReferencia } } });
      }
    }
    if (!boleto || boleto.codigoSolicitacao || Math.round(Number(boleto.valor) * 100) !== Math.round(mes.valor * 100)) return;
    const r = await emitirBoletoNoInter(boleto, aluno.alunoNome, responsavel);
    if (r.ok) resultado.emitidos++;
    else {
      resultado.erros++;
      resultado.erro ??= r.erro;
    }
  });
  await executarComLimite(tarefas, EMISSOES_SIMULTANEAS);
  console.info("boletos do ano", { studentId, ano: aluno.anoLetivo, emitidos: resultado.emitidos, erros: resultado.erros });
  return resultado;
}
