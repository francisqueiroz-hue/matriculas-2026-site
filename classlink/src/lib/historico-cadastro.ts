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

/** Campos do aluno guardados no histórico: turma pelo nome (legível) e data como AAAA-MM-DD. */
export interface DadosAluno {
  nome: string;
  turma: string;
  nascimento: Date | null;
}

const dataIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function alteracoesAluno(antes: DadosAluno, depois: DadosAluno): AlteracaoCampo[] {
  const pares: [string, string | null, string | null][] = [
    ["nome", antes.nome, depois.nome],
    ["turma", antes.turma, depois.turma],
    ["nascimento", dataIso(antes.nascimento), dataIso(depois.nascimento)],
  ];
  return pares
    .filter(([, anterior, novo]) => anterior !== novo)
    .map(([campo, valorAnterior, valorNovo]) => ({ campo, valorAnterior, valorNovo }));
}
