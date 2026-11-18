"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { RotinaCartao } from "@/components/RotinaCartao";
import { RotinaFormulario } from "@/components/RotinaFormulario";
import { apiFetch, apiJson } from "@/lib/api-client";
import { dataCurta, hojeNaEscola, type RotinaSalva } from "@/lib/rotina";

interface AlunoLista {
  id: string;
  name: string;
  turma: string | null;
}

interface RespostaRotinas {
  papel: "ESCOLA" | "FAMILIA";
  aluno: AlunoLista;
  rotinas: RotinaSalva[];
}

export default function RotinaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Carregando...</p>}>
      <RotinaConteudo />
    </Suspense>
  );
}

/**
 * Rotina diária. Direção, secretaria e coordenação escolhem a turma, o aluno e o dia e preenchem a ficha.
 * A família vê as rotinas dos próprios filhos (somente leitura), da mais recente para a mais antiga.
 */
function RotinaConteudo() {
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const alunoParam = params.get("aluno");
  const familia = user.role === "GUARDIAN";
  const escola = user.role === "ADMIN" || (user.role === "STAFF" && user.isCoordenacao);
  const [alunos, setAlunos] = useState<AlunoLista[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [turma, setTurma] = useState("");

  useEffect(() => {
    if (!familia && !escola) return;
    apiJson<{ alunos: AlunoLista[] }>("/api/rotina")
      .then((d) => setAlunos(d.alunos))
      .catch((e) => setErroLista(e instanceof Error ? e.message : "Não foi possível carregar os alunos"));
  }, [familia, escola]);

  const turmas = useMemo(() => [...new Set((alunos ?? []).map((a) => a.turma ?? "Sem turma"))].sort(), [alunos]);
  const doAlunoParam = alunos?.find((a) => a.id === alunoParam);
  const turmaAtual = turma || (doAlunoParam ? (doAlunoParam.turma ?? "Sem turma") : "");
  const daTurma = (alunos ?? []).filter((a) => (a.turma ?? "Sem turma") === turmaAtual);

  const abrir = (id: string) => router.replace(`${pathname}?aluno=${id}`, { scroll: false });

  if (!familia && !escola) {
    return <p className="text-sm text-slate-500">Área restrita à direção, à secretaria, à coordenação e às famílias.</p>;
  }

  const selecionado = familia ? (alunoParam ?? (alunos?.length === 1 ? alunos[0].id : null)) : alunoParam;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Rotina</h1>
        <p className="mt-1 text-sm text-slate-500">
          {familia
            ? "Como foi o dia na escola: alimentação, sono, evacuação, banho, medicação e recados."
            : "Preencha a rotina do dia. A família vê a do próprio filho no app e recebe um aviso na primeira vez que o dia é salvo."}
        </p>
      </div>

      {erroLista && (
        <p role="alert" className="text-sm text-red-600">
          {erroLista}
        </p>
      )}

      {escola && alunos && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-slate-500">Turma</span>
            <select
              value={turmaAtual}
              onChange={(e) => setTurma(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">Escolha a turma</option>
              {turmas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-500">Aluno</span>
            <select
              value={selecionado ?? ""}
              onChange={(e) => e.target.value && abrir(e.target.value)}
              disabled={!turmaAtual}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">Escolha o aluno</option>
              {daTurma.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {familia && alunos && alunos.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Escolha o filho">
          {alunos.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === selecionado}
              onClick={() => abrir(f.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${f.id === selecionado ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"}`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
      {familia && alunos?.length === 0 && <p className="text-sm text-slate-500">Nenhum aluno vinculado a esta conta.</p>}

      {selecionado && <RotinasDoAluno key={selecionado} alunoId={selecionado} escola={escola} />}
    </div>
  );
}

function RotinasDoAluno({ alunoId, escola }: { alunoId: string; escola: boolean }) {
  const [dados, setDados] = useState<RespostaRotinas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [dia, setDia] = useState(() => hojeNaEscola());
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(() => {
    apiJson<RespostaRotinas>(`/api/alunos/${alunoId}/rotina?dias=${escola ? 31 : 62}`)
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar a rotina"));
  }, [alunoId, escola]);
  useEffect(carregar, [carregar]);

  if (erro)
    return (
      <p role="alert" className="text-sm text-red-600">
        {erro}
      </p>
    );
  if (!dados) return <p className="text-sm text-slate-500">Carregando rotina...</p>;

  const doDia = dados.rotinas.find((r) => r.data === dia) ?? null;

  async function apagar(data: string) {
    if (!window.confirm(`Apagar a rotina de ${dataCurta(data)}? A família deixa de ver este dia.`)) return;
    const resp = await apiFetch(`/api/alunos/${alunoId}/rotina?data=${data}`, { method: "DELETE" });
    if (resp.ok) {
      setAviso(`Rotina de ${dataCurta(data)} apagada.`);
      carregar();
    } else {
      setAviso("Não foi possível apagar. Tente de novo.");
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {dados.aluno.name}
        {dados.aluno.turma && <span className="ml-2 text-sm font-normal text-slate-500">{dados.aluno.turma}</span>}
      </h2>

      {escola && (
        <section className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Dia</span>
            <input
              type="date"
              value={dia}
              max={hojeNaEscola()}
              onChange={(e) => {
                setDia(e.target.value || hojeNaEscola());
                setAviso(null);
              }}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            {doDia && <span className="text-xs text-amber-700">Já preenchida: você está corrigindo.</span>}
          </label>
          {aviso && (
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              {aviso}
            </p>
          )}
          <RotinaFormulario
            key={`${dia}-${doDia?.atualizadoEm ?? "nova"}`}
            alunoId={alunoId}
            data={dia}
            inicial={doDia}
            onSalvo={(_r, familiaAvisada) => {
              setAviso(familiaAvisada ? "Rotina salva. A família foi avisada no app." : "Correção salva. A família já vê a versão nova.");
              carregar();
            }}
          />
        </section>
      )}

      <section className="space-y-3">
        {escola && <h3 className="font-semibold">Últimos dias</h3>}
        {dados.rotinas.length === 0 ? (
          <p className="text-sm text-slate-500">
            {escola ? "Nenhuma rotina salva nos últimos 31 dias." : "A escola ainda não publicou nenhuma rotina."}
          </p>
        ) : (
          dados.rotinas.map((r) => (
            <RotinaCartao
              key={r.data}
              rotina={r}
              acoes={
                escola ? (
                  <span className="flex gap-3 text-sm">
                    <button type="button" className="text-indigo-600" onClick={() => { setDia(r.data); setAviso(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Corrigir
                    </button>
                    <button type="button" className="text-red-600" onClick={() => apagar(r.data)}>
                      Apagar
                    </button>
                  </span>
                ) : undefined
              }
            />
          ))
        )}
      </section>
    </div>
  );
}
