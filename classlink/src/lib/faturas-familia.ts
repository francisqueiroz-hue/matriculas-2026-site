/**
 * Tela "Faturas" da família: organiza os boletos que a família já vê (ano de vencimento,
 * abas Em aberto / Atrasado / Pago, agrupamento por mês). Puro, sem banco: só lê o que a
 * rota /api/billing/boletos devolve, para poder ser testado com casos fixos.
 *
 * Nada aqui emite, altera ou dá baixa em boleto.
 */
import { statusEfetivo, type StatusBoleto } from "@/lib/baixa-boleto";
import { encargosPrevistos } from "@/lib/conferencia-baixas";

export type AbaFatura = "ABERTO" | "ATRASADO" | "PAGO";
export const ABAS_FATURA: AbaFatura[] = ["ABERTO", "ATRASADO", "PAGO"];
export const ROTULO_ABA: Record<AbaFatura, string> = { ABERTO: "Em aberto", ATRASADO: "Atrasado", PAGO: "Pago" };

export interface FaturaEntrada {
  id: string;
  student: { id: string; name: string };
  mesReferencia: string; // "AAAA-MM"
  valor: string | number;
  vencimento: string;
  status: StatusBoleto;
  codigoSolicitacao: string | null;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  pagoEm?: string | null;
  valorPago?: string | number | null;
}

export interface Fatura extends FaturaEntrada {
  aba: AbaFatura | null; // null: boleto que não pôde ser emitido (ERRO) ou cancelado
  ano: number; // ano de vencimento
  /** Emitido no Inter: tem Pix, linha digitável e PDF para pagar. */
  pagavelOnline: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function abaDaFatura(status: StatusBoleto, vencimento: Date, hoje: Date): AbaFatura | null {
  const efetivo = statusEfetivo(status, vencimento, hoje);
  if (efetivo === "PAGO") return "PAGO";
  if (efetivo === "VENCIDO") return "ATRASADO";
  if (efetivo === "PENDENTE") return "ABERTO";
  return null;
}

export function prepararFaturas(lista: FaturaEntrada[], hoje: Date): Fatura[] {
  return lista.map((b) => {
    const venc = new Date(b.vencimento);
    const aba = abaDaFatura(b.status, venc, hoje);
    return {
      ...b,
      aba,
      ano: venc.getFullYear(),
      pagavelOnline: Boolean(b.codigoSolicitacao) && (aba === "ABERTO" || aba === "ATRASADO"),
    };
  });
}

/** Anos com fatura, do mais recente para o mais antigo. */
export function anosDisponiveis(faturas: Fatura[]): number[] {
  return [...new Set(faturas.map((f) => f.ano))].sort((a, b) => b - a);
}

/**
 * Ano que a tela abre: o ano corrente se houver fatura nele; senão o mais próximo com
 * fatura (o mais recente anterior, ou o primeiro futuro).
 */
export function anoInicial(anos: number[], hoje: Date): number | null {
  if (anos.length === 0) return null;
  const atual = hoje.getFullYear();
  if (anos.includes(atual)) return atual;
  const anteriores = anos.filter((a) => a < atual);
  return anteriores.length > 0 ? anteriores[0] : anos[anos.length - 1];
}

export function contarPorAba(faturas: Fatura[]): Record<AbaFatura, number> {
  const c: Record<AbaFatura, number> = { ABERTO: 0, ATRASADO: 0, PAGO: 0 };
  for (const f of faturas) if (f.aba) c[f.aba] += 1;
  return c;
}

/** "2026-12" → "Dezembro de 2026". */
export function rotuloMes(mesReferencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mesReferencia);
  if (!m) return mesReferencia;
  const nome = MESES[Number(m[2]) - 1];
  if (!nome) return mesReferencia;
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${m[1]}`;
}

export interface GrupoMes {
  chave: string; // "AAAA-MM" do vencimento
  rotulo: string;
  faturas: Fatura[];
}

/**
 * Agrupa por mês de vencimento. Em aberto: do mais próximo para o mais distante; atrasado e
 * pago: do mais recente para o mais antigo.
 */
export function agruparPorMes(faturas: Fatura[], aba: AbaFatura): GrupoMes[] {
  const asc = aba === "ABERTO";
  const ordenadas = [...faturas].sort((a, b) => {
    const d = new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime();
    if (d !== 0) return asc ? d : -d;
    return a.student.name.localeCompare(b.student.name, "pt-BR");
  });
  const grupos = new Map<string, GrupoMes>();
  for (const f of ordenadas) {
    const v = new Date(f.vencimento);
    const chave = `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}`;
    let g = grupos.get(chave);
    if (!g) {
      g = { chave, rotulo: rotuloMes(chave), faturas: [] };
      grupos.set(chave, g);
    }
    g.faturas.push(f);
  }
  return [...grupos.values()];
}

/** Dias corridos de atraso até hoje (0 se não venceu). */
export function diasEmAtraso(vencimento: Date, hoje: Date): number {
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const inicioVenc = new Date(vencimento.getFullYear(), vencimento.getMonth(), vencimento.getDate()).getTime();
  return Math.max(0, Math.round((inicioHoje - inicioVenc) / DIA_MS));
}

/**
 * Estimativa do valor de uma fatura atrasada com a multa (2%) e os juros (1% ao mês, pro
 * rata) do contrato, até hoje. É só uma estimativa para a família se orientar: não inclui
 * atualização monetária e o valor exato é o que o banco ou a escola calcular no pagamento.
 */
export function valorEstimadoComEncargos(valor: number, vencimento: Date, hoje: Date): { dias: number; multa: number; juros: number; total: number } {
  const dias = diasEmAtraso(vencimento, hoje);
  const e = encargosPrevistos(valor, dias);
  return { dias, multa: e.multa, juros: e.juros, total: Math.round((valor + e.total) * 100) / 100 };
}

/** Atrasadas de todos os anos (para o aviso do topo, como "Faturas atrasadas" da referência). */
export function atrasadasDeTodosOsAnos(faturas: Fatura[]): Fatura[] {
  return faturas.filter((f) => f.aba === "ATRASADO");
}
