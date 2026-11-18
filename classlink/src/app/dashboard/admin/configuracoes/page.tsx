"use client";

import { useEffect, useState } from "react";
import { DirecaoGuard } from "@/components/DirecaoGuard";
import { apiJson } from "@/lib/api-client";
import { formatarDataHora } from "@/lib/datas";
import {
  DEFINICOES_AREAS,
  NOME_PAPEL,
  PAPEIS_VISIBILIDADE,
  definicaoDaArea,
  descreverMudanca,
  type AreaVisibilidade,
  type Celula,
  type PapelVisibilidade,
} from "@/lib/visibilidade";

interface Historico {
  id: string;
  area: AreaVisibilidade;
  papel: PapelVisibilidade;
  liberado: boolean;
  autorNome: string;
  createdAt: string;
}
interface Dados {
  liberado: Record<AreaVisibilidade, Record<PapelVisibilidade, boolean>>;
  historico: Historico[];
}
interface Pedido {
  area: AreaVisibilidade;
  papel: PapelVisibilidade;
  liberado: boolean;
}

function Chave({
  area,
  papel,
  celula,
  ligado,
  ocupado,
  onPedir,
}: {
  area: AreaVisibilidade;
  papel: PapelVisibilidade;
  celula: Celula;
  ligado: boolean;
  ocupado: boolean;
  onPedir: (p: Pedido) => void;
}) {
  if (celula.tipo === "fixo") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500" title="Não pode ser liberado aqui">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 11h12v9H6z M8 11V8a4 4 0 018 0v3" />
        </svg>
        {celula.motivo}
      </span>
    );
  }
  const nome = `${definicaoDaArea(area).nome} para ${NOME_PAPEL[papel]}`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={nome}
      disabled={ocupado}
      onClick={() => onPedir({ area, papel, liberado: !ligado })}
      className={`inline-flex items-center gap-2 rounded-full border px-1 py-1 pr-3 text-xs font-semibold transition disabled:opacity-60 ${
        ligado ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-slate-100 text-slate-600"
      }`}
    >
      <span className={`relative h-5 w-9 rounded-full ${ligado ? "bg-emerald-500" : "bg-slate-400"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${ligado ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {ligado ? "Pode ver" : "Não vê"}
      {celula.sensivel && (
        <span className="rounded bg-amber-100 px-1 text-[10px] font-bold uppercase text-amber-900" title="Dados sensíveis: pede confirmação para liberar">
          sensível
        </span>
      )}
    </button>
  );
}

function Conteudo() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<Pedido | null>(null);

  function carregar() {
    apiJson<Dados>("/api/admin/visibilidade")
      .then(setDados)
      .catch((e: Error) => setErro(e.message || "Não foi possível carregar as configurações. Atualize a página."));
  }
  useEffect(carregar, []);

  async function salvar(p: Pedido, confirmado = false) {
    setOcupado(true);
    setAviso(null);
    try {
      await apiJson("/api/admin/visibilidade", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, confirmado }),
      });
      const def = definicaoDaArea(p.area);
      setAviso(`Salvo: ${NOME_PAPEL[p.papel]} ${p.liberado ? "agora pode ver" : "não vê mais"} ${def.nome}. Vale a partir do próximo acesso.`);
      carregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  }

  function pedir(p: Pedido) {
    const celula = definicaoDaArea(p.area).celulas[p.papel];
    // Liberar algo sensível pede confirmação; desligar (o lado seguro) vale na hora.
    if (p.liberado && celula.tipo === "configuravel" && celula.sensivel) setConfirmar(p);
    else void salvar(p);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Configurações</h1>
        <p className="text-sm text-slate-500">
          Escolha o que cada perfil pode ver no app. Só a direção muda isto. Ao desligar, a área some do menu e o servidor deixa de
          entregar os dados na hora, mesmo para quem já está com o app aberto.
        </p>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        <p>
          <strong>Regras de segurança:</strong> nada aqui libera algo que o sistema não permite (o cadeado marca o que é sempre só da
          direção). Liberar uma área marcada como <strong>sensível</strong> pede confirmação. Toda mudança fica registrada com nome, data
          e hora no histórico abaixo.
        </p>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
      {!dados && !erro && <p className="text-sm text-slate-500">Carregando...</p>}
      {aviso && (
        <p role="status" className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          {aviso}
        </p>
      )}

      {dados && (
        <>
          <section aria-labelledby="titulo-visibilidade" className="space-y-3">
            <h2 id="titulo-visibilidade" className="font-semibold">
              O que cada perfil pode ver
            </h2>
            <ul className="space-y-3">
              {DEFINICOES_AREAS.map((def) => (
                <li key={def.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold">{def.nome}</p>
                  <p className="text-xs text-slate-500">{def.descricao}</p>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {PAPEIS_VISIBILIDADE.map((papel) => (
                      <div key={papel} className="flex flex-col gap-1 rounded-lg bg-slate-50 p-2">
                        <dt className="text-xs font-medium text-slate-600">{NOME_PAPEL[papel]}</dt>
                        <dd>
                          <Chave
                            area={def.id}
                            papel={papel}
                            celula={def.celulas[papel]}
                            ligado={dados.liberado[def.id]?.[papel] ?? false}
                            ocupado={ocupado}
                            onPedir={pedir}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              A direção sempre vê tudo. Financeiro, mensalidades, baixas e contratos da escola ficam sempre só com a direção.
            </p>
          </section>

          <section aria-labelledby="titulo-historico" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 id="titulo-historico" className="font-semibold">
              Histórico de alterações
            </h2>
            {dados.historico.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma alteração ainda. Tudo está como o padrão do app.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {dados.historico.map((h) => (
                  <li key={h.id} className="py-2">
                    <span className="text-slate-500">{formatarDataHora(new Date(h.createdAt))}</span> — <strong>{h.autorNome}</strong>{" "}
                    {descreverMudanca(h.area, h.papel, h.liberado)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {confirmar && (
        <div role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
            <h2 id="titulo-confirmar" className="text-lg font-bold">
              Liberar {definicaoDaArea(confirmar.area).nome}?
            </h2>
            <p className="text-sm">
              <strong>{NOME_PAPEL[confirmar.papel]}</strong> vão passar a ver: {definicaoDaArea(confirmar.area).descricao}
            </p>
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              São dados pessoais, alguns de crianças. Libere só se este perfil precisa deles para o trabalho (LGPD: necessidade e
              finalidade). A mudança fica registrada com o seu nome.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmar(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
                Cancelar
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => salvar(confirmar, true)}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Liberar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConfiguracoesPage() {
  return (
    <DirecaoGuard>
      <Conteudo />
    </DirecaoGuard>
  );
}
