/**
 * Decisão do service worker sobre a notificação push quando o ClassLink está aberto na tela.
 *
 * O SDK do Firebase, ao receber um push, verifica se há alguma janela do app VISÍVEL. Se há,
 * ele não mostra a notificação: só repassa o conteúdo para a página (para um "onMessage").
 * O ClassLink não usa onMessage, então o aviso sumia.
 *
 * Isso tinha dois efeitos:
 *  1. No computador, o ClassLink fica aberto numa janela visível sem foco e a mensagem chegava
 *     sem notificação (corrigido no PR #110).
 *  2. No iPhone (e no Safari em geral), push que termina SEM notificação conta como "push
 *     silencioso". Depois de poucos (a Apple fala em três), o Safari CANCELA a inscrição de
 *     push do aparelho, que para de receber tudo, sem aviso. Bastava o app estar aberto no
 *     celular quando chegavam algumas mensagens para o celular "desligar" as notificações.
 *
 * Regra daqui: sempre que o Firebase não vai mostrar (há janela visível), o service worker
 * mostra. Se a pessoa está olhando o app (janela visível e com foco), a notificação sai
 * silenciosa (sem som nem vibração), porque o aviso e o bip já aparecem na tela
 * (AvisosMensagens). Sem janela visível, o Firebase mostra e aqui não se faz nada.
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

// Devolve a notificação que o service worker deve mostrar, ou null quando o Firebase já mostra.
function notificacaoComJanelaVisivel(payload, janelas) {
  var n = payload && payload.notification;
  if (!n) return null;
  var visiveis = janelasVisiveis(janelas);
  if (visiveis.length === 0) return null; // o Firebase mostra
  var olhando = false;
  for (var i = 0; i < visiveis.length; i++) if (visiveis[i].focused) olhando = true;
  var dados = payload.data || {};
  var link = (payload.fcmOptions && payload.fcmOptions.link) || n.click_action;
  var opcoes = {
    body: n.body || "",
    icon: n.icon || "/icons/icon-192.png",
    data: { url: dados.url || link || "/dashboard", origem: "classlink-aviso" },
  };
  if (n.badge) opcoes.badge = n.badge;
  if (n.tag) opcoes.tag = n.tag;
  if (olhando) {
    // A pessoa está com o app na frente: o aviso e o bip já saem na tela; aqui só registra.
    // (silent e renotify juntos são recusados pelo navegador.)
    opcoes.silent = true;
  } else if (n.tag) {
    opcoes.renotify = true; // cada mensagem nova avisa, mesmo substituindo a anterior
  }
  return { titulo: n.title || "ClassLink", opcoes: opcoes };
}
`;
