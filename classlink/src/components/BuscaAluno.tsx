"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiJson } from "@/lib/api-client";
import { filtrarAlunos, idadeEmAnos, linkLigar, linkWhatsApp, telefoneParaExibir } from "@/lib/busca-aluno";

export interface AlunoConsulta {
  id: string;
  name: string;
  birthDate: string | null;
  class: { id: string; name: string } | null;
  guardians: {
    relation: string | null;
    guardian: { id: string; name: string; phone: string | null; email: string | null };
  }[];
}

const MAX_RESULTADOS = 8;

const dataBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "short" }).format(new Date(iso));

/**
 * Busca instantânea de aluno para direção e coordenação. Fica no alto da tela, filtra a cada
 * tecla (sem acento, nome parcial, turma, responsável ou telefone) e abre o cartão de contato
 * do aluno com um toque, com botões para ligar ou chamar no WhatsApp o responsável.
 *
 * Atalhos: "/" leva ao campo de busca; Enter abre o primeiro resultado; Esc limpa.
 */
export function BuscaAluno({
  autoFocus = false,
  onTermoChange,
  onVerCadastro,
}: {
  autoFocus?: boolean;
  /** Avisado a cada tecla, para a tela filtrar também a própria lista. */
  onTermoChange?: (termo: string) => void;
  /** Quando existir, o cartão mostra "Ver cadastro completo" (tela de Alunos da direção). */
  onVerCadastro?: (alunoId: string) => void;
}) {
  const [alunos, setAlunos] = useState<AlunoConsulta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [termo, setTermo] = useState("");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const idLista = useId();

  function carregar() {
    apiJson<{ alunos: AlunoConsulta[] }>("/api/alunos/busca")
      .then((d) => setAlunos(d.alunos))
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar os alunos"));
  }
  useEffect(carregar, []);

  // "/" em qualquer lugar da tela (fora de outro campo) leva direto à busca.
  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      e.preventDefault();
      campo.current?.focus();
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  const resultados = useMemo(() => (alunos && termo.trim() ? filtrarAlunos(alunos, termo) : []), [alunos, termo]);
  // Um único resultado já abre sozinho: em emergência, menos um toque.
  const aberto = abertoId ?? (resultados.length === 1 ? resultados[0].id : null);
  const alunoAberto = aberto ? resultados.find((a) => a.id === aberto) ?? alunos?.find((a) => a.id === aberto) ?? null : null;

  function mudarTermo(valor: string) {
    setTermo(valor);
    setAbertoId(null);
    onTermoChange?.(valor);
  }

  return (
    <section
      aria-label="Buscar aluno"
      className="rounded-xl border border-indigo-200 bg-white p-3 shadow-sm dark:border-indigo-900 dark:bg-slate-900"
    >
      <label htmlFor={`${idLista}-campo`} className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
        Buscar aluno
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`${idLista}-campo`}
          ref={campo}
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={termo}
          onChange={(e) => mudarTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && resultados[0]) {
              e.preventDefault();
              setAbertoId(resultados[0].id);
            } else if (e.key === "Escape") {
              mudarTermo("");
            }
          }}
          placeholder="Nome do aluno, responsável, turma ou telefone"
          aria-controls={`${idLista}-resultados`}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800"
        />
        {termo && (
          <button
            type="button"
            onClick={() => {
              mudarTermo("");
              campo.current?.focus();
            }}
            className="shrink-0 rounded-md px-2 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Limpar
          </button>
        )}
      </div>

      <div id={`${idLista}-resultados`} aria-live="polite">
        {erro ? (
          <p className="mt-2 text-sm text-red-600">
            {erro}{" "}
            <button
              type="button"
              onClick={() => {
                setErro(null);
                carregar();
              }}
              className="font-semibold underline"
            >
              Tentar de novo
            </button>
          </p>
        ) : !termo.trim() ? null : alunos === null ? (
          <p className="mt-2 text-sm text-slate-500">Carregando alunos...</p>
        ) : resultados.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhum aluno encontrado para &ldquo;{termo.trim()}&rdquo;.</p>
        ) : (
          <>
            {resultados.length > 1 && (
              <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {resultados.slice(0, MAX_RESULTADOS).map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setAbertoId(a.id === aberto ? null : a.id)}
                      aria-expanded={a.id === aberto}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-indigo-50 dark:hover:bg-indigo-950 ${
                        a.id === aberto ? "bg-indigo-50 dark:bg-indigo-950" : ""
                      }`}
                    >
                      <span className="font-medium">{a.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">{a.class?.name ?? "Sem turma"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {resultados.length > MAX_RESULTADOS && (
              <p className="mt-1 text-xs text-slate-500">
                Mostrando {MAX_RESULTADOS} de {resultados.length}. Digite mais letras para refinar.
              </p>
            )}
            {alunoAberto && <CartaoAluno aluno={alunoAberto} onVerCadastro={onVerCadastro} />}
          </>
        )}
      </div>
    </section>
  );
}

function CartaoAluno({ aluno, onVerCadastro }: { aluno: AlunoConsulta; onVerCadastro?: (id: string) => void }) {
  const idade = idadeEmAnos(aluno.birthDate);
  return (
    <article className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800" aria-label={`Cadastro de ${aluno.name}`}>
      <h2 className="text-base font-bold">{aluno.name}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Turma: <strong>{aluno.class?.name ?? "sem turma"}</strong>
        {aluno.birthDate && (
          <>
            {" · "}Nascimento: {dataBR(aluno.birthDate)}
            {idade !== null && ` (${idade} ${idade === 1 ? "ano" : "anos"})`}
          </>
        )}
      </p>

      <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Responsáveis</h3>
      {aluno.guardians.length === 0 ? (
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">Nenhum responsável vinculado a este aluno.</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {aluno.guardians.map((g) => {
            const ligar = linkLigar(g.guardian.phone);
            const whats = linkWhatsApp(g.guardian.phone);
            return (
              <li key={g.guardian.id} className="rounded-md bg-white p-2 dark:bg-slate-900">
                <p className="text-sm font-medium">
                  {g.guardian.name}
                  {g.relation && <span className="font-normal text-slate-500"> ({g.relation})</span>}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {g.guardian.phone ? telefoneParaExibir(g.guardian.phone) : "Sem telefone cadastrado"}
                  {g.guardian.email && <span className="block break-all text-xs text-slate-500">{g.guardian.email}</span>}
                </p>
                {(ligar || whats) && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {ligar && (
                      <a
                        href={ligar}
                        className="inline-flex min-h-10 items-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Ligar
                      </a>
                    )}
                    {whats && (
                      <a
                        href={whats}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-10 items-center rounded-md border border-emerald-600 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href={`/dashboard/fichas?aluno=${aluno.id}`} className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">
          Ficha da matrícula
        </Link>
        {onVerCadastro && (
          <button type="button" onClick={() => onVerCadastro(aluno.id)} className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">
            Ver cadastro completo
          </button>
        )}
      </div>
    </article>
  );
}
