/**
 * Decisão do service worker sobre a notificação push quando o ClassLink está aberto na tela.
 *
 * O SDK do Firebase, ao receber um push, verifica se há alguma janela do app VISÍVEL. Se há,
 * ele não mostra a notificação: só repassa o conteúdo para a página (para um "onMessage").
 * O ClassLink não usa onMessage, então o aviso sumia. No computador isso é comum: o ClassLink
 * fica aberto numa janela (visível, mas sem foco) enquanto a pessoa trabalha em outro programa,
 * e a mensagem da família chegava sem notificação nenhuma.
 *
 * Regra daqui:
 *  - nenhuma janela visível: o Firebase mostra a notificação (nada a fazer);
 *  - janela visível e com foco: a pessoa está olhando o app; o aviso aparece na tela
 *    (AvisosMensagens) e a página é avisada para atualizar na hora;
 *  - janela visível sem foco: o service worker mostra a notificação do sistema.
 *
 * Como sw-cache.ts, é CÓDIGO-FONTE em JavaScript puro, injetado no sw.js e executado nos
 * testes (tests/sw-push.test.ts): o que é testado é o que vai para o aparelho.
 */
export const FONTE_PUSH_SW = String.raw`
function janelasVisiveis(janelas) {
  return janelas.filter(function (j) {
    return j.visibilityState === "visible" && String(j.url || "").indexOf("chrome-extension://") !== 0;
  });
}

// Devolve a notificação que o service worker deve mostrar, ou null quando não deve.
function notificacaoParaJanelaSemFoco(payload, janelas) {
  var n = payload && payload.notification;
  if (!n) return null;
  var visiveis = janelasVisiveis(janelas);
  if (visiveis.length === 0) return null; // o Firebase mostra
  for (var i = 0; i < visiveis.length; i++) if (visiveis[i].focused) return null; // aviso na tela
  var dados = payload.data || {};
  var link = (payload.fcmOptions && payload.fcmOptions.link) || n.click_action;
  var opcoes = {
    body: n.body || "",
    icon: n.icon || "/icons/icon-192.png",
    data: { url: dados.url || link || "/dashboard", origem: "classlink-aviso" },
  };
  if (n.badge) opcoes.badge = n.badge;
  if (n.tag) {
    opcoes.tag = n.tag;
    opcoes.renotify = true; // cada mensagem nova avisa, mesmo substituindo a anterior
  }
  return { titulo: n.title || "ClassLink", opcoes: opcoes };
}
`;
