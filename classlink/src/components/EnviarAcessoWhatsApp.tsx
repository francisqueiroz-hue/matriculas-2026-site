/**
 * Botão que abre o WhatsApp de quem está usando o painel (celular ou WhatsApp Web) com a
 * mensagem de acesso já escrita para o contato. Funciona mesmo sem a API da Meta e sem a
 * janela de 24h, porque quem envia é a própria pessoa da escola.
 */
export function EnviarAcessoWhatsApp({ href }: { href: string | null | undefined }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
        <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2z" />
      </svg>
      Enviar acesso pelo meu WhatsApp
    </a>
  );
}
