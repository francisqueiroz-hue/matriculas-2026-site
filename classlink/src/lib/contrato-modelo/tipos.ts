// Tipos e regras puras do contrato gerado pelo app (sem dependências de servidor: usados
// também nas telas para validar e mostrar valores antes do envio).

export type PeriodoChave = "INTEGRAL" | "SEMI_INTEGRAL" | "PARCIAL" | "ESCOLAR";
export type Etapa = "EI" | "EF1";

export const MODELO_CONTRATO_2027 = "ESPACO_KIDS_2027";

/** Vencimento das mensalidades: sempre dia 05 de cada mês (decisão da direção, out/2026). */
export const DIA_VENCIMENTO_MENSALIDADE = 5;

/** 5 → "05" */
export function diaDoMes(dia: number): string {
  return String(dia).padStart(2, "0");
}

/**
 * Configuração com o vencimento fixo no dia 05, inclusive nas datas escritas em "Primeiro e
 * último vencimento" ("10/01/2027 a 10/12/2027" → "05/01/2027 a 05/12/2027").
 */
export function comVencimentoFixo<T extends ConfigContrato>(c: T): T {
  const dia = diaDoMes(DIA_VENCIMENTO_MENSALIDADE);
  return {
    ...c,
    parcelas: {
      ...c.parcelas,
      vencimentoDia: DIA_VENCIMENTO_MENSALIDADE,
      primeiroUltimo: c.parcelas.primeiroUltimo.replace(/\b\d{1,2}(\/\d{1,2}\/\d{2,4})\b/g, `${dia}$1`),
    },
  };
}

export interface PeriodoConfig {
  chave: PeriodoChave;
  nome: string;
  horario: string;
  /** Parcela cheia (sem desconto de pontualidade). */
  parcelaBruta: number;
  /** Parcela paga até o vencimento (com desconto de pontualidade). */
  parcelaLiquida: number;
}

/** Configuração do contrato da escola para um ano letivo (preenchida pela direção no painel). */
export interface ConfigContrato {
  escola: {
    endereco: string; // ex.: "Rua Professor Carlos Nelson Ferreira dos Santos, nº 658 - Camboinhas - Niterói - RJ"
    cep: string;
    telefones: string;
    email: string;
    representanteLegal: string;
    canalPrivacidade: string;
    avisoPrivacidade: string;
    portalAluno: string;
    siteEscola: string;
    redesSociais: string;
  };
  periodos: PeriodoConfig[];
  parcelas: {
    quantidade: number;
    vencimentoDia: number;
    primeiroUltimo: string; // ex.: "10/02/2027 a 10/12/2027"
    periodoAnuidade: string; // ex.: "fevereiro a dezembro de 2027"
  };
  horaExcedente: { valor: number; unidade: string; fracionamento: string; tolerancia: string };
}

/** Condições fixadas no envio de cada contrato (cópia da configuração naquele momento). */
export interface CondicoesContrato {
  modelo: typeof MODELO_CONTRATO_2027;
  anoLetivo: number;
  etapa: Etapa;
  turma: string;
  /** null = não informado no envio (sai em branco para a família marcar). */
  periodo: PeriodoChave | null;
  /** 0 = sem valor no contrato (os valores são combinados por mensagem; sai linha em branco). */
  parcelaBruta: number;
  parcelaLiquida: number;
  config: ConfigContrato;
  /** Valor da renovação calculado a partir da mensalidade atual do aluno; ausente = tabela do período. */
  reajuste?: ReajusteContrato | null;
  /** Aluno isento de mensalidade (bolsa integral): o contrato sai sem parcelas, com a isenção escrita. */
  bolsista?: boolean;
}

/** A mensalidade cadastrada do aluno é a parcela paga até o vencimento ou a parcela cheia. */
export type BaseReajuste = "LIQUIDA" | "BRUTA";
export type Arredondamento = "CENTAVOS" | "REAIS";

/** Critério de correção escolhido pela direção no envio (nada é presumido pelo app). */
export interface CriterioReajuste {
  /** Percentual de correção sobre a mensalidade atual, ex.: 6.5 = 6,5%. */
  percentual: number;
  base: BaseReajuste;
  /** Desconto de pontualidade do novo contrato, ex.: 10 = 10%. 0 = sem desconto. */
  descontoPct: number;
  arredondamento: Arredondamento;
}

