"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiJson } from "@/lib/api-client";

const DIAS = ["seg", "ter", "qua", "qui", "sex"] as const;
type Dia = (typeof DIAS)[number];
const NOME_DIA: Record<Dia, string> = { seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta" };
const REFEICOES_PADRAO = ["Lanche da manhã", "Almoço", "Lanche da tarde"];

interface Conteudo {
  refeicoes: string[];
  itens: Record<Dia, string[]>;
}

interface Cardapio {
  id: string;
  semanaInicio: string;
  classId: string | null;
  turma: string | null;
  conteudo: Conteudo;
  observacoes: string | null;
  imagemPath: string | null;
  imagemUrl: string | null;
  status: "AGENDADO" | "PUBLICADO";
  publicadoEm: string | null;
}

interface Dados {
  podeEditar: boolean;
  segundaAtual: string;
  cardapios: Cardapio[];
}

interface Turma {
  id: string;
  name: string;
}

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const rotuloSemana = (iso: string) => `${diaMes(iso)} a ${diaMes(somarDias(iso, 4))}`;

function conteudoVazio(refeicoes = REFEICOES_PADRAO): Conteudo {
  return { refeicoes: [...refeicoes], itens: Object.fromEntries(DIAS.map((d) => [d, refeicoes.map(() => "")])) as Record<Dia, string[]> };
}

/** Cardápio em cartões por dia — legível no celular. */
function VerCardapio({ c }: { c: Cardapio }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {DIAS.map((dia, i) => {
          const itens = c.conteudo.refeicoes
            .map((refeicao, r) => ({ refeicao, item: c.conteudo.itens[dia]?.[r]?.trim() }))
            .filter((x) => x.item);
          return (
            <div key={dia} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-sm font-semibold">
                {NOME_DIA[dia]} <span className="font-normal text-slate-500">{diaMes(somarDias(c.semanaInicio, i))}</span>
              </p>
              {itens.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">—</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {itens.map((x) => (
                    <li key={x.refeicao} className="text-sm">
                      <span className="block text-xs font-medium uppercase text-slate-500">{x.refeicao}</span>
                      {x.item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {c.observacoes && <p className="text-sm text-slate-600 dark:text-slate-300">Observações: {c.observacoes}</p>}
      {c.imagemUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.imagemUrl} alt={`Cardápio da semana ${rotuloSemana(c.semanaInicio)}`} className="max-h-96 rounded-lg border border-slate-200" />
      )}
    </div>
  );
}

interface Formulario {
  id: string | null;
  semanaInicio: string;
  classId: string;
  conteudo: Conteudo;
  observacoes: string;
  imagemPath: string | null;
}

function Editor({
  inicial,
  semanas,
  turmas,
  onSalvo,
  onCancelar,
}: {
  inicial: Formulario;
  semanas: string[];
  turmas: Turma[];
  onSalvo: (msg: string) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState<Formulario>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const editando = f.id !== null;

  function setItem(dia: Dia, r: number, valor: string) {
    setF((atual) => ({
      ...atual,
      conteudo: { ...atual.conteudo, itens: { ...atual.conteudo.itens, [dia]: atual.conteudo.itens[dia].map((v, i) => (i === r ? valor : v)) } },
    }));
  }
  function renomearRefeicao(r: number, nome: string) {
    setF((a) => ({ ...a, conteudo: { ...a.conteudo, refeicoes: a.conteudo.refeicoes.map((n, i) => (i === r ? nome : n)) } }));
  }
  function adicionarRefeicao() {
    setF((a) => ({
      ...a,
      conteudo: {
        refeicoes: [...a.conteudo.refeicoes, "Nova refeição"],
        itens: Object.fromEntries(DIAS.map((d) => [d, [...a.conteudo.itens[d], ""]])) as Record<Dia, string[]>,
      },
    }));
  }
  function removerRefeicao(r: number) {
    setF((a) => ({
      ...a,
      conteudo: {
        refeicoes: a.conteudo.refeicoes.filter((_, i) => i !== r),
        itens: Object.fromEntries(DIAS.map((d) => [d, a.conteudo.itens[d].filter((_, i) => i !== r)])) as Record<Dia, string[]>,
      },
    }));
  }

  async function enviarFoto(arquivo: File) {
    setEnviandoFoto(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("file", arquivo);
      const res = await apiFetch("/api/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível enviar a foto");
      setF((a) => ({ ...a, imagemPath: data.path }));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar a foto");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const corpo = {
        conteudo: { ...f.conteudo, refeicoes: f.conteudo.refeicoes.map((r) => r.trim() || "Refeição") },
        observacoes: f.observacoes.trim() || null,
        imagemPath: f.imagemPath,
      };
      if (editando) {
        await apiJson(`/api/cardapios/${f.id}`, { method: "PATCH", body: JSON.stringify(corpo) });
        onSalvo("Cardápio atualizado.");
      } else {
        const res = await apiJson<{ cardapio: Cardapio }>("/api/cardapios", {
          method: "POST",
          body: JSON.stringify({ ...corpo, semanaInicio: f.semanaInicio, classId: f.classId || null }),
        });
        onSalvo(
          res.cardapio.status === "PUBLICADO"
            ? `Cardápio da semana ${rotuloSemana(f.semanaInicio)} publicado no Mural.`
            : `Cardápio da semana ${rotuloSemana(f.semanaInicio)} agendado — sai na segunda-feira, às 6h.`,
        );
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4 rounded-xl border border-indigo-200 bg-white p-4 dark:border-indigo-900 dark:bg-slate-900">
      <h2 className="font-semibold">{editando ? `Editar cardápio — semana ${rotuloSemana(f.semanaInicio)}` : "Novo cardápio"}</h2>
      {!editando && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Semana</span>
            <select
              value={f.semanaInicio}
              onChange={(e) => setF((a) => ({ ...a, semanaInicio: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            >
              {semanas.map((s, i) => (
                <option key={s} value={s}>
                  {rotuloSemana(s)}
                  {i === 0 ? " (esta semana)" : i === 1 ? " (próxima)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Para</span>
            <select
              value={f.classId}
              onChange={(e) => setF((a) => ({ ...a, classId: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">Toda a escola</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  Turma {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div>
        <p className="mb-1 text-sm font-medium">Refeições</p>
        <div className="flex flex-wrap gap-2">
          {f.conteudo.refeicoes.map((nome, r) => (
            <span key={r} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white pl-2 dark:border-slate-700 dark:bg-slate-800">
              <input
                aria-label={`Nome da refeição ${r + 1}`}
                value={nome}
                maxLength={40}
                onChange={(e) => renomearRefeicao(r, e.target.value)}
                className="w-36 bg-transparent py-1 text-sm outline-none"
              />
              {f.conteudo.refeicoes.length > 1 && (
                <button type="button" onClick={() => removerRefeicao(r)} aria-label={`Remover ${nome}`} className="px-2 text-slate-400 hover:text-red-600">
                  ×
                </button>
              )}
            </span>
          ))}
          {f.conteudo.refeicoes.length < 8 && (
            <button type="button" onClick={adicionarRefeicao} className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50">
              + refeição
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        {DIAS.map((dia, i) => (
          <fieldset key={dia} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-1 text-sm font-semibold">
              {NOME_DIA[dia]} <span className="font-normal text-slate-500">{diaMes(somarDias(f.semanaInicio, i))}</span>
            </legend>
            {f.conteudo.refeicoes.map((nome, r) => (
              <label key={r} className="mt-2 block text-xs">
                <span className="mb-0.5 block font-medium uppercase text-slate-500">{nome || "Refeição"}</span>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={f.conteudo.itens[dia][r] ?? ""}
                  onChange={(e) => setItem(dia, r, e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Observações (opcional)</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={f.observacoes}
          onChange={(e) => setF((a) => ({ ...a, observacoes: e.target.value }))}
          placeholder="Ex.: o cardápio pode mudar conforme a disponibilidade dos alimentos."
          className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>

      <div className="text-sm">
        <span className="mb-1 block font-medium">Foto do cardápio impresso (opcional)</span>
        {f.imagemPath ? (
          <p className="flex items-center gap-2 text-emerald-700">
            ✓ Foto anexada
            <button type="button" onClick={() => setF((a) => ({ ...a, imagemPath: null }))} className="text-xs text-red-600 underline">
              remover
            </button>
          </p>
        ) : (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={enviandoFoto}
            onChange={(e) => e.target.files?.[0] && enviarFoto(e.target.files[0])}
            className="text-sm"
          />
        )}
        {enviandoFoto && <p className="text-xs text-slate-500">Enviando foto...</p>}
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={salvando || enviandoFoto}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Agendar cardápio"}
        </button>
        <button type="button" onClick={onCancelar} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function CardapioPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [form, setForm] = useState<Formulario | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(() => {
    apiJson<Dados>("/api/cardapios")
      .then((d) => {
        setDados(d);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar"));
  }, []);

  useEffect(carregar, [carregar]);
  useEffect(() => {
    if (dados?.podeEditar && turmas.length === 0) {
      apiJson<{ classes: Turma[] }>("/api/admin/classes")
        .then((d) => setTurmas(d.classes))
        .catch(() => undefined);
    }
  }, [dados?.podeEditar, turmas.length]);

  const semanas = useMemo(() => (dados ? Array.from({ length: 12 }, (_, i) => somarDias(dados.segundaAtual, 7 * i)) : []), [dados]);
  const daSemana = dados?.cardapios.filter((c) => c.semanaInicio === dados.segundaAtual && c.status === "PUBLICADO") ?? [];
  const agendados = (dados?.cardapios.filter((c) => c.status === "AGENDADO") ?? []).sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio));
  const anteriores = dados?.cardapios.filter((c) => c.status === "PUBLICADO" && c.semanaInicio < dados.segundaAtual) ?? [];

  function novo() {
    if (!dados) return;
    // Sugere a primeira semana ainda sem cardápio da escola toda.
    const ocupadas = new Set(dados.cardapios.filter((c) => !c.classId).map((c) => c.semanaInicio));
    const semana = semanas.find((s) => !ocupadas.has(s)) ?? semanas[0];
    setForm({ id: null, semanaInicio: semana, classId: "", conteudo: conteudoVazio(), observacoes: "", imagemPath: null });
    setAviso(null);
  }

  function editar(c: Cardapio) {
    setForm({ id: c.id, semanaInicio: c.semanaInicio, classId: c.classId ?? "", conteudo: c.conteudo, observacoes: c.observacoes ?? "", imagemPath: c.imagemPath });
    setAviso(null);
  }

  async function acao(fn: () => Promise<string>) {
    try {
      setAviso(await fn());
      carregar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Erro");
    }
  }

  const repetir = (c: Cardapio) =>
    acao(async () => {
      const resposta = prompt("Repetir este cardápio em quantas das próximas semanas? (1 a 12)", "4");
      const semanasN = Number(resposta);
      if (!resposta || !Number.isInteger(semanasN) || semanasN < 1 || semanasN > 12) return "Nada foi alterado.";
      const r = await apiJson<{ criadas: string[]; puladas: string[] }>(`/api/cardapios/${c.id}/duplicar`, {
        method: "POST",
        body: JSON.stringify({ semanas: semanasN }),
      });
      return (
        `${r.criadas.length} semana(s) agendada(s)${r.criadas.length ? `: ${r.criadas.map(rotuloSemana).join("; ")}` : ""}.` +
        (r.puladas.length ? ` Já tinham cardápio: ${r.puladas.map(rotuloSemana).join("; ")}.` : "")
      );
    });

  const publicarAgora = (c: Cardapio) =>
    acao(async () => {
      if (!confirm(`Publicar agora o cardápio da semana ${rotuloSemana(c.semanaInicio)}? As famílias recebem a notificação na hora.`)) return "Nada foi alterado.";
      await apiJson(`/api/cardapios/${c.id}/publicar`, { method: "POST" });
      return "Cardápio publicado no Mural.";
    });

  const excluir = (c: Cardapio) =>
    acao(async () => {
      if (!confirm(`Excluir o cardápio da semana ${rotuloSemana(c.semanaInicio)}${c.status === "PUBLICADO" ? " (a publicação do Mural também sai)" : ""}?`)) {
        return "Nada foi alterado.";
      }
      await apiJson(`/api/cardapios/${c.id}`, { method: "DELETE" });
      return "Cardápio excluído.";
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Cardápio</h1>
          <p className="text-sm text-slate-500">
            {dados?.podeEditar
              ? "Cadastre os cardápios com antecedência: toda segunda-feira, às 6h, o da semana é publicado no Mural e as famílias recebem uma notificação."
              : "O que as crianças vão comer nesta semana."}
          </p>
        </div>
        {dados?.podeEditar && !form && (
          <button onClick={novo} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Novo cardápio
          </button>
        )}
      </div>

      {aviso && (
        <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200" role="status">
          {aviso}
        </p>
      )}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-slate-500">Carregando...</p>}

      {form && dados && (
        <Editor
          key={form.id ?? "novo"}
          inicial={form}
          semanas={semanas}
          turmas={turmas}
          onSalvo={(msg) => {
            setForm(null);
            setAviso(msg);
            carregar();
          }}
          onCancelar={() => setForm(null)}
        />
      )}

      {dados && (
        <section className="space-y-3">
          <h2 className="font-semibold">Esta semana ({rotuloSemana(dados.segundaAtual)})</h2>
          {daSemana.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:bg-slate-900">
              {dados.podeEditar ? "O cardápio desta semana ainda não foi publicado." : "O cardápio desta semana ainda não foi publicado pela escola."}
            </p>
          ) : (
            daSemana.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{c.turma ? `Turma ${c.turma}` : "Toda a escola"}</p>
                  {dados.podeEditar && (
                    <div className="flex gap-3 text-xs">
                      <button onClick={() => editar(c)} className="text-indigo-600 hover:underline">
                        Editar
                      </button>
                      <button onClick={() => repetir(c)} className="text-indigo-600 hover:underline">
                        Repetir nas próximas semanas
                      </button>
                      <button onClick={() => excluir(c)} className="text-red-600 hover:underline">
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
                <VerCardapio c={c} />
              </div>
            ))
          )}
        </section>
      )}

      {dados?.podeEditar && (
        <section className="space-y-2">
          <h2 className="font-semibold">Agendados</h2>
          {agendados.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum cardápio agendado. Use “Novo cardápio” ou “Repetir nas próximas semanas”.</p>
          ) : (
            <ul className="space-y-2">
              {agendados.map((c) => (
                <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>
                      <span className="font-semibold">Semana {rotuloSemana(c.semanaInicio)}</span> · {c.turma ? `Turma ${c.turma}` : "Toda a escola"}
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        Sai em {diaMes(c.semanaInicio)}, às 6h
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <button onClick={() => editar(c)} className="text-indigo-600 hover:underline">
                        Editar
                      </button>
                      <button onClick={() => repetir(c)} className="text-indigo-600 hover:underline">
                        Repetir nas próximas semanas
                      </button>
                      <button onClick={() => publicarAgora(c)} className="text-indigo-600 hover:underline">
                        Publicar agora
                      </button>
                      <button onClick={() => excluir(c)} className="text-red-600 hover:underline">
                        Excluir
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {anteriores.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer text-sm font-semibold">Semanas anteriores</summary>
          <div className="mt-3 space-y-4">
            {anteriores.map((c) => (
              <div key={c.id}>
                <p className="mb-2 text-sm font-medium">
                  Semana {rotuloSemana(c.semanaInicio)} · {c.turma ? `Turma ${c.turma}` : "Toda a escola"}
                </p>
                <VerCardapio c={c} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
