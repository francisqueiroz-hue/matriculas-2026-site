"use client";

import { TelaDeErro } from "@/components/TelaDeErro";

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <TelaDeErro
      titulo="Algo deu errado"
      mensagem="Não foi possível mostrar esta página. Tente de novo; se o problema continuar, avise a secretaria."
      onTentar={reset}
      codigo={error.digest}
    />
  );
}
