// Planilha Excel da aba Contratos (só a direção): a listagem dos contratos e a aba
// "Mensalidades <ano>" com o valor de cada parcela já corrigido. Sem dependências de servidor.
import { METODO_LABEL, STATUS_CONTRATO_LABEL, type ContratoMetodo, type ContratoStatus } from "./contratos";
import type { SituacaoValor } from "./contrato-modelo/conferencia";
import { DIA_VENCIMENTO_MENSALIDADE, etapaPelaTurma, type ValoresContrato } from "./contrato-modelo/tipos";
import { gerarXlsx, letraColuna, type Celula, type Planilha } from "./xlsx";

export interface ContratoParaPlanilha {
  titulo: string;
  anoLetivo: number;
  status: ContratoStatus;
  metodoAssinatura: ContratoMetodo | null;
  assinadoEnviadoEm: string | null;
  confirmadoPelaEscola: boolean;
  modelo: string | null;
  dadosPreenchidos: boolean;
  valores: ValoresContrato | null;
  conferencia: { situacao: SituacaoValor; rotulo: string; valorContrato: number; valorEsperado: number | null; assinado: boolean } | null;
  createdAt: string;
  student: {
    name: string;
    class: { name: string };
    guardians: { relation: string | null; guardian: { name: string; phone: string | null } }[];
  };
}

