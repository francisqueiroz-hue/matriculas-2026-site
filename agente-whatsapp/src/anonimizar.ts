/** Remove telefone, CPF, e-mail e números longos antes de qualquer texto sair da conversa (aprendizado). */
export function anonimizar(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, "[telefone]")
    .replace(/\b\d{6,}\b/g, "[número]")
    .trim()
    .slice(0, 300);
}
