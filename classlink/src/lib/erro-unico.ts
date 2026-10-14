/**
 * Mensagem amigável para violação de unicidade do banco (Prisma P2002), ou null se o erro
 * for outro. Rede de segurança do índice único de telefone: duas requisições simultâneas
 * podem passar pela checagem do app, e o banco recusa a segunda.
 */
export function mensagemViolacaoUnica(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { code?: unknown; meta?: unknown; message?: unknown };
  if (e.code !== "P2002") return null;

  let detalhe = "";
  try {
    detalhe = `${JSON.stringify(e.meta ?? "")} ${typeof e.message === "string" ? e.message : ""}`.toLowerCase();
  } catch {
    detalhe = typeof e.message === "string" ? e.message.toLowerCase() : "";
  }
  if (detalhe.includes("phone")) return "Este celular já está cadastrado para outro usuário.";
  if (detalhe.includes("email")) return "Este e-mail já está cadastrado para outro usuário.";
  return "Já existe um cadastro com esses dados.";
}
