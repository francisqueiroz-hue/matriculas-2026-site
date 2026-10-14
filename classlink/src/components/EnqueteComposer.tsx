"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { ESCOLHAS_MAX, TIPOS_PERGUNTA } from "@/lib/enquetes";

interface ClassOption {
  id: string;
  name: string;
}
interface StudentOption {
  id: string;
  name: string;
}
interface PerguntaForm {
  chave: number;
  tipo: string;
  texto: string;
  obrigatoria: boolean;
  escolhas: string; // uma opção por linha (só para múltipla escolha)
}

let proximaChave = 1;
const nova = (tipo = "NOTA", texto = ""): PerguntaForm => ({ chave: proximaChave++, tipo, texto, obrigatoria: true, escolhas: "" });

/** Modelo pronto de pesquisa de satisfação (a escola pode editar tudo antes de publicar). */
function modeloSatisfacao(): PerguntaForm[] {
  return [
    nova("NOTA", "Como você avalia a escola de forma geral?"),
    nova("NOTA", "Como você avalia a comunicação da escola com as famílias?"),
    nova("NOTA", "Como você avalia o atendimento da secretaria e da coordenação?"),
    nova("SIM_NAO", "Você recomendaria a escola a outras famílias?"),
    { ...nova("TEXTO", "O que podemos melhorar? (opcional)"), obrigatoria: false },
  ];
}

