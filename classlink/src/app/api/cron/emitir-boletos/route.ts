import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireCronSecret } from "@/lib/cron-auth";
import { isBancoInterConfigured, emitirCobranca, consultarCobranca } from "@/lib/banco-inter";
import { mesReferenciaAtual, calcularVencimento, formatarDataISO } from "@/lib/billing";
import { notifyUsers } from "@/lib/push";

const DIA_EMISSAO_PADRAO = 1;
const DIA_VENCIMENTO_PADRAO = 10;

// Vercel Cron só invoca via GET; aceitamos POST também para schedulers externos.
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  try {
    requireCronSecret(request);

    if (!isBancoInterConfigured()) {
      return NextResponse.json({ ok: false, error: "Banco Inter não configurado — nada foi emitido" }, { status: 200 });
    }

    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const mesReferencia = mesReferenciaAtual(hoje);

    // Roda para escolas com o dia configurado explicitamente, e para as sem configuração
    // apenas quando hoje é o dia padrão (evita disparar todo dia para quem não configurou).
    const escolas = await prisma.school.findMany({
      where:
        diaHoje === DIA_EMISSAO_PADRAO
          ? { OR: [{ diaEmissaoBoletos: diaHoje }, { diaEmissaoBoletos: null }] }
          : { diaEmissaoBoletos: diaHoje },
    });

    let emitidos = 0;
    let erros = 0;
    let ignorados = 0;

    for (const escola of escolas) {
      const alunos = await prisma.student.findMany({
        where: { schoolId: escola.id, deletedAt: null, mensalidadeValor: { not: null } },
        include: {
          guardians: {
            orderBy: { createdAt: "asc" },
            take: 1,
            include: { guardian: { select: { id: true, name: true, cpf: true, enderecoCobranca: true, active: true } } },
          },
        },
      });

      for (const aluno of alunos) {
        const jaExiste = await prisma.boleto.findUnique({
          where: { studentId_mesReferencia: { studentId: aluno.id, mesReferencia } },
        });
        if (jaExiste) {
          ignorados++;
          continue;
        }

        const responsavel = aluno.guardians[0]?.guardian;
        const diaVencimento = aluno.diaVencimento ?? escola.diaVencimentoPadrao ?? DIA_VENCIMENTO_PADRAO;
        const vencimento = calcularVencimento(diaVencimento, hoje);

        if (!responsavel || !responsavel.active) {
          await prisma.boleto.create({
            data: {
              studentId: aluno.id,
              schoolId: escola.id,
              mesReferencia,
              valor: aluno.mensalidadeValor!,
              vencimento,
              status: "ERRO",
              erroDetalhe: "Aluno sem responsável financeiro ativo vinculado",
            },
          });
          erros++;
          continue;
        }

        const endereco = responsavel.enderecoCobranca as
          | { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string }
          | null;

        if (!responsavel.cpf || !endereco) {
          await prisma.boleto.create({
            data: {
              studentId: aluno.id,
              schoolId: escola.id,
              mesReferencia,
              valor: aluno.mensalidadeValor!,
              vencimento,
              status: "ERRO",
              erroDetalhe: "Responsável financeiro sem CPF/endereço de cobrança cadastrado",
            },
          });
          erros++;
          continue;
        }

        try {
          const emissao = await emitirCobranca({
            seuNumero: `${aluno.id}-${mesReferencia}`,
            valorNominal: Number(aluno.mensalidadeValor),
            dataVencimento: formatarDataISO(vencimento),
            pagador: { cpfCnpj: responsavel.cpf, nome: responsavel.name, endereco },
            mensagem: `Mensalidade ${mesReferencia} — ${aluno.name}`,
          });

          let detalhes: Awaited<ReturnType<typeof consultarCobranca>> | null = null;
          try {
            detalhes = await consultarCobranca(emissao.codigoSolicitacao);
          } catch {
            // detalhes ficam disponíveis via webhook/consulta posterior; emissão em si já foi confirmada
          }

          await prisma.boleto.create({
            data: {
              studentId: aluno.id,
              schoolId: escola.id,
              mesReferencia,
              valor: aluno.mensalidadeValor!,
              vencimento,
              status: "PENDENTE",
              codigoSolicitacao: emissao.codigoSolicitacao,
              nossoNumero: detalhes?.nossoNumero,
              linhaDigitavel: detalhes?.linhaDigitavel,
              pixCopiaCola: detalhes?.pixCopiaECola,
            },
          });

          void notifyUsers([responsavel.id], {
            title: "Novo boleto disponível",
            body: `Mensalidade de ${aluno.name} — vencimento em ${vencimento.toLocaleDateString("pt-BR")}`,
            url: "/dashboard/financeiro",
          }).catch((err) => console.error("push notify failed", err));

          emitidos++;
        } catch (err) {
          await prisma.boleto.create({
            data: {
              studentId: aluno.id,
              schoolId: escola.id,
              mesReferencia,
              valor: aluno.mensalidadeValor!,
              vencimento,
              status: "ERRO",
              erroDetalhe: err instanceof Error ? err.message : "Falha desconhecida na emissão",
            },
          });
          erros++;
        }
      }
    }

    return NextResponse.json({ ok: true, escolasProcessadas: escolas.length, emitidos, erros, ignorados });
  } catch (error) {
    return handleApiError(error);
  }
}