/** Registro guardado no contrato: de onde saiu o valor da renovação. */
export interface ReajusteContrato {
  valorAnterior: number;
  percentual: number;
  base: BaseReajuste;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Valor corrigido da renovação a partir da mensalidade atual (Lei 9.870/1999, art. 1º, § 1º:
 * a base é a última parcela do ano anterior). O percentual corrige a parcela informada como
 * base; a outra parcela sai do desconto de pontualidade. Arredondar para reais muda a parcela
 * corrigida em no máximo R$ 0,50.
 */
export function valoresComReajuste(valorAtual: number, c: CriterioReajuste): { parcelaBruta: number; parcelaLiquida: number } | null {
  if (!(valorAtual > 0) || !Number.isFinite(c.percentual) || !(c.descontoPct >= 0 && c.descontoPct < 100)) return null;
  const corrigido = valorAtual * (1 + c.percentual / 100);
  const base = c.arredondamento === "REAIS" ? Math.round(corrigido) : centavos(corrigido);
  if (!(base > 0)) return null;
  const fator = 1 - c.descontoPct / 100;
  return c.base === "LIQUIDA"
    ? { parcelaLiquida: base, parcelaBruta: centavos(base / fator) }
    : { parcelaBruta: base, parcelaLiquida: centavos(base * fator) };
}

/** Percentual efetivo entre o valor anterior e o novo, para mostrar à família (ex.: 6.5). */
export function percentualEfetivo(anterior: number, novo: number): number {
  return anterior > 0 ? Math.round((novo / anterior - 1) * 10000) / 100 : 0;
}

export interface Pessoa {
  nome: string;
  cpf: string;
  nascimento: string; // dd/mm/aaaa
  rg: string;
  orgao: string;
  uf: string;
  endereco: string;
  numero: string;
  complemento: string;
  cep: string;
  bairro: string;
  cidade: string;
  email: string;
  telefone: string;
}

export type EscolhaImagem = "AUTORIZO" | "NAO_AUTORIZO";

/** Dados preenchidos pela família no app antes de gerar o contrato. */
export interface DadosFamilia {
  financeiro: Pessoa;
  pedagogicoMesmo: boolean;
  pedagogico: Pessoa | null;
  aluno: {
    nascimento: string;
    rg: string;
    orgao: string;
    uf: string;
    enderecoMesmo: boolean;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    cep: string;
  };
  /** Quem detém a guarda/representação legal do aluno. */
  responsavelLegal: { quem: "FINANCEIRO" | "PEDAGOGICO" | "OUTRO"; nome: string; cpf: string; vinculo: string; contato: string };
  /** Anexo I — uma escolha por linha, na ordem do termo. */
  imagem: EscolhaImagem[];
}

export const PERIODO_PADRAO: PeriodoConfig[] = [
  { chave: "INTEGRAL", nome: "Integral", horario: "07:00 às 19:00", parcelaBruta: 0, parcelaLiquida: 0 },
  { chave: "SEMI_INTEGRAL", nome: "Semi-integral", horario: "08:00 às 17:00 ou 10:00 às 19:00", parcelaBruta: 0, parcelaLiquida: 0 },
  { chave: "PARCIAL", nome: "Parcial (sem bilíngue)", horario: "07:00 às 13:00; 11:00 às 17:00; 13:00 às 19:00", parcelaBruta: 0, parcelaLiquida: 0 },
  { chave: "ESCOLAR", nome: "Escolar", horario: "08:00 às 12:00; 13:00 às 17:00; 13:00 às 17:30 (fundamental I)", parcelaBruta: 0, parcelaLiquida: 0 },
];

/** Ponto de partida da configuração: horários e contatos do contrato original; valores em branco. */
export function configInicial(): ConfigContrato {
  return {
    escola: {
      endereco: "Rua Professor Carlos Nelson Ferreira dos Santos, nº 658 - Camboinhas - Niterói - RJ",
      cep: "24.358-705",
      telefones: "(21) 3492-2852 / 96469-9441",
      email: "secretaria@institutofokus.com.br",
      representanteLegal: "",
      canalPrivacidade: "",
      avisoPrivacidade: "",
      portalAluno: "",
      siteEscola: "",
      redesSociais: "",
    },
    periodos: PERIODO_PADRAO.map((p) => ({ ...p })),
    parcelas: { quantidade: 12, vencimentoDia: DIA_VENCIMENTO_MENSALIDADE, primeiroUltimo: "", periodoAnuidade: "" },
    horaExcedente: { valor: 0, unidade: "", fracionamento: "", tolerancia: "" },
  };
}

const ROTULOS_ESCOLA: Record<keyof ConfigContrato["escola"], string> = {
  endereco: "Endereço da escola",
  cep: "CEP da escola",
  telefones: "Telefones",
  email: "E-mail da secretaria",
  representanteLegal: "Representante legal da escola",
  canalPrivacidade: "Canal de privacidade",
  avisoPrivacidade: "Onde está o aviso de privacidade",
  portalAluno: "Portal do aluno",
  siteEscola: "Site da escola",
  redesSociais: "Redes sociais (perfis)",
};

/**
 * Campos da configuração ainda em branco. Não bloqueiam o envio: saem no contrato como linha
 * para a família preencher à mão. Inconsistências (ex.: parcela com desconto maior que a cheia)
 * também aparecem aqui.
 */
export function pendenciasConfig(c: ConfigContrato): string[] {
  const falta: string[] = [];
  for (const [k, rotulo] of Object.entries(ROTULOS_ESCOLA) as [keyof ConfigContrato["escola"], string][]) {
    if (!c.escola[k]?.trim()) falta.push(rotulo);
  }
  for (const p of c.periodos) {
    if (!(p.parcelaBruta > 0)) falta.push(`Parcela cheia — ${p.nome}`);
    if (!(p.parcelaLiquida > 0)) falta.push(`Parcela até o vencimento — ${p.nome}`);
    if (p.parcelaLiquida > p.parcelaBruta) falta.push(`${p.nome}: parcela até o vencimento maior que a cheia`);
    if (!p.horario.trim()) falta.push(`Horário — ${p.nome}`);
  }
  if (!(c.parcelas.quantidade >= 1)) falta.push("Número de parcelas");
  if (!(c.parcelas.vencimentoDia >= 1 && c.parcelas.vencimentoDia <= 31)) falta.push("Dia do vencimento");
  if (!c.parcelas.primeiroUltimo.trim()) falta.push("Primeiro/último vencimento");
  if (!c.parcelas.periodoAnuidade.trim()) falta.push("Período da anuidade");
  if (!(c.horaExcedente.valor > 0)) falta.push("Valor da hora excedente");
  if (!c.horaExcedente.unidade.trim()) falta.push("Unidade da hora excedente");
  if (!c.horaExcedente.fracionamento.trim()) falta.push("Fracionamento da hora excedente");
  if (!c.horaExcedente.tolerancia.trim()) falta.push("Tolerância da hora excedente");
  return falta;
}

/** 4007 → "4.007,00" */
export function formatarDinheiro(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Valores derivados do quadro de valores do contrato. */
export function calcularValores(cond: Pick<CondicoesContrato, "parcelaBruta" | "parcelaLiquida"> & { quantidade: number }) {
  const anuidade = Math.round(cond.parcelaBruta * cond.quantidade * 100) / 100;
  const descontoValor = Math.round((cond.parcelaBruta - cond.parcelaLiquida) * 100) / 100;
  const descontoPct = cond.parcelaBruta > 0 ? Math.round((descontoValor / cond.parcelaBruta) * 10000) / 100 : 0;
  return { anuidade, descontoValor, descontoPct, primeiraParcela: cond.parcelaBruta };
}

/** Educação infantil x fundamental I, deduzido do nome da turma ("3º Ano A" → EF1). */
export function etapaPelaTurma(turma: string): Etapa {
  return /\b(\d+\s*º?\s*ano|ano)\b/i.test(turma) ? "EF1" : "EI";
}

/** Confere os dígitos verificadores do CPF. */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, peso: number) => {
    let soma = 0;
    for (const n of base) soma += Number(n) * peso--;
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

export function formatarCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

/** dd/mm/aaaa válido e no passado. */
export function dataNascimentoValida(texto: string, hoje = new Date()): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return false;
  const [dd, mm, aaaa] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(aaaa, mm - 1, dd);
  return d.getFullYear() === aaaa && d.getMonth() === mm - 1 && d.getDate() === dd && d < hoje && aaaa > 1900;
}

/** Linhas do Anexo I, na ordem do termo. */
export const LINHAS_ANEXO_IMAGEM = [
  "Fotografias em portal/ambiente fechado de famílias da turma, para comunicação pedagógica.",
  "Imagem e voz em vídeos no ambiente fechado acima, para comunicação pedagógica.",
  "Imagem e voz no site institucional público, para apresentar atividades escolares.",
  "Imagem e voz em redes sociais públicas institucionais, para apresentar atividades.",
  "Imagem em materiais impressos institucionais destinados à comunidade escolar e famílias interessadas.",
  "Reprodução de trabalho artístico/literário do aluno nos canais autorizados acima, com licença não exclusiva, sem cessão de direitos autorais.",
] as const;

/** Valores do contrato para mostrar nas listas (sem expor o resto das condições). */
export interface ValoresContrato {
  parcelas: number;
  vencimentoDia: number;
  parcelaBruta: number;
  parcelaLiquida: number;
  anuidade: number;
  reajuste: ReajusteContrato | null;
  bolsista: boolean;
}

/** Lê as condições guardadas no contrato; null quando o contrato saiu sem valores (nem isenção). */
export function valoresDoContrato(condicoes: unknown): ValoresContrato | null {
  const c = condicoes as Partial<CondicoesContrato> | null;
  if (!c || !c.config?.parcelas) return null;
  if (c.bolsista) {
    const { quantidade, vencimentoDia } = c.config.parcelas;
    return { parcelas: quantidade, vencimentoDia, parcelaBruta: 0, parcelaLiquida: 0, anuidade: 0, reajuste: null, bolsista: true };
  }
  if (!(Number(c.parcelaBruta) > 0)) return null;
  const quantidade = c.config.parcelas.quantidade;
  const r = c.reajuste;
  return {
    parcelas: quantidade,
    vencimentoDia: c.config.parcelas.vencimentoDia,
    parcelaBruta: Number(c.parcelaBruta),
    parcelaLiquida: Number(c.parcelaLiquida),
    anuidade: calcularValores({ parcelaBruta: Number(c.parcelaBruta), parcelaLiquida: Number(c.parcelaLiquida), quantidade }).anuidade,
    reajuste: r && r.valorAnterior > 0 ? { valorAnterior: r.valorAnterior, percentual: r.percentual, base: r.base } : null,
    bolsista: false,
  };
}
