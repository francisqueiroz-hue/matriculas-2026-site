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

/**
 * Nome curto do aparelho para o diagnóstico de notificações ("iPhone", "Android · Chrome",
 * "Mac · Safari", "Windows · Edge"). Só o tipo de aparelho e o navegador: nada que identifique a pessoa.
 */
export function descreverAparelho(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (/iphone|ipod/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  const sistema = /android/i.test(ua)
    ? "Android"
    : /macintosh|mac os x/i.test(ua)
      ? "Mac"
      : /windows/i.test(ua)
        ? "Windows"
        : /cros/i.test(ua)
          ? "Chromebook"
          : /linux/i.test(ua)
            ? "Linux"
            : "Aparelho";
  const navegador = /edg\//i.test(ua)
    ? "Edge"
    : /opr\//i.test(ua)
      ? "Opera"
      : /firefox\//i.test(ua)
        ? "Firefox"
        : /chrome\//i.test(ua)
          ? "Chrome"
          : /safari\//i.test(ua)
            ? "Safari"
            : null;
  return navegador ? `${sistema} · ${navegador}` : sistema;
}