export interface MensalidadeAno {
  /** Valor de cada parcela a cobrar no ano; null = sem valor definido (ver observação). */
  parcela: number | null;
  /** Quantidade de parcelas do contrato (12 quando o contrato não informa). */
  parcelas: number;
  isento: boolean;
  /** "Contrato", "Corrigido (cadastro)" ou "—". */
  origem: string;
  observacao: string;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const centavos = (v: number) => Math.round(v * 100) / 100;

function brl(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Valor da mensalidade do ano para a planilha, com a correção aplicada:
 * - contrato com o valor corrigido (ou ajustado à mão no envio): vale o valor do contrato;
 * - contrato em branco ou com valor diferente, ainda não assinado: vale o valor corrigido
 *   (mensalidade cadastrada + reajuste), que é o que o contrato vai ter ao ser atualizado;
 * - contrato já assinado com valor diferente: vale o que foi assinado, com aviso de aditivo;
 * - bolsista: isento.
 */
export function mensalidadeDoContrato(c: ContratoParaPlanilha): MensalidadeAno {
  const parcelas = c.valores?.parcelas && c.valores.parcelas > 0 ? c.valores.parcelas : 12;
  const conf = c.conferencia;
  const valorContrato = c.valores && !c.valores.bolsista && c.valores.parcelaBruta > 0 ? c.valores.parcelaBruta : 0;

  if (c.valores?.bolsista || (conf && conf.valorEsperado === 0 && conf.situacao === "OK")) {
    return { parcela: 0, parcelas, isento: true, origem: "Contrato", observacao: "Isento de mensalidade (bolsista)" };
  }
  if (!conf) {
    if (valorContrato > 0) return { parcela: valorContrato, parcelas, isento: false, origem: "Contrato", observacao: "" };
    return {
      parcela: null,
      parcelas,
      isento: false,
      origem: "—",
      observacao: c.modelo ? "Contrato sem valor de parcela" : "Contrato em PDF próprio: o app não lê o valor. Preencher à mão.",
    };
  }

  switch (conf.situacao) {
    case "OK":
      return { parcela: conf.valorContrato, parcelas, isento: false, origem: "Contrato", observacao: "" };
    case "AJUSTADO":
      return {
        parcela: conf.valorContrato,
        parcelas,
        isento: false,
        origem: "Contrato",
        observacao: `Valor ajustado à mão no envio (corrigido pelo cadastro seria ${brl(conf.valorEsperado ?? 0)})`,
      };
    case "SEM_MENSALIDADE":
      return conf.valorContrato > 0
        ? { parcela: conf.valorContrato, parcelas, isento: false, origem: "Contrato", observacao: "Aluno sem mensalidade no cadastro: conferir" }
        : { parcela: null, parcelas, isento: false, origem: "—", observacao: "Aluno sem mensalidade no cadastro: preencher o cadastro" };
    case "SEM_VALOR":
    case "VALOR_DIFERENTE": {
      const esperado = conf.valorEsperado;
      if (conf.assinado && conf.valorContrato > 0) {
        return {
          parcela: conf.valorContrato,
          parcelas,
          isento: false,
          origem: "Contrato",
          observacao: `Assinado com valor diferente do corrigido (${brl(esperado ?? 0)}): cobrar o corrigido exige aditivo`,
        };
      }
      if (esperado && esperado > 0) {
        return {
          parcela: esperado,
          parcelas,
          isento: false,
          origem: "Corrigido (cadastro)",
          observacao: conf.assinado
            ? "Assinado sem valor no contrato: valor corrigido pelo cadastro; formalizar por aditivo"
            : `Contrato ${conf.situacao === "SEM_VALOR" ? "sem valor" : `com ${brl(conf.valorContrato)}`}: corrigido pelo cadastro. Atualizar o contrato no app`,
        };
      }
      return { parcela: null, parcelas, isento: false, origem: "—", observacao: conf.rotulo };
    }
  }
}

function dataBr(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function responsaveis(c: ContratoParaPlanilha): { nomes: string; telefones: string } {
  const g = c.student.guardians;
  return {
    nomes: g.map((x) => (x.relation ? `${x.guardian.name} (${x.relation})` : x.guardian.name)).join("; "),
    telefones: g.map((x) => x.guardian.phone ?? "").filter(Boolean).join("; "),
  };
}

const ETAPA: Record<string, string> = { EI: "Educação Infantil", EF1: "Fundamental I" };

function ordenar(contratos: ContratoParaPlanilha[]): ContratoParaPlanilha[] {
  return [...contratos].sort(
    (a, b) => a.student.class.name.localeCompare(b.student.class.name, "pt-BR") || a.student.name.localeCompare(b.student.name, "pt-BR"),
  );
}

/** As duas abas: "Contratos <ano>" (listagem) e "Mensalidades <ano>" (parcela corrigida mês a mês). */
export function planilhasDosContratos(contratos: ContratoParaPlanilha[], ano: number): Planilha[] {
  const lista = ordenar(contratos);
  const dia = String(DIA_VENCIMENTO_MENSALIDADE).padStart(2, "0");

  // ---- Aba 1: listagem ----
  const cabContratos = [
    "Aluno", "Turma", "Etapa", "Responsáveis", "Telefones", "Situação do contrato", "Forma de assinatura",
    "Enviado em", "Assinado enviado em", "Parcelas", "Vencimento", "Parcela no contrato", "Anuidade no contrato",
    "Conferência do valor", "Contrato",
  ];
  const linhasContratos: Celula[][] = [cabContratos];
  for (const c of lista) {
    const r = responsaveis(c);
    const v = c.valores;
    linhasContratos.push([
      c.student.name,
      c.student.class.name,
      ETAPA[etapaPelaTurma(c.student.class.name)],
      r.nomes,
      r.telefones,
      STATUS_CONTRATO_LABEL[c.status] + (c.confirmadoPelaEscola ? " (confirmado pela escola)" : ""),
      c.metodoAssinatura ? METODO_LABEL[c.metodoAssinatura] : "",
      dataBr(c.createdAt),
      dataBr(c.assinadoEnviadoEm),
      v ? v.parcelas : null,
      v ? `Dia ${String(v.vencimentoDia).padStart(2, "0")}` : "",
      v?.bolsista ? "Isento" : v && v.parcelaBruta > 0 ? v.parcelaBruta : null,
      v?.bolsista ? "Isento" : v && v.anuidade > 0 ? v.anuidade : null,
      c.conferencia?.rotulo ?? "",
      c.titulo,
    ]);
  }

  // ---- Aba 2: Mensalidades <ano> ----
  const meses = MESES.map((m, i) => `${m}/${ano} (venc. ${dia}/${String(i + 1).padStart(2, "0")})`);
  const cabMensalidades = ["Aluno", "Turma", "Etapa", "Responsáveis", "Situação do contrato", `Mensalidade ${ano}`, ...meses, `Total ${ano}`, "Origem do valor", "Observação"];
  const colParcela = 5; // F
  const colPrimeiroMes = 6; // G
  const colTotal = colPrimeiroMes + 12; // S
  const linhasMensalidades: Celula[][] = [cabMensalidades];
  for (const c of lista) {
    const m = mensalidadeDoContrato(c);
    const r = linhasMensalidades.length + 1;
    const valorMes = (i: number): Celula => {
      if (m.parcela === null) return null;
      if (i >= m.parcelas) return null;
      return { valor: m.parcela, formula: `$${letraColuna(colParcela)}${r}` };
    };
    const total = m.parcela === null ? null : centavos(m.parcela * Math.min(m.parcelas, 12));
    linhasMensalidades.push([
      c.student.name,
      c.student.class.name,
      ETAPA[etapaPelaTurma(c.student.class.name)],
      responsaveis(c).nomes,
      STATUS_CONTRATO_LABEL[c.status],
      m.parcela,
      ...Array.from({ length: 12 }, (_, i) => valorMes(i)),
      total === null ? null : { valor: total, formula: `SUM(${letraColuna(colPrimeiroMes)}${r}:${letraColuna(colTotal - 1)}${r})` },
      m.origem,
      m.observacao,
    ]);
  }
  if (lista.length > 0) {
    const ultima = linhasMensalidades.length;
    const somaColuna = (j: number): Celula => {
      const soma = linhasMensalidades.slice(1).reduce((s, l) => {
        const cel = l[j];
        const v = typeof cel === "number" ? cel : cel && typeof cel === "object" && typeof cel.valor === "number" ? cel.valor : 0;
        return s + v;
      }, 0);
      return { valor: centavos(soma), formula: `SUM(${letraColuna(j)}2:${letraColuna(j)}${ultima})`, estilo: "moedaNegrito" };
    };
    linhasMensalidades.push([
      { valor: "TOTAL", estilo: "negrito" },
      null,
      null,
      null,
      null,
      somaColuna(colParcela),
      ...Array.from({ length: 12 }, (_, i) => somaColuna(colPrimeiroMes + i)),
      somaColuna(colTotal),
      null,
      null,
    ]);
  }

  const moedaMensalidades = Array.from({ length: 14 }, (_, i) => colParcela + i);
  return [
    {
      nome: `Mensalidades ${ano}`,
      linhas: linhasMensalidades,
      cabecalho: true,
      linhasRodape: lista.length > 0 ? 1 : 0,
      colunasMoeda: moedaMensalidades,
      larguras: [34, 16, 18, 40, 24, 16, ...Array(12).fill(14), 16, 20, 60],
    },
    {
      nome: `Contratos ${ano}`,
      linhas: linhasContratos,
      cabecalho: true,
      colunasMoeda: [11, 12],
      larguras: [34, 16, 18, 40, 28, 30, 26, 12, 12, 9, 11, 16, 16, 28, 40],
    },
  ];
}

export function gerarPlanilhaContratos(contratos: ContratoParaPlanilha[], ano: number): Uint8Array {
  return gerarXlsx(planilhasDosContratos(contratos, ano));
}

/** Ex.: "Contratos 2027 - Mensalidades 2027 - 18-11-2026.xlsx" */
export function nomeArquivoPlanilha(ano: number, hoje = new Date()): string {
  const d = hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(/\//g, "-");
  return `Contratos ${ano} - Mensalidades ${ano} - ${d}.xlsx`;
}
