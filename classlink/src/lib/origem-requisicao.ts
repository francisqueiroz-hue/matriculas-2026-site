import { NextResponse } from "next/server";

/**
 * Defesa extra contra CSRF nas rotas de autenticação (além do SameSite=Lax dos cookies):
 * uma requisição que o navegador marca como vinda de outro site, ou cujo Origin não é o
 * próprio endereço do app, é recusada. Sem Origin (curl, app nativo, mesma origem em GET)
 * segue normal: o ataque CSRF só existe em navegador, e o navegador sempre manda Origin em POST.
 */
export function origemPermitida(headers: Headers, env: Record<string, string | undefined> = process.env): boolean {
  if (headers.get("sec-fetch-site") === "cross-site") return false;

  const origem = headers.get("origin");
  if (!origem) return true;

  let host: string;
  try {
    host = new URL(origem).host;
  } catch {
    return false; // inclui o Origin literal "null"
  }

  const proprio = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0]?.trim();
  if (proprio && host === proprio) return true;

  const publico = (env.APP_URL?.trim() || env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || "").replace(/^https?:\/\//i, "");
  return Boolean(publico) && host === publico.split("/")[0];
}

export function respostaOrigemNegada() {
  return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
}
