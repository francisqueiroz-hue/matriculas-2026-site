"use client";

import { useState } from "react";
import { apiJson } from "@/lib/api-client";
import {
  ACEITACAO,
  EVACUACAO,
  MAX_MEDICACOES,
  REFEICOES,
  ROTINA_VAZIA,
  SONO,
  type Medicacao,
  type RotinaDados,
  type RotinaSalva,
} from "@/lib/rotina";

const MEDICACAO_VAZIA: Medicacao = { horario: "", nome: "", dosagem: "", responsavel: "" };

/** Marca/desmarca uma opção; "Não" desmarca as outras e vice-versa (como na ficha em papel). */
export function alternarOpcao(atual: string[], valor: string): string[] {
  if (atual.includes(valor)) return atual.filter((v) => v !== valor);
  if (valor === "NAO") return ["NAO"];
  return [...atual.filter((v) => v !== "NAO"), valor];
}

const campoTexto =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800";

/**
 * Ficha da rotina de um dia, para direção e secretaria. Carrega o que já foi salvo no dia
 * (`inicial`) e salva tudo de uma vez.
 */
export function RotinaFormulario({
  alunoId,
  data,
  inicial,
  onSalvo,
}: {
  alunoId: string;
  data: string;
  inicial: RotinaSalva | null;
  onSalvo: (r: RotinaSalva, familiaAvisada: boolean) => void;
}) {
  const [r, setR] = useState<RotinaDados>(() => {
    const base = inicial ?? ROTINA_VAZIA;
    return { ...base, medicacoes: base.medicacoes.length ? base.medicacoes : [{ ...MEDICACAO_VAZIA }] };
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mudar = <K extends keyof RotinaDados>(campo: K, valor: RotinaDados[K]) => setR((v) => ({ ...v, [campo]: valor }));
  const mudarMedicacao = (i: number, campo: keyof Medicacao, valor: string) =>
    mudar(
      "medicacoes",
      r.medicacoes.map((m, j) => (j === i ? { ...m, [campo]: valor } : m)),
    );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const resp = await apiJson<{ rotina: RotinaSalva; familiaAvisada: boolean }>(`/api/alunos/${alunoId}/rotina`, {
        method: "PUT",
        body: JSON.stringify({ ...r, data }),
      });
      onSalvo(resp.rotina, resp.familiaAvisada);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4 rounded-xl border border-amber-300 bg-amber-50/40 p-4 dark:border-amber-800 dark:bg-amber-950/20">
      <fieldset>
        <legend className="text-sm font-semibold">Alimentação</legend>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-1 text-left font-normal text-slate-500">Refeição</th>
                {ACEITACAO.map((a) => (
                  <th key={a.valor} className="p-1 text-center font-normal" title={a.rotulo}>
                    <span className="text-2xl" aria-hidden="true">
                      {a.emoji}
                    </span>
                    <span className="block text-[11px] text-slate-500">{a.rotulo}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REFEICOES.map((ref) => (
                <tr key={ref.campo} className="border-t border-amber-200 dark:border-amber-900">
                  <th scope="row" className="p-1 text-left font-medium">
                    {ref.rotulo}
                  </th>
                  {ACEITACAO.map((a) => (
                    <td key={a.valor} className="p-1 text-center">
                      <input
                        type="radio"
                        name={`ref-${ref.campo}`}
                        aria-label={`${ref.rotulo}: ${a.rotulo}`}
                        className="h-5 w-5"
                        checked={r[ref.campo] === a.valor}
                        onChange={() => mudar(ref.campo, a.valor)}
                        // Tocar de novo na opção marcada desmarca (refeição que não houve).
                        onClick={() => r[ref.campo] === a.valor && mudar(ref.campo, null)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <fieldset>
          <legend className="text-sm font-semibold">Sono</legend>
          <div className="mt-1 space-y-1">
            {SONO.map((o) => (
              <label key={o.valor} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={r.sono.includes(o.valor)} onChange={() => mudar("sono", alternarOpcao(r.sono, o.valor))} />
                {o.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">Evacuação</legend>
          <div className="mt-1 space-y-1">
            {EVACUACAO.map((o) => (
              <label key={o.valor} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={r.evacuacao.includes(o.valor)}
                  onChange={() => mudar("evacuacao", alternarOpcao(r.evacuacao, o.valor))}
                />
                {o.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">Banho</legend>
          <div className="mt-1 space-y-1">
            {[
              { v: true, rotulo: "Sim" },
              { v: false, rotulo: "Não" },
            ].map((o) => (
              <label key={o.rotulo} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="banho"
                  checked={r.banho === o.v}
                  onChange={() => mudar("banho", o.v)}
                  onClick={() => r.banho === o.v && mudar("banho", null)}
                />
                {o.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset className="rounded-lg border border-blue-800/40 p-3">
        <legend className="px-1 text-sm font-semibold">Medicação</legend>
        <div className="space-y-2">
          {r.medicacoes.map((m, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[90px_1fr_120px_1fr_auto]">
              <input
                type="time"
                aria-label={`Horário da medicação ${i + 1}`}
                value={m.horario}
                onChange={(e) => mudarMedicacao(i, "horario", e.target.value)}
                className={campoTexto}
              />
              <input
                aria-label={`Nome do remédio ${i + 1}`}
                placeholder="Nome do remédio"
                maxLength={120}
                value={m.nome}
                onChange={(e) => mudarMedicacao(i, "nome", e.target.value)}
                className={campoTexto}
              />
              <input
                aria-label={`Dosagem ${i + 1}`}
                placeholder="Dosagem"
                maxLength={80}
                value={m.dosagem}
                onChange={(e) => mudarMedicacao(i, "dosagem", e.target.value)}
                className={campoTexto}
              />
              <input
                aria-label={`Responsável ${i + 1}`}
                placeholder="Responsável"
                maxLength={120}
                value={m.responsavel}
                onChange={(e) => mudarMedicacao(i, "responsavel", e.target.value)}
                className={campoTexto}
              />
              <button
                type="button"
                onClick={() =>
                  mudar(
                    "medicacoes",
                    r.medicacoes.length > 1 ? r.medicacoes.filter((_, j) => j !== i) : [{ ...MEDICACAO_VAZIA }],
                  )
                }
                className="rounded-md border border-slate-300 px-2 text-sm text-slate-500 dark:border-slate-700"
                aria-label={`Remover medicação ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {r.medicacoes.length < MAX_MEDICACOES && (
          <button
            type="button"
            onClick={() => mudar("medicacoes", [...r.medicacoes, { ...MEDICACAO_VAZIA }])}
            className="mt-2 text-sm font-medium text-indigo-600"
          >
            + Adicionar medicação
          </button>
        )}
      </fieldset>

      <label className="block">
        <span className="text-sm font-semibold">Observações</span>
        <textarea
          rows={4}
          maxLength={2000}
          value={r.observacoes ?? ""}
          onChange={(e) => mudar("observacoes", e.target.value || null)}
          className={`mt-1 ${campoTexto}`}
          placeholder="Recados do dia para a família"
        />
      </label>

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
      <button
        type="submit"
        disabled={salvando}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {salvando ? "Salvando..." : inicial ? "Salvar correção" : "Salvar e avisar a família"}
      </button>
    </form>
  );
}
