import { prisma } from "@/lib/prisma";
import type { Politica } from "@/lib/limite-login";

export type Contagem = {
  /** Quantas tentativas já valem na janela, contando esta. */
  falhas: number;
  /** Quando o bloqueio acaba (só existe depois de passar do máximo). */
  bloqueadoAte: Date | null;
  /** true quando esta tentativa passou do máximo e deve ser recusada. */
  bloqueado: boolean;
  /** Segundos até poder tentar de novo (0 se não bloqueado). */
  segundos: number;
};

function ehConflitoDeChave(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/**
 * Soma UMA tentativa na chave de forma atômica e diz se ela passou do limite.
 *
 * O incremento é feito pelo banco (`falhas = falhas + 1`), então requisições simultâneas
 * recebem contagens diferentes (1, 2, 3, ...). Chame ANTES de conferir a senha: só quem
 * ficar dentro do máximo chega a testar uma senha, e uma rajada paralela não escapa do limite.
 */
export async function contarTentativa(chave: string, politica: Politica, agora = new Date()): Promise<Contagem> {
  const limiteJanela = new Date(agora.getTime() - politica.janelaMs);

  // Zera registro vencido (bloqueio acabou ou janela expirou). É condicional no banco:
  // se outra requisição já atualizou o registro nesse meio tempo, nada é apagado.
  await prisma.loginTentativa.deleteMany({
    where: { chave, OR: [{ bloqueadoAte: { lte: agora } }, { primeiraFalhaEm: { lt: limiteJanela } }] },
  });

  const alvo = {
    where: { chave },
    create: { chave, falhas: 1, primeiraFalhaEm: agora, bloqueadoAte: null },
    update: { falhas: { increment: 1 } },
  };
  let registro;
  try {
    registro = await prisma.loginTentativa.upsert(alvo);
  } catch (err) {
    // Duas primeiras tentativas simultâneas tentando criar a mesma chave: a perdedora só incrementa.
    if (!ehConflitoDeChave(err)) throw err;
    registro = await prisma.loginTentativa.upsert(alvo);
  }

  let bloqueadoAte = registro.bloqueadoAte;
  if (registro.falhas > politica.max && !bloqueadoAte) {
    bloqueadoAte = new Date(agora.getTime() + politica.bloqueioMs);
    await prisma.loginTentativa.updateMany({ where: { chave, bloqueadoAte: null }, data: { bloqueadoAte } });
  }

  const bloqueado = registro.falhas > politica.max;
  const segundos = bloqueado ? Math.max(1, Math.ceil(((bloqueadoAte ?? agora).getTime() - agora.getTime()) / 1000)) : 0;
  return { falhas: registro.falhas, bloqueadoAte, bloqueado, segundos };
}

/** Só consulta: a chave está bloqueada agora? (não conta tentativa). */
export async function estaBloqueada(chave: string, agora = new Date()): Promise<{ bloqueado: false } | { bloqueado: true; segundos: number }> {
  const registro = await prisma.loginTentativa.findUnique({ where: { chave } });
  if (!registro?.bloqueadoAte || registro.bloqueadoAte.getTime() <= agora.getTime()) return { bloqueado: false };
  return { bloqueado: true, segundos: Math.max(1, Math.ceil((registro.bloqueadoAte.getTime() - agora.getTime()) / 1000)) };
}

/** O limitador nunca pode derrubar o login: se a tabela falhar (ex.: migração pendente), registra e segue liberado. */
export async function contarTentativaSemFalhar(chave: string, politica: Politica, agora = new Date()): Promise<Contagem> {
  try {
    return await contarTentativa(chave, politica, agora);
  } catch (e) {
    console.error("limite-tentativas: contagem falhou", e);
    return { falhas: 0, bloqueadoAte: null, bloqueado: false, segundos: 0 };
  }
}
