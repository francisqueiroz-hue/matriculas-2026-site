/**
 * Variáveis públicas do Firebase (NEXT_PUBLIC_FIREBASE_*). Ao colar na Vercel é comum vir
 * junto um caractere invisível (espaço de largura zero, BOM) ou aspas curvas “ ” — o
 * navegador então recusa o cabeçalho da requisição ("TypeError: Type error" no iPhone).
 * Nenhum desses valores tem caracteres fora do ASCII visível, então dá para limpar com segurança.
 */
export function limparValorPublico(valor: string | undefined): string | undefined {
  const v = valor
    ?.replace(/[^\x21-\x7E]/g, "") // só ASCII visível: remove espaços, invisíveis e aspas curvas
    .replace(/^["'`]+|["'`]+$/g, "");
  return v || undefined;
}

/** Formatos esperados (só para diagnóstico; nada aqui é segredo). */
const FORMATOS: Record<string, RegExp> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: /^AIza[0-9A-Za-z_-]{35}$/,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: /^[a-z0-9-]{4,40}$/,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: /^\d{6,20}$/,
  NEXT_PUBLIC_FIREBASE_APP_ID: /^1:\d+:web:[0-9a-f]+$/,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: /^[A-Za-z0-9_-]{80,90}$/,
};

/**
 * Variáveis preenchidas com algum problema: caracteres a mais (que o app limpa sozinho, mas
 * convém corrigir na Vercel) ou formato inesperado mesmo depois de limpar.
 */
export function problemasConfigPublica(env: Record<string, string | undefined>): { nome: string; problema: string }[] {
  const problemas: { nome: string; problema: string }[] = [];
  for (const [nome, formato] of Object.entries(FORMATOS)) {
    const bruto = env[nome];
    if (!bruto?.trim()) continue;
    const limpo = limparValorPublico(bruto) ?? "";
    if (!formato.test(limpo)) problemas.push({ nome, problema: "formato inesperado — confira se colou o valor certo" });
    else if (limpo !== bruto) problemas.push({ nome, problema: "tem espaço, aspas ou caractere invisível a mais" });
  }
  return problemas;
}
