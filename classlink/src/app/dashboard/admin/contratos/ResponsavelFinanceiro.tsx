"use client";

import { useEffect, useId, useState } from "react";
import { apiJson } from "@/lib/api-client";

interface ResponsavelOpcao {
  id: string;
  name: string;
  relation: string | null;
}

const btn =
  "inline-flex min-h-10 items-center justify-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60";

function rotulo(r: ResponsavelOpcao) {
  return r.relation ? `${r.name} (${r.relation})` : r.name;
}

/**
 * A direção indica qual responsável é o financeiro (quem recebe, preenche e assina o contrato).
 * Só um por aluno; a troca fica no histórico do cadastro.
 */
export function EscolherFinanceiro({
  studentId,
  responsaveis,
  atualId,
  onSalvo,
}: {
  studentId: string;
  responsaveis: ResponsavelOpcao[];
  atualId?: string;
  onSalvo: () => void;
}) {
  const id = useId();
  const [escolhido, setEscolhido] = useState(atualId ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!escolhido) return;
    setSalvando(true);
    setErro(null);
    try {
      await apiJson("/api/admin/contratos/responsavel-financeiro", {
        method: "PUT",
        body: JSON.stringify({ studentId, guardianId: escolhido }),
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Responsável financeiro
      </label>
      <select
        id={id}
        value={escolhido}
        onChange={(e) => setEscolhido(e.target.value)}
        className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
      >
        <option value="">Escolha o responsável financeiro…</option>
        {responsaveis.map((r) => (
          <option key={r.id} value={r.id}>
            {rotulo(r)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!escolhido || escolhido === atualId || salvando}
        onClick={salvar}
        className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}
      >
        {salvando ? "Salvando…" : "Salvar"}
      </button>
      {erro && (
        <p role="alert" className="w-full text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}

interface Pendente {
  id: string;
  name: string;
  turma: string;
  responsaveis: ResponsavelOpcao[];
}

/**
 * Alunos com dois ou mais responsáveis em que nada indica o financeiro. Enquanto estiverem
 * aqui, contrato novo não é enviado e boleto novo sai sem aviso (para não ir ao pedagógico).
 * `versao` muda quando a lista de contratos recarrega, para esta lista acompanhar.
 */
export function PainelResponsavelFinanceiro({ versao, onMudou }: { versao: unknown; onMudou: () => void }) {
  const [pendentes, setPendentes] = useState<Pendente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    apiJson<{ pendentes: Pendente[] }>("/api/admin/contratos/responsavel-financeiro")
      .then((d) => ativo && (setPendentes(d.pendentes), setErro(null)))
      .catch((err) => ativo && setErro(err instanceof Error ? err.message : "Erro ao carregar"));
    return () => {
      ativo = false;
    };
  }, [versao]);

  if (erro) {
    return (
      <p role="alert" className="text-sm text-red-600">
        Não foi possível conferir os responsáveis financeiros: {erro}
      </p>
    );
  }
  if (!pendentes || pendentes.length === 0) return null;

  return (
    <details className="rounded-xl border border-amber-300 bg-amber-50" open={pendentes.length <= 5}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-amber-900">
        {pendentes.length} aluno(s) com mais de um responsável sem o responsável financeiro indicado
      </summary>
      <div className="space-y-3 border-t border-amber-200 px-4 py-3 text-sm text-amber-900">
        <p>
          Contrato e boleto vão só para o responsável financeiro, nunca para o pedagógico. Nesses alunos nada no cadastro indica
          quem é (nem contrato assinado, nem CPF de cobrança). Enquanto não indicar, o app não envia contrato novo a eles e o boleto
          novo sai sem aviso.
        </p>
        <ul className="space-y-3">
          {pendentes.map((p) => (
            <li key={p.id} className="rounded-lg border border-amber-200 bg-white p-3">
              <p className="mb-2 font-medium text-slate-900">
                {p.name} <span className="font-normal text-slate-500">· {p.turma}</span>
              </p>
              <EscolherFinanceiro studentId={p.id} responsaveis={p.responsaveis} onSalvo={onMudou} />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
