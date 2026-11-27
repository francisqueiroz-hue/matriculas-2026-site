"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ABAS_FATURA,
  ROTULO_ABA,
  agruparPorMes,
  anoInicial,
  anosDisponiveis,
  atrasadasDeTodosOsAnos,
  contarPorAba,
  prepararFaturas,
  rotuloMes,
  valorEstimadoComEncargos,
  type AbaFatura,
  type Fatura,
  type FaturaEntrada,
} from "@/lib/faturas-familia";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const SELO: Record<AbaFatura, { texto: string; cor: string }> = {
  ABERTO: { texto: "Em aberto", cor: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  ATRASADO: { texto: "Atrasada", cor: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  PAGO: { texto: "Paga", cor: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
};

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt(`Copie ${rotulo.toLowerCase()}:`, texto);
    }
  }
  return (
    <button
      type="button"
      onClick={copiar}
      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {copiado ? "Copiado!" : rotulo}
    </button>
  );
}

/** Menu "Pagar": só aparece para boleto emitido no banco (tem Pix, linha digitável e PDF). */
function MenuPagar({ f }: { f: Fatura }) {
  return (
    <details className="text-right">
      <summary className="cursor-pointer list-none rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 [&::-webkit-details-marker]:hidden">
        Pagar ▾
      </summary>
      {/* No fluxo da página (não flutuante): o cartão fica dentro de uma caixa com overflow-hidden,
          que cortava o menu e fazia parecer que o botão não abria. */}
      <div className="mt-2 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {f.pixCopiaCola && <BotaoCopiar texto={f.pixCopiaCola} rotulo="Copiar código Pix" />}
        {f.linhaDigitavel && <BotaoCopiar texto={f.linhaDigitavel} rotulo="Copiar linha digitável" />}
        {!f.pixCopiaCola && !f.linhaDigitavel && (
          <p className="px-3 py-2 text-xs text-slate-500">O banco ainda está gerando o Pix e a linha digitável. Volte em alguns minutos.</p>
        )}
        <a
          href={`/api/billing/boletos/${f.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Abrir boleto em PDF
        </a>
      </div>
    </details>
  );
}

function CartaoFatura({ f, hoje, mostrarAluno }: { f: Fatura; hoje: Date; mostrarAluno: boolean }) {
  const [detalhes, setDetalhes] = useState(false);
  const valor = Number(f.valor);
  const atrasada = f.aba === "ATRASADO";
  const estimativa = atrasada ? valorEstimadoComEncargos(valor, new Date(f.vencimento), hoje) : null;
  const selo = f.aba ? SELO[f.aba] : null;

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {selo && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${selo.cor}`}>{selo.texto}</span>}
        {mostrarAluno && <span className="text-xs text-slate-500">{f.student.name}</span>}
      </div>
      <p className="font-medium">Mensalidade de {rotuloMes(f.mesReferencia).toLowerCase()}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Vencimento</dt>
          <dd>{data(f.vencimento)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{atrasada ? "Valor original" : "Valor"}</dt>
          <dd>{brl(valor)}</dd>
        </div>
        {estimativa && (
          <div>
            <dt className="text-slate-500">Valor estimado hoje</dt>
            <dd className="font-semibold text-red-700 dark:text-red-300">{brl(estimativa.total)}</dd>
          </div>
        )}
        {f.aba === "PAGO" && f.pagoEm && (
          <div>
            <dt className="text-slate-500">Pago em</dt>
            <dd>{data(f.pagoEm)}</dd>
          </div>
        )}
        {f.aba === "PAGO" && f.valorPago != null && Number(f.valorPago) !== valor && (
          <div>
            <dt className="text-slate-500">Valor pago</dt>
            <dd>{brl(Number(f.valorPago))}</dd>
          </div>
        )}
      </dl>

      {detalhes && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <p>Aluno(a): {f.student.name}</p>
          <p>Referência: {rotuloMes(f.mesReferencia)}</p>
          {estimativa && (
            <p>
              {estimativa.dias} dia(s) de atraso. Multa de 2% ({brl(estimativa.multa)}) e juros de 1% ao mês proporcionais ({brl(estimativa.juros)}),
              conforme o contrato. É uma estimativa: o valor exato é calculado no pagamento.
            </p>
          )}
          {!f.pagavelOnline && f.aba !== "PAGO" && <p>O pagamento online desta mensalidade ainda não está disponível. Combine o pagamento com a secretaria.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button type="button" onClick={() => setDetalhes((d) => !d)} className="text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300" aria-expanded={detalhes}>
          {detalhes ? "Ocultar detalhes" : "Detalhes"}
        </button>
        {f.pagavelOnline ? (
          <MenuPagar f={f} />
        ) : (
          f.aba !== "PAGO" && <span className="text-xs text-slate-500">Pagamento online em breve</span>
        )}
      </div>
    </li>
  );
}

export function Faturas({ boletos }: { boletos: FaturaEntrada[] | null }) {
  const hoje = useMemo(() => new Date(), []);
  const todas = useMemo(() => (boletos ? prepararFaturas(boletos, hoje).filter((f) => f.aba !== null) : []), [boletos, hoje]);

  const alunos = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of todas) m.set(f.student.id, f.student.name);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [todas]);
  const [alunoId, setAlunoId] = useState<string>("TODOS");
  const doAluno = alunoId === "TODOS" ? todas : todas.filter((f) => f.student.id === alunoId);

  const anos = anosDisponiveis(doAluno);
  const [anoEscolhido, setAno] = useState<number | null>(null);
  const ano = anoEscolhido !== null && anos.includes(anoEscolhido) ? anoEscolhido : anoInicial(anos, hoje);
  const doAno = doAluno.filter((f) => f.ano === ano);
  const contagem = contarPorAba(doAno);

  const [abaEscolhida, setAba] = useState<AbaFatura | null>(null);
  // Abre na primeira aba que tem fatura: atrasado primeiro chama a atenção para o que vence juros.
  const abaPadrao: AbaFatura = contagem.ATRASADO > 0 ? "ATRASADO" : contagem.ABERTO > 0 ? "ABERTO" : "PAGO";
  const aba = abaEscolhida ?? abaPadrao;
  const grupos = agruparPorMes(doAno.filter((f) => f.aba === aba), aba);

  const atrasadas = atrasadasDeTodosOsAnos(doAluno);
  const atrasadasOutrosAnos = atrasadas.filter((f) => f.ano !== ano).length;

  if (boletos === null) return <p className="text-sm text-slate-500">Carregando...</p>;
  if (todas.length === 0) return <p className="text-sm text-slate-500">Nenhuma fatura emitida ainda.</p>;

  return (
    <section className="space-y-4" aria-label="Faturas">
      {atrasadas.length > 0 && (
        <div role="alert" className="rounded-xl border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold">
            {atrasadas.length === 1 ? "Você tem 1 mensalidade em atraso." : `Você tem ${atrasadas.length} mensalidades em atraso.`}
          </p>
          <p className="mt-1">
            Se precisar combinar o pagamento, fale com a secretaria.{" "}
            <Link href="/dashboard/mensagens" className="font-semibold underline">
              Enviar mensagem à escola
            </Link>
          </p>
          {atrasadasOutrosAnos > 0 && <p className="mt-1 text-xs">Há {atrasadasOutrosAnos} em atraso em outro ano: troque o ano de vencimento para ver.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {alunos.length > 1 && (
          <label className="text-sm">
            <span className="mb-1 block font-medium">Aluno(a)</span>
            <select value={alunoId} onChange={(e) => setAlunoId(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
              <option value="TODOS">Todos</option>
              {alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="mb-1 block font-medium">Ano de vencimento</span>
          <select
            value={ano ?? ""}
            onChange={(e) => {
              setAno(Number(e.target.value));
              setAba(null);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <Link
          href="/dashboard/contratos"
          className="rounded-md border border-indigo-600 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950"
        >
          Contratos
        </Link>
      </div>

      <div role="tablist" aria-label="Situação das faturas" className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {ABAS_FATURA.map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={a === aba}
            onClick={() => setAba(a)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${
              a === aba ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {ROTULO_ABA[a]}
            <span className={`rounded-full px-2 py-0.5 text-xs ${a === aba ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"}`}>
              {contagem[a]}
            </span>
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-3">
        {grupos.length === 0 && <p className="text-sm text-slate-500">Nenhuma fatura {ROTULO_ABA[aba].toLowerCase()} em {ano}.</p>}
        {grupos.map((g) => (
          <div key={g.chave} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <h3 className="bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{g.rotulo}</h3>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {g.faturas.map((f) => (
                <CartaoFatura key={f.id} f={f} hoje={hoje} mostrarAluno={alunos.length > 1} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
