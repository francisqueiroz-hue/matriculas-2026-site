import Link from "next/link";

type Props = {
  titulo: string;
  mensagem: string;
  /** Se informado, mostra o botão "Tentar de novo". */
  onTentar?: () => void;
  /** Código do erro (digest do Next) para o suporte localizar no log. */
  codigo?: string;
};

export function TelaDeErro({ titulo, mensagem, onTentar, codigo }: Props) {
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center px-4">
      <div
        role="alert"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h1 className="text-lg font-bold">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{mensagem}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {onTentar && (
            <button
              type="button"
              onClick={onTentar}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Tentar de novo
            </button>
          )}
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Ir para o início
          </Link>
        </div>
        {codigo && <p className="mt-4 text-xs text-slate-400">Código: {codigo}</p>}
      </div>
    </div>
  );
}
