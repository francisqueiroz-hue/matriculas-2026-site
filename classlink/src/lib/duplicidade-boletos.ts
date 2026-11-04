import { nomesSemelhantes } from "@/lib/nomes-semelhantes";

/**
 * Cobrança em duplicidade: o banco já impede dois boletos do mesmo cadastro no mesmo mês
 * (studentId + mesReferencia é único). O que escapa é o mesmo aluno cadastrado duas vezes
 * (ex.: "Antonella Souza" e "Antonella de Souza"), cada cadastro com o seu boleto. Aqui se
 * acham, por competência, boletos de cadastros diferentes com nomes semelhantes.
 */
export interface BoletoParaDuplicidade {
  id: string;
  studentId: string;
  aluno: string;
  turma: string;
  mesReferencia: string;
  status: string;
  alunoExcluido: boolean;
}

export interface OutroBoleto {
  id: string;
  aluno: string;
  turma: string;
  status: string;
  alunoExcluido: boolean;
}

export function boletosDuplicados(boletos: BoletoParaDuplicidade[]): Map<string, OutroBoleto[]> {
  const porMes = new Map<string, BoletoParaDuplicidade[]>();
  for (const b of boletos) {
    if (b.status === "CANCELADO") continue;
    const lista = porMes.get(b.mesReferencia) ?? [];
    lista.push(b);
    porMes.set(b.mesReferencia, lista);
  }
  const resultado = new Map<string, OutroBoleto[]>();
  for (const lista of porMes.values()) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i];
        const b = lista[j];
        if (a.studentId === b.studentId || !nomesSemelhantes(a.aluno, b.aluno)) continue;
        anexar(resultado, a.id, b);
        anexar(resultado, b.id, a);
      }
    }
  }
  return resultado;
}

function anexar(mapa: Map<string, OutroBoleto[]>, id: string, outro: BoletoParaDuplicidade) {
  const lista = mapa.get(id) ?? [];
  lista.push({
    id: outro.id,
    aluno: outro.aluno,
    turma: outro.turma,
    status: outro.status,
    alunoExcluido: outro.alunoExcluido,
  });
  mapa.set(id, lista);
}

const ROTULO_STATUS: Record<string, string> = {
  PAGO: "pago",
  PENDENTE: "em aberto",
  VENCIDO: "vencido",
  ERRO: "com erro na emissão",
};

export function textoDuplicidade(outro: OutroBoleto): string {
  const situacao = ROTULO_STATUS[outro.status] ?? outro.status.toLowerCase();
  return `Possível duplicidade: outro cadastro “${outro.aluno}” (${outro.turma}${outro.alunoExcluido ? ", excluído" : ""}) tem boleto ${situacao} no mesmo mês`;
}
