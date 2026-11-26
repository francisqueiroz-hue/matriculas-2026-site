"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { podeEmitirHistorico } from "@/lib/equipe";
import { PdfErro, abrirArquivo, obterPdf, salvarArquivo } from "@/lib/pdf-client";
import { normalizarBusca } from "@/lib/busca-aluno";
import {
  LIMITES_HISTORICO,
  ajustarColunas,
  aplicarMedias,
  colunaDaTurma,
  nomeArquivoHistorico,
  normalizarNome,
  pendenciasDoHistorico,
  vazios,
  type HistoricoAluno,
  type ModeloHistorico,
} from "@/lib/historico-escolar";

const entrada = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800";
const celula = "w-16 rounded border border-slate-300 px-1 py-1 text-center text-sm dark:border-slate-700 dark:bg-slate-800";
const botaoSecundario = "rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800";

type AlunoLista = { id: string; nome: string; turma: string; salvoEm: string | null };

export default function HistoricoEscolarPage() {
  const user = useCurrentUser();
  const perfil = { role: user.role, funcao: user.funcao ?? null, isCoordenacao: Boolean(user.isCoordenacao) };
  if (!podeEmitirHistorico(perfil)) {
    return <p className="text-sm text-slate-500">Somente a direção, a secretaria e a coordenação emitem o histórico escolar.</p>;
  }
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Carregando...</p>}>
      <Historico />
    </Suspense>
  );
}

function Historico() {
  const params = useSearchParams();
  const aluno = params.get("aluno");
  return aluno ? <EditorHistorico key={aluno} studentId={aluno} /> : <EscolherAluno />;
}

