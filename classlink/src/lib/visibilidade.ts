/**
 * Visibilidade por perfil: o que coordenação, professores e famílias podem ver no app.
 *
 * Só a direção muda isso (tela Configurações). Regras de segurança:
 * - O teto é o próprio código: a tela só desliga o que o perfil já podia ver, ou religa o que
 *   a direção desligou. Nada que o sistema não libera (ex.: financeiro da escola para a equipe)
 *   pode ser liberado aqui: essas células são "fixas".
 * - Área ou perfil fora desta lista = negado.
 * - Liberar uma área marcada como sensível pede confirmação (na tela e no servidor).
 * - A checagem vale no servidor (`exigirArea` em visibilidade-server.ts); esconder o item do
 *   menu é só conforto.
 *
 * Este arquivo não acessa o banco: é usado também no navegador (menu e tela de Configurações).
 */

export const PAPEIS_VISIBILIDADE = ["COORDENACAO", "PROFESSORES", "FAMILIAS"] as const;
export type PapelVisibilidade = (typeof PAPEIS_VISIBILIDADE)[number];

export const NOME_PAPEL: Record<PapelVisibilidade, string> = {
  COORDENACAO: "Coordenação",
  PROFESSORES: "Professores e auxiliares",
  FAMILIAS: "Famílias",
};

export const AREAS_VISIBILIDADE = [
  "MURAL",
  "COMUNICADOS",
  "ENQUETES",
  "MENSAGENS",
  "AGENDA",
  "CARDAPIO",
  "FREQUENCIA",
  "NOTAS",
  "FINANCEIRO",
  "CONTRATOS",
  "FICHAS",
  "CONSULTA_ALUNOS",
  "ROTINA",
] as const;
export type AreaVisibilidade = (typeof AREAS_VISIBILIDADE)[number];

export type Celula =
  /** A direção liga e desliga. `padrao` é o que vale enquanto ninguém mexeu (o comportamento atual). */
  | { tipo: "configuravel"; padrao: boolean; sensivel: boolean }
  /** Nunca liberado para este perfil, qualquer que seja a configuração. */
  | { tipo: "fixo"; motivo: string };

export interface DefinicaoArea {
  id: AreaVisibilidade;
  nome: string;
  /** O que a área mostra, em linguagem simples (aparece na tela de Configurações). */
  descricao: string;
  /** Telas do app que pertencem à área (o menu esconde e a tela mostra o aviso). */
  telas: string[];
  celulas: Record<PapelVisibilidade, Celula>;
}

const livre = (padrao = true): Celula => ({ tipo: "configuravel", padrao, sensivel: false });
const sensivel = (padrao = true): Celula => ({ tipo: "configuravel", padrao, sensivel: true });
const fixo = (motivo: string): Celula => ({ tipo: "fixo", motivo });

const SO_DIRECAO = "Só a direção";
const NAO_SE_APLICA = "Não se aplica";

export const DEFINICOES_AREAS: DefinicaoArea[] = [
  {
    id: "MURAL",
    nome: "Mural",
    descricao: "Fotos e recados da escola e da turma.",
    telas: ["/dashboard/mural"],
    celulas: { COORDENACAO: livre(), PROFESSORES: livre(), FAMILIAS: livre() },
  },
  {
    id: "COMUNICADOS",
    nome: "Comunicados",
    descricao: "Comunicados, circulares e autorizações com resposta.",
    telas: ["/dashboard/comunicados"],
    celulas: { COORDENACAO: livre(), PROFESSORES: livre(), FAMILIAS: livre() },
  },
  {
    id: "ENQUETES",
    nome: "Enquetes",
    descricao: "Enquetes e seus resultados.",
    telas: ["/dashboard/enquetes"],
    celulas: { COORDENACAO: livre(), PROFESSORES: livre(), FAMILIAS: livre() },
  },
  {
    id: "MENSAGENS",
    nome: "Mensagens",
    descricao: "Conversas entre a escola e as famílias, e da equipe entre si.",
    telas: ["/dashboard/mensagens"],
    celulas: { COORDENACAO: livre(), PROFESSORES: livre(), FAMILIAS: livre() },
  },
  {
    id: "AGENDA",
    nome: "Agenda",
    descricao: "Eventos e datas da escola e da turma.",
    telas: ["/dashboard/agenda"],
    celulas: { COORDENACAO: livre(), PROFESSORES: livre(), FAMILIAS: livre() },
  },
  {
    id: "CARDAPIO",
    nome: "Cardápio",
    descricao: "Cardápio da semana.",
    telas: ["/dashboard/cardapio"],
    celulas: { COORDENACAO: livre(), PROFESSORES: livre(), FAMILIAS: livre() },
  },
  {
    id: "FREQUENCIA",
    nome: "Frequência",
    descricao: "Presenças e faltas dos alunos.",
    telas: ["/dashboard/frequencia"],
    celulas: { COORDENACAO: livre(), PROFESSORES: livre(), FAMILIAS: sensivel() },
  },
  {
    id: "NOTAS",
    nome: "Notas e boletim",
    descricao: "Coordenação lança as notas; a família vê o boletim do filho.",
    telas: ["/dashboard/notas", "/dashboard/boletim"],
    celulas: {
      COORDENACAO: sensivel(),
      PROFESSORES: fixo("Só direção e coordenação"),
      FAMILIAS: sensivel(),
    },
  },
  {
    id: "FINANCEIRO",
    nome: "Financeiro e boletos",
    descricao: "A família vê só os próprios boletos. Valores da escola ficam sempre só com a direção.",
    telas: ["/dashboard/financeiro"],
    celulas: { COORDENACAO: fixo(SO_DIRECAO), PROFESSORES: fixo(SO_DIRECAO), FAMILIAS: sensivel() },
  },
  {
    id: "CONTRATOS",
    nome: "Contratos",
    descricao: "A família vê e assina só o próprio contrato. Os contratos da escola ficam sempre só com a direção.",
    telas: ["/dashboard/contratos"],
    celulas: { COORDENACAO: fixo(SO_DIRECAO), PROFESSORES: fixo(SO_DIRECAO), FAMILIAS: sensivel() },
  },
  {
    id: "FICHAS",
    nome: "Fichas de matrícula",
    descricao: "Documentos entregues, autorizações (LGPD) e dados da matrícula de cada aluno.",
    telas: ["/dashboard/fichas"],
    celulas: { COORDENACAO: sensivel(), PROFESSORES: sensivel(), FAMILIAS: fixo(NAO_SE_APLICA) },
  },
  {
    id: "CONSULTA_ALUNOS",
    nome: "Consulta de alunos",
    descricao: "Busca de aluno com turma, idade e telefone dos responsáveis (emergência).",
    telas: ["/dashboard/alunos"],
    celulas: {
      COORDENACAO: sensivel(),
      PROFESSORES: fixo("Só direção e coordenação"),
      FAMILIAS: fixo(NAO_SE_APLICA),
    },
  },
  {
    id: "ROTINA",
    nome: "Rotina diária",
    descricao: "Alimentação, sono, evacuação, banho e medicação do dia. Direção e secretaria preenchem; a família vê a do próprio filho.",
    telas: ["/dashboard/rotina"],
    celulas: {
      COORDENACAO: fixo("Só direção e secretaria"),
      PROFESSORES: fixo("Só direção e secretaria"),
      FAMILIAS: sensivel(),
    },
  },
];

