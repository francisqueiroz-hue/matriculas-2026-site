import { formatarDinheiro, type ValoresContrato as Valores } from "@/lib/contrato-modelo/tipos";

const brl = (v: number) => `R$ ${formatarDinheiro(v)}`;

/**
 * Valores do contrato de renovação: total do ano e parcelas mensais, como no contrato. A
 * mensalidade anterior e o percentual de correção só aparecem para a direção (`mostrarCorrecao`);
 * a família vê apenas os valores do novo contrato.
 */
export function ValoresContrato({ valores, ano, mostrarCorrecao = false }: { valores: Valores; ano: number; mostrarCorrecao?: boolean }) {
  const r = mostrarCorrecao ? valores.reajuste : null;
  const novo = r ? (r.base === "LIQUIDA" ? valores.parcelaLiquida : valores.parcelaBruta) : 0;
  const temDesconto = valores.parcelaLiquida < valores.parcelaBruta;
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
      <p className="font-semibold text-slate-900">Valores {ano}</p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-500">Valor total {ano}</dt>
        <dd className="font-semibold text-slate-900">{brl(valores.anuidade)}</dd>
        <dt className="text-slate-500">Parcelas</dt>
        <dd>
          {valores.parcelas} parcelas mensais de {brl(valores.parcelaBruta)}
        </dd>
        {r && (
          <>
            <dt className="text-slate-500">Mensalidade atual</dt>
            <dd>{brl(r.valorAnterior)}</dd>
            <dt className="text-slate-500">Nova mensalidade</dt>
            <dd>
              {brl(novo)} <span className="text-slate-600">(correção de {r.percentual.toLocaleString("pt-BR")}%)</span>
            </dd>
          </>
        )}
        {temDesconto && (
          <>
            <dt className="text-slate-500">Até o dia {valores.vencimentoDia}</dt>
            <dd>{brl(valores.parcelaLiquida)} por parcela (pagamento em dia)</dd>
          </>
        )}
      </dl>
    </div>
  );
}
