import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/session";
import {
  MENSAGEM_AREA_DESATIVADA,
  areaLiberada,
  areasBloqueadasPara,
  chaveEscolha,
  ehArea,
  ehPapel,
  papelVisibilidade,
  type AreaVisibilidade,
  type PapelVisibilidade,
} from "@/lib/visibilidade";

type SessaoMinima = { sub: string; role: string; schoolId: string };

/** Colunas cujas escolhas valem para o perfil (auxiliares herdam a antiga coluna "Professores e auxiliares"). */
function papeisConsultados(papel: PapelVisibilidade): PapelVisibilidade[] {
  return papel === "AUXILIARES" ? ["AUXILIARES", "PROFESSORES"] : [papel];
}

/** Escolhas salvas pela direção para a escola (linhas inválidas são ignoradas: valem os padrões). */
export async function escolhasDaEscola(schoolId: string, papel?: PapelVisibilidade): Promise<Map<string, boolean>> {
  const linhas = await prisma.visibilidadeArea.findMany({
    where: { schoolId, ...(papel ? { papel: { in: papeisConsultados(papel) } } : {}) },
    select: { area: true, papel: true, liberado: true },
  });
  const escolhas = new Map<string, boolean>();
  for (const l of linhas) {
    if (ehArea(l.area) && ehPapel(l.papel)) escolhas.set(chaveEscolha(l.area, l.papel), l.liberado);
  }
  return escolhas;
}

/**
 * Perfil da sessão na tabela de visibilidade. Para a equipe, a coordenação é lida do banco a
 * cada pedido (não fica no token), então tirar a função vale na hora.
 */
export async function papelDaSessao(session: SessaoMinima): Promise<PapelVisibilidade | null> {
  if (session.role !== "STAFF") return papelVisibilidade(session);
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { isCoordenacao: true, funcao: true } });
  return papelVisibilidade({ role: "STAFF", isCoordenacao: user?.isCoordenacao ?? false, funcao: user?.funcao ?? null });
}

/**
 * Bloqueia no servidor o acesso a uma área desligada pela direção para o perfil da sessão.
 * A direção (ADMIN) não passa por aqui: o que ela vê é decidido pelas regras da própria rota.
 * Lança AuthError 403, que `handleApiError` devolve como { error } para a tela.
 */
export async function exigirArea(session: SessaoMinima, area: AreaVisibilidade): Promise<void> {
  if (session.role === "ADMIN") return;
  const papel = await papelDaSessao(session);
  if (!papel) throw new AuthError(MENSAGEM_AREA_DESATIVADA, 403);
  const escolhas = new Map<string, boolean>();
  for (const p of papeisConsultados(papel)) {
    const linha = await prisma.visibilidadeArea.findUnique({
      where: { schoolId_area_papel: { schoolId: session.schoolId, area, papel: p } },
      select: { liberado: true },
    });
    if (linha) escolhas.set(chaveEscolha(area, p), linha.liberado);
  }
  if (!areaLiberada(area, papel, escolhas)) throw new AuthError(MENSAGEM_AREA_DESATIVADA, 403);
}

/** Áreas que a pessoa não pode ver, para o menu e as telas (calculado no servidor, no layout). */
export async function areasBloqueadasDoUsuario(user: {
  role: string;
  isCoordenacao: boolean;
  funcao?: string | null;
  schoolId: string;
}): Promise<AreaVisibilidade[]> {
  const papel = papelVisibilidade(user);
  if (!papel) return [];
  return areasBloqueadasPara(papel, await escolhasDaEscola(user.schoolId, papel));
}
