// Tipos e regras puras do contrato gerado pelo app (sem dependências de servidor: usados
// também nas telas para validar e mostrar valores antes do envio).

export type PeriodoChave = "INTEGRAL" | "SEMI_INTEGRAL" | "PARCIAL" | "ESCOLAR";
export type Etapa = "EI" | "EF1";

export const MODELO_CONTRATO_2027 = "ESPACO_KIDS_2027";

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
  periodo: PeriodoChave;
  parcelaBruta: number;
  parcelaLiquida: number;
  config: ConfigContrato;
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
    parcelas: { quantidade: 12, vencimentoDia: 10, primeiroUltimo: "", periodoAnuidade: "" },
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

/** Lista do que falta na configuração para poder enviar contratos (vazia = pronta). */
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
