/**
 * Histórico de alterações de cadastro: compara o antes e o depois e gera uma linha por campo
 * que mudou (quem alterou, quando, valor anterior e novo). Campo que não mudou não gera linha.
 */

export type EntidadeCadastro = "ALUNO";

export interface AlteracaoCampo {
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
}

/** Rótulo em português de cada campo, para a tela de histórico. */
export const ROTULO_CAMPO: Record<string, string> = {
  nome: "Nome",
  turma: "Turma",
  nascimento: "Data de nascimento",
};

/**
 * Campos do aluno guardados no histórico. A troca de turma é detectada pelo id (duas turmas
 * podem ter o mesmo nome em anos diferentes) e gravada como "Nome (ano)", que é legível.
 * Data como AAAA-MM-DD.
 */
export interface DadosAluno {
  nome: string;
  turma: { id: string; name: string; year: number };
  nascimento: Date | null;
}

const dataIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const rotuloTurma = (t: DadosAluno["turma"]) => `${t.name} (${t.year})`;

export function alteracoesAluno(antes: DadosAluno, depois: DadosAluno): AlteracaoCampo[] {
  const alteracoes: AlteracaoCampo[] = [];
  if (antes.nome !== depois.nome) alteracoes.push({ campo: "nome", valorAnterior: antes.nome, valorNovo: depois.nome });
  if (antes.turma.id !== depois.turma.id) {
    alteracoes.push({ campo: "turma", valorAnterior: rotuloTurma(antes.turma), valorNovo: rotuloTurma(depois.turma) });
  }
  const [nascAntes, nascDepois] = [dataIso(antes.nascimento), dataIso(depois.nascimento)];
  if (nascAntes !== nascDepois) alteracoes.push({ campo: "nascimento", valorAnterior: nascAntes, valorNovo: nascDepois });
  return alteracoes;
}
