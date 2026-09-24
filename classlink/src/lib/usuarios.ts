import { prisma } from "@/lib/prisma";
import { samePhoneBR } from "@/lib/whatsapp";

/**
 * Telefone já usado por outro usuário (ativo ou inativo, não excluído)? O login por
 * telefone procura um único usuário, então o mesmo celular não pode estar em duas contas.
 * Compara com e sem o nono dígito.
 */
export async function telefoneEmUso(telefone: string, exceto?: string): Promise<boolean> {
  const outros = await prisma.user.findMany({
    where: { phone: { not: null }, deletedAt: null, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { phone: true },
  });
  return outros.some((o) => o.phone && samePhoneBR(o.phone, telefone));
}
