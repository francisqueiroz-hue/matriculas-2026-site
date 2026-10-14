/**
 * Erro cuja mensagem foi escrita para o usuário final (validação, regra de negócio).
 * É o único tipo de Error que `handleApiError` repassa ao navegador; qualquer outro erro
 * vira uma resposta genérica e o detalhe fica só no log do servidor.
 */
export class ErroDeUsuario extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ErroDeUsuario";
    this.status = status;
  }
}

export const MENSAGEM_ERRO_GENERICO =
  "Não foi possível concluir a operação. Tente novamente; se o problema continuar, avise a secretaria.";
