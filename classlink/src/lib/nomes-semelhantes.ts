import { prisma } from "@/lib/prisma";

/**
 * Detecção de responsável possivelmente duplicado: o mesmo pai/mãe cadastrado duas vezes
 * (ex.: com outro celular ao vincular o segundo filho) acaba com dois logins. Nomes são
 * comparados sem acentos/maiúsculas e sem partículas ("da", "de"...).
 */
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

export function tokensDoNome(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !PARTICULAS.has(t));
}

/** Mesmo nome, ou mesmo primeiro e último nome ("Maria Silva" ≈ "Maria da Costa Silva"). */
export function nomesSemelhantes(a: string, b: string): boolean {
  const ta = tokensDoNome(a);
  const tb = tokensDoNome(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  return ta.length >= 2 && tb.length >= 2 && ta[0] === tb[0] && ta.at(-1) === tb.at(-1);
}

export interface ResponsavelSemelhante {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  alunos: string[];
}

/** Responsáveis ativos da escola com nome parecido. */
export async function responsaveisSemelhantes(schoolId: string, nome: string): Promise<ResponsavelSemelhante[]> {
  const responsaveis = await prisma.user.findMany({
    where: { schoolId, role: "GUARDIAN", deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      studentLinks: {
        where: { student: { deletedAt: null } },
        select: { student: { select: { name: true, class: { select: { name: true } } } } },
      },
    },
  });
  return responsaveis
    .filter((r) => nomesSemelhantes(r.name, nome))
    .map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      alunos: r.studentLinks.map((l) => (l.student.class ? `${l.student.name} (${l.student.class.name})` : l.student.name)),
    }));
}

/** Ids dos responsáveis que têm outro responsável com nome parecido (para sinalizar em Acessos). */
export function idsComNomeRepetido(pessoas: { id: string; name: string }[]): Set<string> {
  const repetidos = new Set<string>();
  for (let i = 0; i < pessoas.length; i++) {
    for (let j = i + 1; j < pessoas.length; j++) {
      if (nomesSemelhantes(pessoas[i].name, pessoas[j].name)) {
        repetidos.add(pessoas[i].id);
        repetidos.add(pessoas[j].id);
      }
    }
  }
  return repetidos;
}
