"use client";

import { useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";
import pacoteOutDez2026 from "@/dados/cardapios-out-dez-2026.json";

const DIAS = ["seg", "ter", "qua", "qui", "sex"] as const;
const NOME_DIA = { seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex" } as const;

interface Segmento {
  nome: string;
  sugestao?: string[];
  /** Turmas que nunca são sugeridas para este cardápio (ex.: 2º, 3º e 4º ano). */
  naoSugerir?: string[];
  conteudo: { refeicoes: string[]; itens: Record<(typeof DIAS)[number], string[]> };
}
interface Pacote {
  versao: 1;
  fonte?: string;
  semanas: string[];
  observacoes?: string | null;
  segmentos: Segmento[];
}
interface Turma {
  id: string;
  name: string;
}

/** Pacotes que já vêm no ClassLink (cardápios enviados pela escola). */
const PACOTES: { id: string; titulo: string; pacote: Pacote }[] = [
  { id: "out-dez-2026", titulo: "Cardápios de 12/10 a 18/12/2026 (nutricionista)", pacote: pacoteOutDez2026 as Pacote },
];

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Sem acentos, sem º/°, minúsculas: "2º Ano A" → "2 ano a". */
const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[º°ª]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

/** Sugere o segmento de cada turma pelo nome (a gestão confere e ajusta antes de importar). */
export function sugerirTurmas(pacote: Pacote, turmas: Turma[]): Record<number, string[]> {
  const usadas = new Set<string>();
  const mapa: Record<number, string[]> = {};
  pacote.segmentos.forEach((seg, i) => {
    mapa[i] = turmas
      .filter((t) => {
        // O padrão começa no início de uma palavra: "1 ano" casa com "1º Ano A", não com "11º Ano".
        const nome = ` ${normalizar(t.name)} `;
        const casa = (padrao: string) => nome.includes(` ${normalizar(padrao)}`);
        if (usadas.has(t.id) || (seg.naoSugerir ?? []).some(casa)) return false;
        return (seg.sugestao ?? []).some(casa);
      })
      .map((t) => t.id);
    mapa[i].forEach((id) => usadas.add(id));
  });
  return mapa;
}

export function ImportarCardapios({
  turmas,
  segundaAtual,
  onImportado,
  onFechar,
}: {
  turmas: Turma[];
  segundaAtual: string;
  onImportado: (msg: string) => void;
  onFechar: () => void;
}) {
  const [pacote, setPacote] = useState<Pacote | null>(null);
  const [destinos, setDestinos] = useState<Record<number, string[]>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [verSegmento, setVerSegmento] = useState<number | null>(null);

  function escolher(p: Pacote) {
    setPacote(p);
    setDestinos(sugerirTurmas(p, turmas));
    setErro(null);
  }

  async function lerArquivo(arquivo: File) {
    try {
      const p = JSON.parse(await arquivo.text()) as Pacote;
      if (p?.versao !== 1 || !Array.isArray(p.semanas) || !Array.isArray(p.segmentos)) throw new Error();
      escolher(p);
    } catch {
      setErro("Arquivo inválido: use um pacote de cardápios do ClassLink (.json).");
    }
  }

  const semanasFuturas = useMemo(() => pacote?.semanas.filter((s) => s >= segundaAtual) ?? [], [pacote, segundaAtual]);
  const semanasPassadas = (pacote?.semanas.length ?? 0) - semanasFuturas.length;
  const turmasMarcadas = Object.values(destinos).flat();
  const repetidas = turmasMarcadas.filter((id, i) => turmasMarcadas.indexOf(id) !== i);
  const semDestino = turmas.filter((t) => !turmasMarcadas.includes(t.id));
  const total = semanasFuturas.length * turmasMarcadas.length;

  function alternar(seg: number, turmaId: string) {
    setDestinos((d) => ({ ...d, [seg]: d[seg]?.includes(turmaId) ? d[seg].filter((x) => x !== turmaId) : [...(d[seg] ?? []), turmaId] }));
  }

  async function importar() {
    if (!pacote) return;
    if (
      !confirm(
        `Agendar ${total} cardápio(s): ${semanasFuturas.length} semana(s) × ${turmasMarcadas.length} turma(s)? Cada um é publicado na sua segunda-feira, às 6h.`,
      )
    ) {
      return;
    }
    setImportando(true);
    setErro(null);
    try {
      const r = await apiJson<{ criados: number; jaExistiam: number; semanasIgnoradas: string[]; publicadosAgora: number }>("/api/cardapios/importar", {
        method: "POST",
        body: JSON.stringify({
          semanas: pacote.semanas,
          observacoes: pacote.observacoes ?? null,
          segmentos: pacote.segmentos
            .map((s, i) => ({ nome: s.nome, conteudo: s.conteudo, classIds: destinos[i] ?? [] }))
            .filter((s) => s.classIds.length > 0),
        }),
      });
      onImportado(
        `${r.criados} cardápio(s) agendado(s).` +
          (r.jaExistiam ? ` ${r.jaExistiam} já existiam e foram mantidos.` : "") +
          (r.semanasIgnoradas.length ? ` Semanas já passadas ignoradas: ${r.semanasIgnoradas.map(diaMes).join(", ")}.` : "") +
          (r.publicadosAgora ? ` ${r.publicadosAgora} publicado(s) agora (semana atual).` : ""),
      );
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setImportando(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-indigo-200 bg-white p-4 dark:border-indigo-900 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Importar cardápios</h2>
          <p className="text-xs text-slate-500">Agenda vários cardápios de uma vez. Nada que já exista é sobrescrito.</p>
        </div>
        <button type="button" onClick={onFechar} className="text-sm text-slate-500 hover:underline">
          Fechar
        </button>
      </div>

      {!pacote && (
        <div className="space-y-3 text-sm">
          {PACOTES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => escolher(p.pacote)}
              className="block w-full rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-left hover:bg-emerald-100"
            >
              <span className="font-semibold text-emerald-900">{p.titulo}</span>
              <span className="block text-xs text-emerald-800">
                {p.pacote.segmentos.length} cardápios ({p.pacote.segmentos.map((s) => s.nome).join(", ")}) · {p.pacote.semanas.length} semanas
              </span>
            </button>
          ))}
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Ou envie um pacote (.json):</span>
            <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
          </label>
        </div>
      )}

      {pacote && (
        <div className="space-y-4 text-sm">
          <p>
            <strong>{semanasFuturas.length} semana(s)</strong>: {semanasFuturas.map((s) => `${diaMes(s)}–${diaMes(somarDias(s, 4))}`).join(" · ")}
            {semanasPassadas > 0 && <span className="text-slate-500"> ({semanasPassadas} já passada(s), ignorada(s))</span>}
          </p>

          <div className="space-y-3">
            <p className="font-medium">Quais turmas recebem cada cardápio?</p>
            {pacote.segmentos.map((seg, i) => (
              <div key={seg.nome} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{seg.nome}</p>
                  <button type="button" onClick={() => setVerSegmento(verSegmento === i ? null : i)} className="text-xs text-indigo-600 hover:underline">
                    {verSegmento === i ? "Esconder cardápio" : "Ver cardápio"}
                  </button>
                </div>
                {verSegmento === i && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead>
                        <tr>
                          <th className="p-1 text-left"></th>
                          {DIAS.map((d) => (
                            <th key={d} className="p-1 text-left">
                              {NOME_DIA[d]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {seg.conteudo.refeicoes.map((r, ri) => (
                          <tr key={r} className="border-t border-slate-100 align-top dark:border-slate-800">
                            <th className="p-1 text-left font-medium text-slate-500">{r}</th>
                            {DIAS.map((d) => (
                              <td key={d} className="p-1">
                                {seg.conteudo.itens[d][ri]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {turmas.length === 0 && <span className="text-xs text-slate-500">Nenhuma turma cadastrada.</span>}
                  {turmas.map((t) => {
                    const marcada = destinos[i]?.includes(t.id) ?? false;
                    const emOutro = !marcada && turmasMarcadas.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                          marcada ? "border-indigo-400 bg-indigo-50 text-indigo-900" : "border-slate-300 text-slate-600"
                        } ${emOutro ? "opacity-50" : ""}`}
                      >
                        <input type="checkbox" checked={marcada} onChange={() => alternar(i, t.id)} className="h-3 w-3" />
                        {t.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {semDestino.length > 0 && (
            <p className="text-xs text-amber-700">Sem cardápio: {semDestino.map((t) => t.name).join(", ")}.</p>
          )}
          {repetidas.length > 0 && <p className="text-xs text-red-600">Cada turma deve ficar em um só cardápio.</p>}
          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={importando || total === 0 || repetidas.length > 0}
              onClick={importar}
              className="rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {importando ? "Agendando..." : `Agendar ${total} cardápio(s)`}
            </button>
            <button type="button" onClick={() => setPacote(null)} className="rounded-md border border-slate-300 px-4 py-2">
              Voltar
            </button>
          </div>
        </div>
      )}
      {!pacote && erro && <p className="text-sm text-red-600">{erro}</p>}
    </section>
  );
}
