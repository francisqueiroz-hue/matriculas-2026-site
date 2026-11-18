"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { podeExportarBoletim } from "@/lib/equipe";
import { PdfErro, abrirArquivo, obterPdf, salvarArquivo } from "@/lib/pdf-client";
import { calcularLinhas, errosDoBoletim, formatarNumero, type BoletimEditavel, type ModeloBoletim } from "@/lib/boletim-modelo";

type Boletim = BoletimEditavel & { aluno: string };
/** Campos iguais para todos os boletins da impressão (a turma é uma só). */
type Comum = Pick<BoletimEditavel, "localData" | "professor" | "coordenacao" | "responsavelPedagogico" | "aulasDadas">;

const entrada = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800";
const celula = "w-14 rounded border px-1 py-1 text-center text-sm dark:bg-slate-800";

export default function BoletimEditavelPage() {
  const user = useCurrentUser();
  const perfil = { role: user.role, funcao: user.funcao ?? null, isCoordenacao: Boolean(user.isCoordenacao) };
  if (!podeExportarBoletim(perfil)) {
    return <p className="text-sm text-slate-500">Somente a direção e a coordenação imprimem o boletim.</p>;
  }
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Carregando...</p>}>
      <EditorBoletim />
    </Suspense>
  );
}

function EditorBoletim() {
  const params = useSearchParams();
  const aluno = params.get("aluno");
  const turma = params.get("turma");
  const consulta = aluno ? `aluno=${encodeURIComponent(aluno)}` : turma ? `turma=${encodeURIComponent(turma)}` : null;

  const [modelo, setModelo] = useState<ModeloBoletim | null>(null);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [originais, setOriginais] = useState<Boletim[]>([]);
  const [boletins, setBoletins] = useState<Boletim[]>([]);
  const [comum, setComum] = useState<Comum | null>(null);
  const [atual, setAtual] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"modelo" | "pdf" | null>(null);

  useEffect(() => {
    if (!consulta) return;
    apiJson<{ modelo: ModeloBoletim; ano: number; boletins: Boletim[] }>(`/api/notas/boletim-editavel?${consulta}`)
      .then((d) => {
        setModelo(d.modelo);
        setAno(d.ano);
        setOriginais(d.boletins);
        setBoletins(d.boletins);
        const b = d.boletins[0];
        setComum({ localData: b.localData, professor: b.professor, coordenacao: b.coordenacao, responsavelPedagogico: b.responsavelPedagogico, aulasDadas: b.aulasDadas });
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Não foi possível carregar o boletim."));
  }, [consulta]);

  const completos = useMemo(() => (comum ? boletins.map((b) => ({ ...b, ...comum })) : []), [boletins, comum]);
  const b = completos[atual];
  const linhas = useMemo(() => (b ? calcularLinhas(b) : []), [b]);
  const erros = useMemo(() => completos.flatMap((x) => errosDoBoletim(x).map((e) => (completos.length > 1 ? `${x.aluno}: ${e}` : e))), [completos]);

  if (!consulta) return <p className="text-sm text-slate-500">Escolha a turma ou o aluno na tela de Notas.</p>;
  if (erro) return <p role="alert" className="text-sm text-red-600">{erro}</p>;
  if (!modelo || !comum || !b) return <p className="text-sm text-slate-500">Carregando boletim...</p>;

  const original = originais[atual];
  const editado = (i: number, t: number, campo: "nota" | "faltas") => b.linhas[i].trimestres[t][campo] !== original.linhas[i]?.trimestres[t][campo];
  const alteracoes = boletins.filter((x, i) => JSON.stringify(x) !== JSON.stringify(originais[i])).length;

  function mudarBoletim(fn: (x: Boletim) => Boletim) {
    setBoletins((lista) => lista.map((x, i) => (i === atual ? fn(x) : x)));
  }
  function mudarCelula(i: number, t: number, campo: "nota" | "faltas", valor: string) {
    mudarBoletim((x) => ({
      ...x,
      linhas: x.linhas.map((l, li) => (li !== i ? l : { ...l, trimestres: l.trimestres.map((tr, ti) => (ti !== t ? tr : { ...tr, [campo]: valor })) })),
    }));
  }

  async function salvarModelo() {
    setAviso(null);
    setOcupado("modelo");
    try {
      const d = await apiJson<{ modelo: ModeloBoletim }>("/api/notas/boletim-modelo", { method: "PUT", body: JSON.stringify(modelo) });
      setModelo(d.modelo);
      setAviso("Modelo salvo: os próximos boletins já saem assim.");
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Não foi possível salvar o modelo.");
    } finally {
      setOcupado(null);
    }
  }

  async function gerarPdf(lista: Boletim[]) {
    setAviso(null);
    setOcupado("pdf");
    try {
      const nome = lista.length === 1 ? `boletim-${ano}-${lista[0].aluno}.pdf` : `boletins-${ano}-${lista[0].turma}.pdf`;
      const corpo = { modelo, boletins: lista.map(({ aluno: _aluno, ...resto }) => (void _aluno, resto)) };
      const arquivo = await obterPdf("/api/notas/boletim-pdf", nome, { method: "POST", body: JSON.stringify(corpo) });
      if (!abrirArquivo(arquivo)) salvarArquivo(arquivo);
    } catch (err) {
      setAviso(err instanceof PdfErro ? err.message : "Não foi possível gerar o PDF. Tente de novo.");
    } finally {
      setOcupado(null);
    }
  }

  const linhasTexto = (v: string[]) => v.join("\n");
  const deTexto = (t: string, max: number) => t.split("\n").slice(0, max);

  return (
    <div className="max-w-5xl space-y-5">
      <Link href="/dashboard/notas" className="text-sm text-indigo-600 hover:underline">← Notas</Link>
      <div>
        <h1 className="text-xl font-bold">Boletim para impressão {ano}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Confira e ajuste antes de gerar o PDF. <strong>As alterações valem só para este PDF</strong>: as notas lançadas no app não mudam.
          Campos alterados ficam em amarelo.
        </p>
      </div>

      <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <summary className="cursor-pointer font-semibold">Modelo da escola (cabeçalho, rodapé e assinaturas)</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            Cabeçalho (uma linha por linha, até 5)
            <textarea rows={3} className={entrada} value={linhasTexto(modelo.cabecalho)} onChange={(e) => setModelo({ ...modelo, cabecalho: deTexto(e.target.value, 5) })} />
          </label>
          <label className="block text-sm md:col-span-2">
            Rodapé: endereço e contatos (até 3 linhas)
            <textarea rows={2} className={entrada} value={linhasTexto(modelo.rodape)} onChange={(e) => setModelo({ ...modelo, rodape: deTexto(e.target.value, 3) })} />
          </label>
          <label className="block text-sm">
            Cidade (para a data)
            <input className={entrada} value={modelo.cidade} maxLength={80} onChange={(e) => setModelo({ ...modelo, cidade: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={modelo.mostrarGrafico} onChange={(e) => setModelo({ ...modelo, mostrarGrafico: e.target.checked })} />
            Mostrar o gráfico das médias
          </label>
          <label className="block text-sm">
            Nome da coordenação (padrão)
            <input className={entrada} value={modelo.coordenacao} maxLength={120} onChange={(e) => setModelo({ ...modelo, coordenacao: e.target.value })} />
          </label>
          <label className="block text-sm">
            Responsável pedagógico (padrão)
            <input className={entrada} value={modelo.responsavelPedagogico} maxLength={120} onChange={(e) => setModelo({ ...modelo, responsavelPedagogico: e.target.value })} />
          </label>
        </div>
        <button type="button" onClick={salvarModelo} disabled={ocupado !== null} className="mt-3 rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-300">
          {ocupado === "modelo" ? "Salvando..." : "Salvar como padrão da escola"}
        </button>
      </details>

      <section className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2 dark:border-slate-800">
        <h2 className="font-semibold md:col-span-2">Data e assinaturas{completos.length > 1 ? " (iguais para toda a turma)" : ""}</h2>
        <label className="block text-sm md:col-span-2">
          Local e data
          <input className={entrada} value={comum.localData} maxLength={120} onChange={(e) => setComum({ ...comum, localData: e.target.value })} />
        </label>
        <label className="block text-sm">
          Professor(a)
          <input className={entrada} value={comum.professor} maxLength={120} onChange={(e) => setComum({ ...comum, professor: e.target.value })} />
        </label>
        <label className="block text-sm">
          Coordenação
          <input className={entrada} value={comum.coordenacao} maxLength={120} onChange={(e) => setComum({ ...comum, coordenacao: e.target.value })} />
        </label>
        <label className="block text-sm">
          Responsável pedagógico
          <input className={entrada} value={comum.responsavelPedagogico} maxLength={120} onChange={(e) => setComum({ ...comum, responsavelPedagogico: e.target.value })} />
        </label>
        <fieldset className="text-sm">
          <legend>Aulas dadas por trimestre (para a % de frequência)</legend>
          <div className="mt-1 flex gap-2">
            {comum.aulasDadas.map((a, i) => (
              <label key={i} className="text-xs text-slate-500">
                {i + 1}º
                <input
                  inputMode="numeric"
                  aria-label={`Aulas dadas no ${i + 1}º trimestre`}
                  className={`${celula} block border-slate-300`}
                  value={a}
                  maxLength={3}
                  onChange={(e) => setComum({ ...comum, aulasDadas: comum.aulasDadas.map((x, j) => (j === i ? e.target.value : x)) })}
                />
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-end gap-3">
          {completos.length > 1 ? (
            <label className="text-sm">
              Aluno ({atual + 1} de {completos.length})
              <select className={entrada} value={atual} onChange={(e) => setAtual(Number(e.target.value))}>
                {completos.map((x, i) => (
                  <option key={x.studentId} value={i}>{x.aluno}</option>
                ))}
              </select>
            </label>
          ) : (
            <p className="font-semibold">{b.aluno}</p>
          )}
          <label className="text-sm">
            Turma / série
            <input className={entrada} value={b.turma} maxLength={80} onChange={(e) => mudarBoletim((x) => ({ ...x, turma: e.target.value }))} />
          </label>
          <button type="button" onClick={() => mudarBoletim(() => original)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            Desfazer alterações deste aluno
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-sky-700 text-white">
                <th rowSpan={2} className="bg-amber-400 px-2 py-1 text-left text-slate-900">Disciplina</th>
                {[1, 2, 3].map((t) => (
                  <th key={t} colSpan={2} className="px-2 py-1">{t}º Trimestre</th>
                ))}
                <th rowSpan={2} className="px-2 py-1">Média final</th>
                <th rowSpan={2} className="px-2 py-1">Situação</th>
              </tr>
              <tr className="bg-sky-700 text-xs text-white">
                {[1, 2, 3].map((t) => (
                  <Fragmento key={t} />
                ))}
              </tr>
            </thead>
            <tbody>
              {b.linhas.map((l, i) => (
                <tr key={l.disciplina + i} className="border-b border-slate-200 dark:border-slate-800">
                  <td className="px-2 py-1 font-medium">{l.disciplina}</td>
                  {l.trimestres.map((t, ti) =>
                    (["nota", "faltas"] as const).map((campo) => (
                      <td key={`${ti}-${campo}`} className="px-1 py-1 text-center">
                        <input
                          inputMode="decimal"
                          aria-label={`${l.disciplina}, ${ti + 1}º trimestre, ${campo}`}
                          className={`${celula} ${editado(i, ti, campo) ? "border-amber-500 bg-amber-50 dark:bg-amber-950" : "border-slate-300 dark:border-slate-700"}`}
                          value={t[campo]}
                          maxLength={6}
                          placeholder="—"
                          onChange={(e) => mudarCelula(i, ti, campo, e.target.value)}
                        />
                      </td>
                    )),
                  )}
                  <td className={`px-2 py-1 text-center font-semibold ${linhas[i].media !== null && linhas[i].media! < 6 ? "text-red-600" : ""}`}>{formatarNumero(linhas[i].media)}</td>
                  <td className={`px-2 py-1 text-center text-xs font-semibold ${linhas[i].situacao === "Reprovado" ? "text-red-600" : linhas[i].situacao === "Aprovado" ? "text-green-700" : "text-slate-500"}`}>
                    {linhas[i].situacao}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="block text-sm">
          Observações (opcional, sai no boletim deste aluno)
          <textarea rows={2} maxLength={600} className={entrada} value={b.observacoes} onChange={(e) => mudarBoletim((x) => ({ ...x, observacoes: e.target.value }))} />
        </label>
      </section>

      {erros.length > 0 && (
        <ul role="alert" className="list-disc space-y-1 rounded-md bg-red-50 p-3 pl-6 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {erros.slice(0, 8).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {aviso && <p role="status" className="text-sm text-slate-700 dark:text-slate-300">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={ocupado !== null || erros.length > 0} onClick={() => gerarPdf(completos)} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {ocupado === "pdf" ? "Gerando PDF..." : completos.length > 1 ? `Gerar PDF da turma (${completos.length} alunos)` : "Gerar PDF"}
        </button>
        {completos.length > 1 && (
          <button type="button" disabled={ocupado !== null || erros.length > 0} onClick={() => gerarPdf([b])} className="rounded-md border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-300">
            PDF só de {b.aluno}
          </button>
        )}
        {alteracoes > 0 && <span className="text-xs text-amber-700 dark:text-amber-400">{alteracoes} boletim(ns) com valores alterados nesta impressão.</span>}
      </div>
    </div>
  );
}

function Fragmento() {
  return (
    <>
      <th className="px-1 py-1 font-medium">Nota</th>
      <th className="px-1 py-1 font-medium">Faltas</th>
    </>
  );
}
