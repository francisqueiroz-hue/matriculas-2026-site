/**
 * Detecta iPhone/iPad pelo user agent. Cobre qualquer navegador em iOS (Safari,
 * Chrome-para-iOS etc.) já que todos usam o motor WebKit e herdam a mesma
 * restrição de push do Safari.
 */
export function isIosDevice(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent);
}

/**
 * No iOS, notificação push (Firebase/Web Push) só funciona depois que o site é
 * "Adicionado à Tela de Início" (modo standalone) — não tem como contornar isso
 * por código, é restrição do próprio sistema. Este helper decide quando vale a
 * pena mostrar o aviso explicando o passo a passo: dispositivo é iOS e ainda não
 * está rodando no modo instalado.
 */
export function shouldShowIosInstallBanner(userAgent: string, isStandalone: boolean): boolean {
  return isIosDevice(userAgent) && !isStandalone;
}
