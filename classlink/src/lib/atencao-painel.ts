/**
 * A pessoa está com o ClassLink na frente: aba visível E janela com foco. Só aí o aviso
 * dentro da página resolve. No computador, uma janela pode estar visível (atrás ou ao lado de
 * outro programa) sem foco — nesse caso o aviso tem de ir para a notificação do sistema.
 */
export function pessoaOlhandoOPainel(doc: Pick<Document, "visibilityState" | "hasFocus"> = document): boolean {
  return doc.visibilityState === "visible" && doc.hasFocus();
}
