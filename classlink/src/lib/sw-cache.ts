/**
 * Regras do cache do service worker (ver src/app/sw.js/route.ts).
 *
 * O service worker é um script à parte, servido como texto: por isso as regras ficam aqui
 * como CÓDIGO-FONTE em JavaScript puro, que a rota injeta no sw.js e os testes executam
 * (tests/sw-cache.test.ts). Assim o que é testado é exatamente o que vai para o aparelho.
 *
 * Privacidade: só entram no cache arquivos estáticos e públicos (JS/CSS do build, ícones,
 * manifest e logos). Páginas (HTML), dados de página do Next (RSC), /dashboard e /api
 * nunca são guardados — contêm dados pessoais de alunos e famílias e ficariam no aparelho
 * mesmo depois de sair da conta.
 */
export const FONTE_REGRAS_CACHE_SW = String.raw`
function requisicaoPodeIrParaCache(request, origem) {
  if (request.method !== "GET") return false;
  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return false;
  }
  if (url.origin !== origem) return false;
  // Navegação (HTML de página) nunca: a página pode ter dados pessoais.
  if (request.mode === "navigate") return false;
  var accept = request.headers.get("Accept") || "";
  if (accept.indexOf("text/html") !== -1) return false;
  // Dados de página do Next (React Server Components): também trazem dados pessoais.
  if (request.headers.get("RSC") !== null) return false;
  if (request.headers.get("Next-Router-State-Tree") !== null) return false;
  if (request.headers.get("Next-Router-Prefetch") !== null) return false;
  if (url.searchParams.has("_rsc")) return false;
  var caminho = url.pathname;
  if (caminho.indexOf("..") !== -1) return false;
  if (caminho.indexOf("/api/") === 0 || caminho === "/api") return false;
  if (caminho.indexOf("/dashboard") === 0) return false;
  // Lista fechada do que é estático e público.
  if (caminho.indexOf("/_next/static/") === 0) return true;
  if (caminho.indexOf("/icons/") === 0) return true;
  if (caminho.indexOf("/logos/") === 0) return true;
  if (caminho === "/manifest.json") return true;
  // Otimizador de imagens do Next: só para os logos e ícones públicos.
  if (caminho === "/_next/image") {
    var origemImagem = url.searchParams.get("url") || "";
    if (origemImagem.indexOf("..") !== -1) return false;
    return origemImagem.indexOf("/logos/") === 0 || origemImagem.indexOf("/icons/") === 0;
  }
  return false;
}

function respostaPodeIrParaCache(response) {
  // Só respostas completas (200) da própria origem (type "basic"); 206/erros/redirecionamentos não.
  if (!response || !response.ok || response.status !== 200 || response.type !== "basic") return false;
  var cacheControl = (response.headers.get("Cache-Control") || "").toLowerCase();
  if (/(^|[\s,])(no-store|private)([\s,=]|$)/.test(cacheControl)) return false;
  // Página (HTML) ou dados de página do Next (RSC) nunca, mesmo vindo de um caminho permitido.
  var tipo = (response.headers.get("Content-Type") || "").toLowerCase();
  if (tipo.indexOf("text/html") !== -1 || tipo.indexOf("application/xhtml") !== -1) return false;
  if (tipo.indexOf("text/x-component") !== -1 || /\brsc\b/.test(tipo)) return false;
  return true;
}
`;
