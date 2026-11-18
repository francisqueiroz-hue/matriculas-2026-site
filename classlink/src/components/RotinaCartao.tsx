import {
  ACEITACAO,
  EVACUACAO,
  REFEICOES,
  SONO,
  dataComDiaDaSemana,
  type RotinaSalva,
} from "@/lib/rotina";

const rotuloDe = (lista: readonly { valor: string; rotulo: string }[], valores: string[]) =>
  valores.map((v) => lista.find((i) => i.valor === v)?.rotulo ?? v).join(" e ");

/** Rotina de um dia, só leitura (família e histórico da escola). */
export function RotinaCartao({ rotina, acoes }: { rotina: RotinaSalva; acoes?: React.ReactNode }) {
  const refeicoes = REFEICOES.filter((r) => rotina[r.campo]);
  return (
    <article className="space-y-3 rounded-xl border border-amber-300 bg-white p-4 dark:border-amber-800 dark:bg-slate-900">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold capitalize">{dataComDiaDaSemana(rotina.data)}</h3>
        {acoes}
      </header>

      {refeicoes.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Alimentação</h4>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {refeicoes.map((r) => {
              const a = ACEITACAO.find((x) => x.valor === rotina[r.campo]);
              return (
                <li key={r.campo}>
                  <span className="text-slate-500">{r.rotulo}:</span>{" "}
                  <span aria-hidden="true">{a?.emoji}</span> {a?.rotulo}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {rotina.sono.length > 0 && (
          <div>
            <dt className="inline text-slate-500">Sono: </dt>
            <dd className="inline">{rotuloDe(SONO, rotina.sono)}</dd>
          </div>
        )}
        {rotina.evacuacao.length > 0 && (
          <div>
            <dt className="inline text-slate-500">Evacuação: </dt>
            <dd className="inline">{rotuloDe(EVACUACAO, rotina.evacuacao)}</dd>
          </div>
        )}
        {rotina.banho !== null && (
          <div>
            <dt className="inline text-slate-500">Banho: </dt>
            <dd className="inline">{rotina.banho ? "Sim" : "Não"}</dd>
          </div>
        )}
      </dl>

      {rotina.medicacoes.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">Medicação</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {rotina.medicacoes.map((m, i) => (
              <li key={i}>
                {m.horario && <strong>{m.horario}</strong>} {m.nome}
                {m.dosagem && ` · ${m.dosagem}`}
                {m.responsavel && <span className="text-slate-500"> · deu: {m.responsavel}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rotina.observacoes && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Observações</h4>
          <p className="mt-1 whitespace-pre-line text-sm">{rotina.observacoes}</p>
        </section>
      )}

      <p className="text-xs text-slate-400">Preenchido por {rotina.preenchidoPorNome}</p>
    </article>
  );
}
