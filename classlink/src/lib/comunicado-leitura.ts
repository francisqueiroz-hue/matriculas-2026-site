import { prisma } from "@/lib/prisma";

/**
 * Registra a abertura do comunicado pelo responsável. A primeira abertura vale: reabrir não muda
 * o horário. O horário é do servidor. Nunca lança erro: a falha em registrar não pode impedir a
 * família de ler o comunicado (devolve null e a leitura é registrada na próxima abertura).
 */
export async function registrarAbertura(comunicadoId: string, userId: string): Promise<Date | null> {
  try {
    const leitura = await prisma.comunicadoLeitura.upsert({
      where: { comunicadoId_userId: { comunicadoId, userId } },
      update: {},
      create: { comunicadoId, userId },
      select: { lidoEm: true },
    });
    return leitura.lidoEm;
  } catch (err) {
    console.error("comunicado: falha ao registrar a abertura", err);
    return null;
  }
}

interface Pessoa {
  id: string;
  name: string;
}

/** Quem abriu (com horário) e quem ainda não abriu, uma linha por responsável (mesmo com vários filhos). */
export function separarAbertura(publico: { guardian: Pessoa }[], leituras: { userId: string; lidoEm: Date }[]) {
  const horario = new Map(leituras.map((l) => [l.userId, l.lidoEm]));
  const vistos = new Set<string>();
  const abriram: { guardian: Pessoa; lidoEm: Date }[] = [];
  const naoAbriram: Pessoa[] = [];
  for (const { guardian } of publico) {
    if (vistos.has(guardian.id)) continue;
    vistos.add(guardian.id);
    const lidoEm = horario.get(guardian.id);
    if (lidoEm) abriram.push({ guardian: { id: guardian.id, name: guardian.name }, lidoEm });
    else naoAbriram.push({ id: guardian.id, name: guardian.name });
  }
  abriram.sort((a, b) => a.lidoEm.getTime() - b.lidoEm.getTime());
  naoAbriram.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { abriram, naoAbriram };
}
