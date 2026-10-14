"use client";

import "./globals.css";

export default function ErroGlobal({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen items-center justify-center bg-white px-4 font-sans text-slate-900">
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-lg font-bold">O ClassLink encontrou um problema</h1>
          <p className="mt-2 text-sm text-slate-600">
            Tente de novo. Se o problema continuar, avise a secretaria da escola.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