export function EnqueteComposer({ onCreated }: { onCreated: () => void }) {
  const user = useCurrentUser();
  const [aberto, setAberto] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [audience, setAudience] = useState<"SCHOOL" | "CLASS" | "STUDENT">(user.role === "STAFF" ? "CLASS" : "SCHOOL");
  const [classId, setClassId] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [identificada, setIdentificada] = useState(false);
  const [prazo, setPrazo] = useState("");
  const [perguntas, setPerguntas] = useState<PerguntaForm[]>([nova()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    apiJson<{ classes: ClassOption[] }>("/api/admin/classes")
      .then((data) => {
        setClasses(data.classes);
        if (data.classes.length && user.role === "STAFF") setClassId((atual) => atual || data.classes[0].id);
      })
      .catch(() => setError("Não foi possível carregar as turmas. Atualize a página para tentar de novo."));
  }, [aberto, user.role]);

  useEffect(() => {
    if (audience !== "STUDENT" || !classId) return;
    apiJson<{ students: StudentOption[] }>(`/api/admin/students?classId=${classId}`)
      .then((data) => setStudents(data.students))
      .catch(() => setError("Não foi possível carregar os alunos da turma. Selecione a turma de novo."));
  }, [audience, classId]);

  function atualizar(chave: number, parte: Partial<PerguntaForm>) {
    setPerguntas((lista) => lista.map((p) => (p.chave === chave ? { ...p, ...parte } : p)));
  }
  function mover(indice: number, delta: -1 | 1) {
    setPerguntas((lista) => {
      const alvo = indice + delta;
      if (alvo < 0 || alvo >= lista.length) return lista;
      const copia = [...lista];
      [copia[indice], copia[alvo]] = [copia[alvo], copia[indice]];
      return copia;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiJson("/api/enquetes", {
        method: "POST",
        body: JSON.stringify({
          titulo,
          descricao: descricao || undefined,
          audience,
          classId: audience === "CLASS" || audience === "STUDENT" ? classId : undefined,
          alunoId: audience === "STUDENT" ? alunoId : undefined,
          anonima: audience === "STUDENT" ? false : !identificada,
          prazo: prazo ? new Date(prazo).toISOString() : undefined,
          perguntas: perguntas.map((p) => ({
            tipo: p.tipo,
            texto: p.texto,
            obrigatoria: p.obrigatoria,
            opcoes: p.tipo === "ESCOLHA" ? { escolhas: p.escolhas.split("\n").map((l) => l.trim()).filter(Boolean) } : undefined,
          })),
        }),
      });
      setTitulo("");
      setDescricao("");
      setPrazo("");
      setPerguntas([nova()]);
      setAberto(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar a enquete");
    } finally {
      setLoading(false);
    }
  }

  const campo = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";
  const pequeno = "rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800";

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Nova enquete
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">Nova enquete</h2>
        <button type="button" onClick={() => setPerguntas(modeloSatisfacao())} className="text-xs font-medium text-indigo-600 hover:underline">
          Usar modelo de pesquisa de satisfação
        </button>
      </div>

      <input required aria-label="Título da enquete" placeholder="Título (ex.: Pesquisa de satisfação 2026)" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
      <textarea aria-label="Explicação da enquete" placeholder="Explicação para as famílias (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className={campo} />

      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Quem recebe"
          value={audience}
          onChange={(e) => {
            const value = e.target.value as "SCHOOL" | "CLASS" | "STUDENT";
            setAudience(value);
            setAlunoId("");
            if (value === "SCHOOL") setClassId("");
          }}
          className={pequeno}
        >
          {user.role === "ADMIN" && <option value="SCHOOL">Toda a escola</option>}
          <option value="CLASS">Turma específica</option>
          <option value="STUDENT">Aluno individual (aos responsáveis)</option>
        </select>
        {(audience === "CLASS" || audience === "STUDENT") && (
          <select required aria-label="Turma" value={classId} onChange={(e) => { setClassId(e.target.value); setAlunoId(""); }} className={pequeno}>
            <option value="">Selecione a turma</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {audience === "STUDENT" && (
          <select required aria-label="Aluno" value={alunoId} onChange={(e) => setAlunoId(e.target.value)} disabled={!classId} className={`${pequeno} disabled:opacity-50`}>
            <option value="">Selecione o aluno</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Prazo (opcional)
          <input type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={pequeno} />
        </label>
      </div>

      <fieldset className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
        <legend className="px-1 text-xs font-semibold text-slate-500">Quem vê as respostas</legend>
        {audience === "STUDENT" ? (
          <p className="text-xs text-slate-600 dark:text-slate-300">Enquete individual é sempre identificada: a escola vê quem respondeu e o que respondeu.</p>
        ) : (
          <div className="space-y-1">
            <label className="flex items-start gap-2">
              <input type="radio" name="identificacao" checked={!identificada} onChange={() => setIdentificada(false)} className="mt-1" />
              <span>
                <strong>Anônima (recomendado)</strong> — a escola vê quantas famílias responderam, mas não liga cada resposta a uma pessoa.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="identificacao" checked={identificada} onChange={() => setIdentificada(true)} className="mt-1" />
              <span>
                <strong>Identificada</strong> — a escola vê o nome de quem respondeu e o que respondeu. As famílias são avisadas antes de responder.
              </span>
            </label>
          </div>
        )}
      </fieldset>

      <div className="space-y-2">
        {perguntas.map((p, i) => (
          <div key={p.chave} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">{i + 1}.</span>
              <select aria-label={`Tipo da pergunta ${i + 1}`} value={p.tipo} onChange={(e) => atualizar(p.chave, { tipo: e.target.value })} className={pequeno}>
                {Object.entries(TIPOS_PERGUNTA).map(([valor, def]) => (
                  <option key={valor} value={valor}>{def.rotulo}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input type="checkbox" checked={p.obrigatoria} onChange={(e) => atualizar(p.chave, { obrigatoria: e.target.checked })} />
                Obrigatória
              </label>
              <span className="ml-auto flex gap-1">
                <button type="button" aria-label={`Subir pergunta ${i + 1}`} disabled={i === 0} onClick={() => mover(i, -1)} className="rounded border border-slate-300 px-2 text-xs disabled:opacity-40 dark:border-slate-700">↑</button>
                <button type="button" aria-label={`Descer pergunta ${i + 1}`} disabled={i === perguntas.length - 1} onClick={() => mover(i, 1)} className="rounded border border-slate-300 px-2 text-xs disabled:opacity-40 dark:border-slate-700">↓</button>
                <button type="button" aria-label={`Remover pergunta ${i + 1}`} disabled={perguntas.length === 1} onClick={() => setPerguntas((l) => l.filter((x) => x.chave !== p.chave))} className="rounded border border-red-300 px-2 text-xs text-red-700 disabled:opacity-40">Remover</button>
              </span>
            </div>
            <input required aria-label={`Texto da pergunta ${i + 1}`} placeholder="Escreva a pergunta" value={p.texto} onChange={(e) => atualizar(p.chave, { texto: e.target.value })} className={campo} />
            {p.tipo === "ESCOLHA" && (
              <textarea required aria-label={`Opções da pergunta ${i + 1}`} placeholder={`Uma opção por linha (2 a ${ESCOLHAS_MAX})`} value={p.escolhas} onChange={(e) => atualizar(p.chave, { escolhas: e.target.value })} rows={3} className={campo} />
            )}
          </div>
        ))}
        <button type="button" onClick={() => setPerguntas((l) => [...l, nova()])} disabled={perguntas.length >= 30} className="text-sm font-medium text-indigo-600 hover:underline disabled:opacity-50">
          + Adicionar pergunta
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {loading ? "Publicando..." : "Publicar enquete"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">
          Cancelar
        </button>
      </div>
    </form>
  );
}
