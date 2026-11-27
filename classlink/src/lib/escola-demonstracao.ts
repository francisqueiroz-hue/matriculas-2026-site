/**
 * Escola de demonstração: um "inquilino" separado, só com dados fictícios, usado pela direção
 * para entrar como família e conferir as telas (Faturas, Mural, Rotina...). Como tudo no app é
 * filtrado por schoolId, a conta demo não vê nada da escola real e a escola real não vê a demo
 * (contagens, listas, exportações, funil).
 *
 * Proteções extras, porque algumas rotinas percorrem todas as escolas:
 * - crons de boletos e lembretes ignoram escolas de demonstração;
 * - lembretes e aviso de turmas ficam sempre desligados nelas, mesmo se alguém ligar;
 * - nenhuma chamada ao Banco Inter (emissão, PDF) sai de uma escola de demonstração;
 * - o formulário público de matrículas nunca cai nela.
 */
import { prisma } from "@/lib/prisma";

/** Filtro Prisma para "só escolas reais". */
export const SO_ESCOLAS_REAIS = { demonstracao: false } as const;

export async function escolaEhDemonstracao(schoolId: string): Promise<boolean> {
  const escola = await prisma.school.findUnique({ where: { id: schoolId }, select: { demonstracao: true } });
  return escola?.demonstracao ?? false;
}

export const MENSAGEM_BOLETO_DEMONSTRACAO =
  "Boleto fictício da conta de demonstração: não existe no banco e não pode ser pago.";
