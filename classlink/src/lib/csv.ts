/**
 * Célula de CSV segura para abrir no Excel/Planilhas.
 *
 * Os CSVs exportados trazem texto digitado por famílias — inclusive pelo formulário público
 * de pré-matrícula, sem login. Um valor que começa com =, +, -, @, tab ou quebra de linha é
 * lido como fórmula pela planilha (ex.: =HYPERLINK(...) levando dados para fora). Por isso
 * esses valores ganham um apóstrofo na frente, que a planilha mostra como texto puro.
 * Depois escapa aspas e quebra a célula entre aspas quando há separador (vírgula ou
 * ponto e vírgula, usado pelo Excel em português) ou quebra de linha.
 */
export function celulaCsv(valor: string): string {
  const seguro = /^[=+\-@\t\r\n]/.test(valor) ? `'${valor}` : valor;
  return /[",;\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/** Cabeçalhos de um download de CSV com dados pessoais: nunca guardado em cache. */
export function cabecalhosDownloadCsv(nomeArquivo: string): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${nomeArquivo.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