const POR_ID = new Map(DEFINICOES_AREAS.map((d) => [d.id, d]));

export function definicaoDaArea(area: AreaVisibilidade): DefinicaoArea {
  const def = POR_ID.get(area);
  if (!def) throw new Error(`Área de visibilidade desconhecida: ${area}`);
  return def;
}

export function ehArea(valor: unknown): valor is AreaVisibilidade {
  return typeof valor === "string" && POR_ID.has(valor as AreaVisibilidade);
}

export function ehPapel(valor: unknown): valor is PapelVisibilidade {
  return typeof valor === "string" && (PAPEIS_VISIBILIDADE as readonly string[]).includes(valor);
}

/** Perfil da pessoa na tabela de visibilidade. Direção (ADMIN) não entra: null = sem restrição daqui. */
export function papelVisibilidade(user: { role: string; isCoordenacao?: boolean | null }): PapelVisibilidade | null {
  if (user.role === "GUARDIAN") return "FAMILIAS";
  if (user.role === "STAFF") return user.isCoordenacao ? "COORDENACAO" : "PROFESSORES";
  return null;
}

/** Escolhas salvas pela direção: chave `AREA:PAPEL` → liberado. O que não estiver aqui usa o padrão. */
export type EscolhasVisibilidade = ReadonlyMap<string, boolean>;

export function chaveEscolha(area: AreaVisibilidade, papel: PapelVisibilidade): string {
  return `${area}:${papel}`;
}

/**
 * A área está liberada para o perfil? Célula fixa → nunca. Configurável → a escolha salva ou,
 * sem escolha, o padrão. Área desconhecida → nunca (padrão seguro).
 */
export function areaLiberada(area: AreaVisibilidade, papel: PapelVisibilidade, escolhas: EscolhasVisibilidade): boolean {
  const def = POR_ID.get(area);
  if (!def) return false;
  const celula = def.celulas[papel];
  if (!celula || celula.tipo === "fixo") return false;
  return escolhas.get(chaveEscolha(area, papel)) ?? celula.padrao;
}

/** Áreas que o perfil NÃO pode ver (usado para esconder itens do menu e as telas). */
export function areasBloqueadasPara(papel: PapelVisibilidade | null, escolhas: EscolhasVisibilidade): AreaVisibilidade[] {
  if (!papel) return [];
  return DEFINICOES_AREAS.filter((d) => !areaLiberada(d.id, papel, escolhas)).map((d) => d.id);
}

/** Área da tela (pelo caminho), ou null se a tela não pertence a nenhuma área configurável. */
export function areaDaTela(pathname: string): AreaVisibilidade | null {
  for (const def of DEFINICOES_AREAS) {
    if (def.telas.some((t) => pathname === t || pathname.startsWith(`${t}/`))) return def.id;
  }
  return null;
}

/** Tela bloqueada para quem tem estas áreas bloqueadas? */
export function telaBloqueada(pathname: string, bloqueadas: readonly string[] | undefined): boolean {
  if (!bloqueadas || bloqueadas.length === 0) return false;
  const area = areaDaTela(pathname);
  return area !== null && bloqueadas.includes(area);
}

export const MENSAGEM_AREA_DESATIVADA = "Esta área foi desativada pela direção da escola.";

/** Frase do histórico: "desligou Fichas de matrícula para Professores e auxiliares". */
export function descreverMudanca(area: AreaVisibilidade, papel: PapelVisibilidade, liberado: boolean): string {
  return `${liberado ? "liberou" : "desligou"} ${definicaoDaArea(area).nome} para ${NOME_PAPEL[papel]}`;
}
