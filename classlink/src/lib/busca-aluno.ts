/**
 * Busca instantânea de aluno (direção e coordenação).
 *
 * Em emergência a equipe precisa achar o aluno digitando poucas letras, sem rolar a lista.
 * A busca roda no próprio aparelho (a lista da escola cabe na memória), então cada tecla
 * mostra o resultado na hora, sem esperar o servidor.
 *
 * Regras:
 * - ignora acento e maiúscula ("joao" acha "João", "CONCEICAO" acha "Conceição");
 * - cada palavra digitada precisa ser o começo de alguma palavra do nome do aluno, da turma
 *   ou do nome/parentesco do responsável: "ana inf 3" acha "Ana Clara", do "Infantil 3",
 *   mas "ana" sozinho não traz a "Joana";
 * - número com 4 dígitos ou mais procura também no telefone do responsável;
 * - quem tem o nome começando pelo que foi digitado vem primeiro.
 */

export interface ResponsavelBusca {
  relation?: string | null;
  guardian: { name: string; phone?: string | null; email?: string | null };
}

export interface AlunoBusca {
  name: string;
  class?: { name: string } | null;
  guardians?: ResponsavelBusca[];
}

/** Texto sem acento, em minúsculas e com espaços simples. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const soDigitos = (texto: string) => texto.replace(/\D/g, "");

/**
 * Pontuação do aluno para o termo (0 = não corresponde). Quanto maior, mais acima na lista:
 * 4 nome começa pelo termo · 3 todas as palavras batem com o nome · 1 achado também pela
 * turma ou pelo responsável.
 */
export function pontuarAluno(aluno: AlunoBusca, termo: string): number {
  const termoNorm = normalizarBusca(termo);
  const digitos = soDigitos(termo);
  if (!termoNorm && digitos.length < 4) return 0;

  const nome = normalizarBusca(aluno.name);
  const turma = normalizarBusca(aluno.class?.name ?? "");
  const responsaveis = (aluno.guardians ?? []).map((g) =>
    normalizarBusca(`${g.guardian.name} ${g.relation ?? ""} ${g.guardian.email ?? ""}`),
  );

  // Telefone: "99876" acha "(21) 99876-5432". Só a partir de 4 dígitos, para "3" não achar todo mundo.
  if (digitos.length >= 4 && digitos.length === termo.replace(/[\s()+.-]/g, "").length) {
    const achouTelefone = (aluno.guardians ?? []).some((g) => soDigitos(g.guardian.phone ?? "").includes(digitos));
    if (achouTelefone) return 1;
  }

  const palavras = termoNorm.split(" ").filter(Boolean);
  if (palavras.length === 0) return 0;
  // Cada palavra digitada precisa ser o começo de alguma palavra ("ana" acha "Ana", não "Joana").
  const todas = [nome, turma, ...responsaveis].join(" ").split(" ");
  if (!palavras.every((p) => todas.some((t) => t.startsWith(p)))) return 0;

  if (nome.startsWith(termoNorm)) return 4;
  const palavrasNome = nome.split(" ");
  if (palavras.every((p) => palavrasNome.some((n) => n.startsWith(p)))) return 3;
  return 1;
}

/** Alunos que correspondem ao termo, os mais prováveis primeiro (empate: ordem alfabética). */
export function filtrarAlunos<T extends AlunoBusca>(alunos: T[], termo: string): T[] {
  if (!termo.trim()) return alunos;
  return alunos
    .map((aluno) => ({ aluno, pontos: pontuarAluno(aluno, termo) }))
    .filter((r) => r.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.aluno.name.localeCompare(b.aluno.name, "pt-BR"))
    .map((r) => r.aluno);
}

/** Idade em anos completos na data de referência (fuso de Brasília não muda a conta de anos). */
export function idadeEmAnos(nascimento: string | Date | null | undefined, hoje = new Date()): number | null {
  if (!nascimento) return null;
  const n = new Date(nascimento);
  if (Number.isNaN(n.getTime())) return null;
  let idade = hoje.getUTCFullYear() - n.getUTCFullYear();
  const antesDoAniversario =
    hoje.getUTCMonth() < n.getUTCMonth() || (hoje.getUTCMonth() === n.getUTCMonth() && hoje.getUTCDate() < n.getUTCDate());
  if (antesDoAniversario) idade -= 1;
  return idade >= 0 ? idade : null;
}

/** Telefone para o link de ligação (tel:). Número brasileiro sem DDI ganha o +55. */
export function linkLigar(telefone: string | null | undefined): string | null {
  const d = soDigitos(telefone ?? "");
  if (d.length < 8) return null;
  if (d.length === 10 || d.length === 11) return `tel:+55${d}`;
  return `tel:+${d}`;
}

/** Link do WhatsApp (wa.me) para o celular do responsável. */
export function linkWhatsApp(telefone: string | null | undefined): string | null {
  const d = soDigitos(telefone ?? "");
  if (d.length === 10 || d.length === 11) return `https://wa.me/55${d}`;
  if (d.length >= 12 && d.startsWith("55")) return `https://wa.me/${d}`;
  return null;
}

/** "(21) 99876-5432" a partir de qualquer formato salvo. */
export function telefoneParaExibir(telefone: string): string {
  const d = soDigitos(telefone).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}