function EscolherAluno() {
  const router = useRouter();
  const [alunos, setAlunos] = useState<AlunoLista[] | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ alunos: AlunoLista[] }>("/api/historico")
      .then((d) => setAlunos(d.alunos))
      .catch((err) => setErro(err instanceof Error ? err.message : "Não foi possível carregar os alunos."));
  }, []);

  const filtrados = useMemo(() => {
    if (!alunos) return [];
    const termos = normalizarBusca(busca).split(" ").filter(Boolean);
    if (!termos.length) return alunos;
    return alunos.filter((a) => {
      const palavras = normalizarBusca(`${a.nome} ${a.turma}`).split(" ");
      return termos.every((t) => palavras.some((p) => p.startsWith(t)));
    });
  }, [alunos, busca]);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Histórico escolar</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Escolha o aluno. O histórico já vem com o nome, a data de nascimento, a filiação e as médias do ano que estão no app: complete o código Censo INEP,
          a naturalidade e os anos anteriores (inclusive de outras escolas, em caso de transferência) e gere o PDF.
        </p>
      </div>
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      <input className={entrada} placeholder="Buscar aluno ou turma" aria-label="Buscar aluno ou turma" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {!alunos && !erro && <p className="text-sm text-slate-500">Carregando alunos...</p>}
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {filtrados.slice(0, 60).map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/historico?aluno=${encodeURIComponent(a.id)}`)}
              className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span>
                <span className="font-medium">{a.nome}</span> <span className="text-sm text-slate-500">· {a.turma}</span>
              </span>
              {a.salvoEm && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Histórico salvo</span>}
            </button>
          </li>
        ))}
        {alunos && filtrados.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Nenhum aluno encontrado.</li>}
      </ul>
    </div>
  );
}

function EditorHistorico({ studentId }: { studentId: string }) {
  const [modelo, setModelo] = useState<ModeloHistorico | null>(null);
  const [h, setH] = useState<HistoricoAluno | null>(null);
  const [turma, setTurma] = useState("");
  const [ano, setAno] = useState(new Date().getFullYear());
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"modelo" | "salvar" | "pdf" | "medias" | null>(null);

  useEffect(() => {
    apiJson<{ modelo: ModeloHistorico; historico: HistoricoAluno; salvoEm: string | null; turma: string; ano: number }>(
      `/api/historico?aluno=${encodeURIComponent(studentId)}`,
    )
      .then((d) => {
        setModelo(d.modelo);
        setH(d.historico);
        setSalvoEm(d.salvoEm);
        setTurma(d.turma);
        setAno(d.ano);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Não foi possível carregar o histórico."));
  }, [studentId]);

  const pendencias = useMemo(() => (h && modelo ? pendenciasDoHistorico(h, modelo) : []), [h, modelo]);

  if (erro) return <p role="alert" className="text-sm text-red-600">{erro}</p>;
  if (!modelo || !h) return <p className="text-sm text-slate-500">Carregando histórico...</p>;

  function mudar(fn: (x: HistoricoAluno) => HistoricoAluno) {
    setH((x) => (x ? fn(x) : x));
    setAlterado(true);
  }
  const mudarAluno = (campo: keyof HistoricoAluno["aluno"], valor: string) => mudar((x) => ({ ...x, aluno: { ...x.aluno, [campo]: valor } }));
  const mudarLinha = (campo: "cargaHoraria" | "frequencia" | "resultado", i: number, valor: string) =>
    mudar((x) => ({ ...x, [campo]: x[campo].map((v, j) => (j === i ? valor : v)) }));
  const mudarNota = (d: number, i: number, valor: string) =>
    mudar((x) => ({ ...x, disciplinas: x.disciplinas.map((dd, k) => (k !== d ? dd : { ...dd, notas: dd.notas.map((v, j) => (j === i ? valor : v)) })) }));

  async function salvarModelo() {
    setAviso(null);
    setOcupado("modelo");
    try {
      const d = await apiJson<{ modelo: ModeloHistorico }>("/api/historico/modelo", { method: "PUT", body: JSON.stringify(modelo) });
      setModelo(d.modelo);
      setAviso("Modelo salvo: os próximos históricos já saem assim.");
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Não foi possível salvar o modelo.");
    } finally {
      setOcupado(null);
    }
  }

  async function salvar(): Promise<boolean> {
    const d = await apiJson<{ salvoEm: string }>("/api/historico", { method: "PUT", body: JSON.stringify(h) });
    setSalvoEm(d.salvoEm);
    setAlterado(false);
    return true;
  }

  async function salvarSo() {
    setAviso(null);
    setOcupado("salvar");
    try {
      await salvar();
      setAviso("Histórico do aluno salvo.");
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setOcupado(null);
    }
  }

  async function gerarPdf() {
    setAviso(null);
    setOcupado("pdf");
    try {
      await salvar();
      const arquivo = await obterPdf("/api/historico/pdf", nomeArquivoHistorico(h!.aluno.nome), { method: "POST", body: JSON.stringify({ modelo, historico: h }) });
      if (!abrirArquivo(arquivo)) salvarArquivo(arquivo);
      setAviso("Histórico salvo e PDF gerado.");
    } catch (err) {
      setAviso(err instanceof PdfErro || err instanceof Error ? err.message : "Não foi possível gerar o PDF. Tente de novo.");
    } finally {
      setOcupado(null);
    }
  }

  async function trazerMedias() {
    setAviso(null);
    setOcupado("medias");
    try {
      const d = await apiJson<{ medias: { nome: string; media: string }[] }>(`/api/historico?aluno=${encodeURIComponent(studentId)}&medias=1`);
      const coluna = colunaDaTurma(turma, h!.series);
      if (coluna < 0) {
        setAviso(`Não deu para saber o ano pela turma "${turma}". Digite as médias na coluna certa.`);
        return;
      }
      const mapa = new Map(d.medias.map((m) => [normalizarNome(m.nome), m]));
      const r = aplicarMedias(h!, coluna, mapa);
      setH(r.historico);
      setAlterado(true);
      setAviso(r.preenchidas ? `${r.preenchidas} média(s) de ${ano} colocadas na coluna ${h!.series[coluna]}.` : `Ainda não há média final fechada (3 trimestres) em ${ano}.`);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Não foi possível trazer as médias.");
    } finally {
      setOcupado(null);
    }
  }

  const linhasTexto = (v: string[]) => v.join("\n");
  const deTexto = (t: string, max: number) => t.split("\n").slice(0, max);
  const podeMaisAno = h.series.length < LIMITES_HISTORICO.series;

  return (
    <div className="max-w-5xl space-y-5">
      <Link href="/dashboard/historico" className="text-sm text-indigo-600 hover:underline">← Escolher outro aluno</Link>
      <div>
        <h1 className="text-xl font-bold">Histórico escolar</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {h.aluno.nome} · {turma}. {salvoEm ? `Salvo em ${new Date(salvoEm).toLocaleString("pt-BR")}.` : "Ainda não salvo: os dados abaixo vieram do cadastro e das notas do app."}{" "}
          Use <strong>X</strong> para componente cursado sem nota. Nada aqui muda as notas lançadas no app.
        </p>
      </div>

      <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <summary className="cursor-pointer font-semibold">Modelo da escola (cabeçalho, assinaturas, componentes e anos)</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            Cabeçalho: mantenedora, CNPJ, endereço, portaria (uma informação por linha, até {LIMITES_HISTORICO.linhasCabecalho})
            <textarea rows={6} className={entrada} value={linhasTexto(modelo.cabecalho)} onChange={(e) => setModelo({ ...modelo, cabecalho: deTexto(e.target.value, LIMITES_HISTORICO.linhasCabecalho) })} />
          </label>
          <label className="block text-sm">
            Título
            <input className={entrada} maxLength={120} value={modelo.titulo} onChange={(e) => setModelo({ ...modelo, titulo: e.target.value })} />
          </label>
          <label className="block text-sm">
            Cidade (para a data e os estudos)
            <input className={entrada} maxLength={80} value={modelo.cidade} onChange={(e) => setModelo({ ...modelo, cidade: e.target.value })} />
          </label>
          <label className="block text-sm">
            Nome da escola nos estudos realizados
            <input className={entrada} maxLength={120} value={modelo.estabelecimento} onChange={(e) => setModelo({ ...modelo, estabelecimento: e.target.value })} />
          </label>
          <span className="hidden md:block" />
          {modelo.assinantes.map((a, i) => (
            <fieldset key={i} className="space-y-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-800">
              <legend className="px-1 font-medium">Assinatura {i + 1}</legend>
              {(["cargo", "nome", "registro"] as const).map((campo) => (
                <label key={campo} className="block">
                  {campo === "cargo" ? "Cargo" : campo === "nome" ? "Nome" : "Registro (ex.: Reg. 1234567)"}
                  <input
                    className={entrada}
                    maxLength={campo === "nome" ? 120 : 60}
                    value={a[campo]}
                    onChange={(e) => setModelo({ ...modelo, assinantes: modelo.assinantes.map((x, j) => (j === i ? { ...x, [campo]: e.target.value } : x)) })}
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <label className="block text-sm">
            Componentes padrão (um por linha)
            <textarea rows={6} className={entrada} value={linhasTexto(modelo.disciplinas)} onChange={(e) => setModelo({ ...modelo, disciplinas: deTexto(e.target.value, LIMITES_HISTORICO.disciplinas) })} />
          </label>
          <label className="block text-sm">
            Anos padrão (um por linha)
            <textarea rows={6} className={entrada} value={linhasTexto(modelo.series)} onChange={(e) => setModelo({ ...modelo, series: deTexto(e.target.value, LIMITES_HISTORICO.series) })} />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">Componentes e anos padrão valem para históricos novos; neste aluno, ajuste na tabela abaixo.</p>
        <button type="button" onClick={salvarModelo} disabled={ocupado !== null} className="mt-3 rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-300">
          {ocupado === "modelo" ? "Salvando..." : "Salvar como padrão da escola"}
        </button>
      </details>

      <section className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-3 dark:border-slate-800">
        <h2 className="font-semibold md:col-span-3">Identificação do aluno</h2>
        <label className="block text-sm md:col-span-2">
          Nome completo
          <input className={entrada} maxLength={150} value={h.aluno.nome} onChange={(e) => mudarAluno("nome", e.target.value)} />
        </label>
        <label className="block text-sm">
          Código Censo INEP do aluno
          <input className={entrada} inputMode="numeric" maxLength={20} placeholder="12 dígitos" value={h.aluno.codigoInep} onChange={(e) => mudarAluno("codigoInep", e.target.value)} />
        </label>
        <label className="block text-sm">
          Natural de (cidade/UF)
          <input className={entrada} maxLength={80} value={h.aluno.naturalidade} onChange={(e) => mudarAluno("naturalidade", e.target.value)} />
        </label>
        <label className="block text-sm">
          Nacionalidade
          <input className={entrada} maxLength={40} value={h.aluno.nacionalidade} onChange={(e) => mudarAluno("nacionalidade", e.target.value)} />
        </label>
        <label className="block text-sm">
          Data de nascimento
          <input className={entrada} inputMode="numeric" maxLength={10} placeholder="dd/mm/aaaa" value={h.aluno.nascimento} onChange={(e) => mudarAluno("nascimento", e.target.value)} />
        </label>
        <label className="block text-sm md:col-span-3">
          Filiação
          <input className={entrada} maxLength={300} value={h.aluno.filiacao} onChange={(e) => mudarAluno("filiacao", e.target.value)} />
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">Notas por ano</h2>
          <button type="button" className={botaoSecundario} disabled={ocupado !== null} onClick={trazerMedias}>
            {ocupado === "medias" ? "Buscando..." : `Trazer médias de ${ano} do app`}
          </button>
          <button type="button" className={botaoSecundario} disabled={!podeMaisAno} onClick={() => mudar((x) => ajustarColunas(x, [...x.series, `${x.series.length + 1}º ano`]))}>
            + Ano
          </button>
          <button type="button" className={botaoSecundario} disabled={h.series.length <= 1} onClick={() => mudar((x) => ajustarColunas(x, x.series.slice(0, -1)))}>
            − Último ano
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800">
                <th className="px-2 py-1 text-left">Componente</th>
                {h.series.map((s, i) => (
                  <th key={i} className="px-1 py-1">
                    <input
                      aria-label={`Nome da coluna ${i + 1}`}
                      className={`${celula} w-20 font-semibold`}
                      maxLength={20}
                      value={s}
                      onChange={(e) => mudar((x) => ({ ...x, series: x.series.map((v, j) => (j === i ? e.target.value : v)) }))}
                    />
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {h.disciplinas.map((d, di) => (
                <tr key={di} className="border-b border-slate-200 dark:border-slate-800">
                  <td className="px-1 py-1">
                    <input
                      aria-label={`Componente ${di + 1}`}
                      className={`${entrada} min-w-40`}
                      maxLength={80}
                      value={d.nome}
                      onChange={(e) => mudar((x) => ({ ...x, disciplinas: x.disciplinas.map((dd, k) => (k === di ? { ...dd, nome: e.target.value } : dd)) }))}
                    />
                  </td>
                  {d.notas.map((v, i) => (
                    <td key={i} className="px-1 py-1 text-center">
                      <input aria-label={`${d.nome}, ${h.series[i]}`} className={celula} maxLength={12} placeholder="—" value={v} onChange={(e) => mudarNota(di, i, e.target.value)} />
                    </td>
                  ))}
                  <td className="px-1">
                    <button type="button" aria-label={`Tirar ${d.nome}`} className="text-slate-400 hover:text-red-600" onClick={() => mudar((x) => ({ ...x, disciplinas: x.disciplinas.filter((_, k) => k !== di) }))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {(
                [
                  ["cargaHoraria", "Carga horária anual"],
                  ["frequencia", "Média de frequência anual"],
                  ["resultado", "Resultado"],
                ] as const
              ).map(([campo, rotulo]) => (
                <tr key={campo} className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  <td className="px-2 py-1 font-semibold">{rotulo}</td>
                  {h[campo].map((v, i) => (
                    <td key={i} className="px-1 py-1 text-center">
                      <input
                        aria-label={`${rotulo}, ${h.series[i]}`}
                        className={`${celula} ${campo === "resultado" ? "w-24" : ""}`}
                        maxLength={campo === "resultado" ? 20 : 12}
                        placeholder="—"
                        value={v}
                        onChange={(e) => mudarLinha(campo, i, e.target.value)}
                      />
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className={botaoSecundario}
          disabled={h.disciplinas.length >= LIMITES_HISTORICO.disciplinas}
          onClick={() => mudar((x) => ({ ...x, disciplinas: [...x.disciplinas, { nome: "Novo componente", notas: vazios(x.series.length) }] }))}
        >
          + Componente
        </button>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <div>
          <h2 className="font-semibold">Estudos realizados</h2>
          <p className="text-xs text-slate-500">Uma linha por ano cursado. Em caso de transferência, inclua a escola anterior (nome e município).</p>
        </div>
        {h.estudos.map((e, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[6rem_5rem_1fr_10rem_auto]">
            {(
              [
                ["serie", "Série", 20],
                ["ano", "Ano", 9],
                ["estabelecimento", "Estabelecimento de ensino", 120],
                ["municipio", "Município", 80],
              ] as const
            ).map(([campo, rotulo, max]) => (
              <input
                key={campo}
                aria-label={`${rotulo}, linha ${i + 1}`}
                placeholder={rotulo}
                className={entrada}
                maxLength={max}
                value={e[campo]}
                onChange={(ev) => mudar((x) => ({ ...x, estudos: x.estudos.map((ee, k) => (k === i ? { ...ee, [campo]: ev.target.value } : ee)) }))}
              />
            ))}
            <button type="button" aria-label={`Tirar linha ${i + 1}`} className="text-slate-400 hover:text-red-600" onClick={() => mudar((x) => ({ ...x, estudos: x.estudos.filter((_, k) => k !== i) }))}>
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className={botaoSecundario}
          disabled={h.estudos.length >= LIMITES_HISTORICO.estudos}
          onClick={() => mudar((x) => ({ ...x, estudos: [...x.estudos, { serie: "", ano: "", estabelecimento: "", municipio: "" }] }))}
        >
          + Ano cursado
        </button>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <label className="block text-sm">
          Observações (opcional: transferência, adaptação, regime de progressão etc.)
          <textarea rows={3} maxLength={LIMITES_HISTORICO.observacoes} className={entrada} value={h.observacoes} onChange={(e) => mudar((x) => ({ ...x, observacoes: e.target.value }))} />
        </label>
        <label className="block text-sm">
          Local e data
          <input className={entrada} maxLength={120} value={h.localData} onChange={(e) => mudar((x) => ({ ...x, localData: e.target.value }))} />
        </label>
      </section>

      {pendencias.length > 0 && (
        <ul className="list-disc space-y-1 rounded-md bg-amber-50 p-3 pl-6 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {pendencias.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {aviso && <p role="status" className="text-sm text-slate-700 dark:text-slate-300">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={ocupado !== null} onClick={gerarPdf} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {ocupado === "pdf" ? "Gerando PDF..." : "Salvar e gerar PDF"}
        </button>
        <button type="button" disabled={ocupado !== null} onClick={salvarSo} className="rounded-md border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-300">
          {ocupado === "salvar" ? "Salvando..." : "Só salvar"}
        </button>
        {alterado && <span className="text-xs text-amber-700 dark:text-amber-400">Alterações ainda não salvas.</span>}
      </div>
    </div>
  );
}
