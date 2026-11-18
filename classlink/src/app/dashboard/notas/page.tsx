"use client";

import { Fragment, useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { podeExportarBoletim, podeLancarNotas } from "@/lib/equipe";
import Link from "next/link";
import { BaixarBoletimPdf } from "@/components/BaixarBoletimPdf";

interface ClassOption {
  id: string;
  name: string;
}
interface StudentOption {
  id: string;
  name: string;
}
interface TrimestreValores {
  trabalho: number | null;
  teste: number | null;
  prova: number | null;
  media: number | null;
}
type Trimestre = "PRIMEIRO" | "SEGUNDO" | "TERCEIRO";
interface BoletimLinha {
  disciplinaId: string;
  nome: string;
  trimestres: Record<Trimestre, TrimestreValores>;
  mediaFinal: number | null;
  situacao: "APROVADO" | "REPROVADO" | "EM_ANDAMENTO";
}

const TRIMESTRES: Trimestre[] = ["PRIMEIRO", "SEGUNDO", "TERCEIRO"];
const TRIMESTRE_LABEL: Record<Trimestre, string> = {
  PRIMEIRO: "1º Trimestre",
  SEGUNDO: "2º Trimestre",
  TERCEIRO: "3º Trimestre",
};
const CAMPOS = ["trabalho", "teste", "prova"] as const;
const CAMPO_LABEL: Record<(typeof CAMPOS)[number], string> = { trabalho: "Trabalho", teste: "Teste", prova: "Prova" };

const SITUACAO_STYLE: Record<BoletimLinha["situacao"], string> = {
  APROVADO: "bg-green-100 text-green-700",
  REPROVADO: "bg-red-100 text-red-700",
  EM_ANDAMENTO: "bg-slate-100 text-slate-500",
};
const SITUACAO_LABEL: Record<BoletimLinha["situacao"], string> = {
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  EM_ANDAMENTO: "Em andamento",
};

/**
 * Notas: direção e coordenação lançam; secretaria e professores (das próprias turmas) só veem.
 * O servidor confere as duas coisas: quem lança (requireLancarNotas) e de quais alunos vê.
 */
function NotasContent({ podeEditar, podeExportar }: { podeEditar: boolean; podeExportar: boolean }) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");
  const [novaDisciplina, setNovaDisciplina] = useState("");
  const [boletim, setBoletim] = useState<BoletimLinha[] | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ classes: ClassOption[] }>("/api/admin/classes").then((data) => setClasses(data.classes));
  }, []);

  useEffect(() => {
    if (!classId) return;
    apiJson<{ students: StudentOption[] }>(`/api/admin/students?classId=${classId}`).then((data) => setStudents(data.students));
  }, [classId]);

  function loadBoletim(id: string) {
    apiJson<{ boletim: BoletimLinha[] }>(`/api/notas/${id}`).then((data) => setBoletim(data.boletim));
  }

  useEffect(() => {
    if (!studentId) return;
    loadBoletim(studentId);
  }, [studentId]);

  async function handleAddDisciplina(e: React.FormEvent) {
    e.preventDefault();
    if (!novaDisciplina.trim()) return;
    setErro(null);
    try {
      await apiJson("/api/admin/disciplinas", { method: "POST", body: JSON.stringify({ nome: novaDisciplina.trim() }) });
      setNovaDisciplina("");
      if (studentId) loadBoletim(studentId);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar disciplina");
    }
  }

  async function handleSalvarCelula(
    disciplinaId: string,
    trimestre: Trimestre,
    campo: (typeof CAMPOS)[number],
    valorTexto: string,
  ) {
    const valor = valorTexto.trim() === "" ? null : Number(valorTexto.replace(",", "."));
    if (valor !== null && (Number.isNaN(valor) || valor < 0 || valor > 10)) {
      setErro("A nota deve ser um número entre 0 e 10.");
      return;
    }
    setErro(null);
    const key = `${disciplinaId}-${trimestre}-${campo}`;
    setSalvando(key);
    try {
      await apiJson(`/api/notas/${studentId}?disciplinaId=${disciplinaId}`, {
        method: "PUT",
        body: JSON.stringify({ trimestre, [campo]: valor }),
      });
      loadBoletim(studentId);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar nota");
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{podeEditar ? "Lançamento de notas" : "Notas e boletim"}</h1>
      {!podeEditar && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          Somente leitura. Quem lança as notas é a direção ou a coordenação.
        </p>
      )}
      <p className="text-sm text-slate-500">
        Escala de 0 a 10. Média do trimestre pondera trabalho (peso 3), teste (peso 7) e prova (peso 10). Média final é a
        média dos 3 trimestres; aprovação exige média final ≥ 6.
      </p>

      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="notas-turma" className="mb-1 block text-xs font-medium">Turma</label>
          <select
            id="notas-turma"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStudents([]);
              setStudentId("");
              setBoletim(null);
            }}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Selecione</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="notas-aluno" className="mb-1 block text-xs font-medium">Aluno</label>
          <select
            id="notas-aluno"
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setBoletim(null);
            }}
            disabled={!classId}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm disabled:opacity-50"
          >
            <option value="">Selecione</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {podeExportar && classId && (
        <div className="flex flex-wrap items-start gap-2">
          {studentId && (
            <Link
              href={`/dashboard/notas/boletim?aluno=${studentId}`}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Revisar e imprimir boletim do aluno
            </Link>
          )}
          <Link
            href={`/dashboard/notas/boletim?turma=${classId}`}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Revisar e imprimir boletins da turma
          </Link>
          {studentId && (
            <BaixarBoletimPdf
              url={`/api/notas/${studentId}/pdf`}
              nomeArquivo={`boletim-${students.find((s) => s.id === studentId)?.name ?? "aluno"}.pdf`}
              rotulo="PDF direto do aluno"
            />
          )}
          <BaixarBoletimPdf
            url={`/api/notas/turma/${classId}/pdf`}
            nomeArquivo={`boletins-${classes.find((c) => c.id === classId)?.name ?? "turma"}.pdf`}
            rotulo="PDF direto da turma"
          />
        </div>
      )}

      {podeEditar && (
      <form onSubmit={handleAddDisciplina} className="flex items-end gap-2">
        <div>
          <label htmlFor="notas-nova-disciplina" className="mb-1 block text-xs font-medium">Nova disciplina</label>
          <input
            id="notas-nova-disciplina"
            value={novaDisciplina}
            onChange={(e) => setNovaDisciplina(e.target.value)}
            placeholder="Ex: Matemática"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
        >
          Adicionar disciplina
        </button>
      </form>
      )}

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {!studentId && <p className="text-sm text-slate-500">Selecione uma turma e um aluno para {podeEditar ? "lançar" : "ver"} as notas.</p>}
      {studentId && boletim === null && <p className="text-sm text-slate-500">Carregando boletim...</p>}

      {studentId && boletim && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th rowSpan={2} className="border-b border-slate-200 px-3 py-2 align-bottom">
                  Disciplina
                </th>
                {TRIMESTRES.map((t) => (
                  <th key={t} colSpan={4} className="border-b border-l border-slate-200 px-3 py-2 text-center">
                    {TRIMESTRE_LABEL[t]}
                  </th>
                ))}
                <th rowSpan={2} className="border-b border-l border-slate-200 px-3 py-2 align-bottom">
                  Média final
                </th>
                <th rowSpan={2} className="border-b border-l border-slate-200 px-3 py-2 align-bottom">
                  Situação
                </th>
              </tr>
              <tr>
                {TRIMESTRES.map((t) => (
                  <Fragment key={t}>
                    {CAMPOS.map((campo) => (
                      <th key={campo} className="border-b border-l border-slate-200 px-2 py-1 text-center text-xs font-normal">
                        {CAMPO_LABEL[campo]}
                      </th>
                    ))}
                    <th className="border-b border-slate-200 px-2 py-1 text-center text-xs font-normal">Média</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {boletim.map((linha) => (
                <tr key={linha.disciplinaId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{linha.nome}</td>
                  {TRIMESTRES.map((t) => {
                    const v = linha.trimestres[t];
                    return (
                      <Fragment key={t}>
                        {CAMPOS.map((campo) => (
                          <td key={campo} className="border-l border-slate-100 px-1 py-1">
                            {!podeEditar ? (
                              <span className="block w-14 px-1 py-1 text-center text-sm">{v[campo] ?? "—"}</span>
                            ) : (
                            <input
                              key={`${studentId}-${linha.disciplinaId}-${t}-${campo}-${v[campo] ?? ""}`}
                              type="text"
                              aria-label={`${linha.nome}, ${TRIMESTRE_LABEL[t]}, ${CAMPO_LABEL[campo]}`}
                              inputMode="decimal"
                              defaultValue={v[campo] ?? ""}
                              onBlur={(e) => handleSalvarCelula(linha.disciplinaId, t, campo, e.target.value)}
                              disabled={salvando === `${linha.disciplinaId}-${t}-${campo}`}
                              className="w-14 rounded border border-slate-200 px-1 py-1 text-center text-sm disabled:opacity-50"
                            />
                            )}
                          </td>
                        ))}
                        <td className="border-l border-slate-100 px-2 py-1 text-center text-slate-500">{v.media ?? "—"}</td>
                      </Fragment>
                    );
                  })}
                  <td className="border-l border-slate-100 px-3 py-2 text-center font-semibold">{linha.mediaFinal ?? "—"}</td>
                  <td className="border-l border-slate-100 px-3 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SITUACAO_STYLE[linha.situacao]}`}>
                      {SITUACAO_LABEL[linha.situacao]}
                    </span>
                  </td>
                </tr>
              ))}
              {boletim.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-3 py-4 text-center text-slate-500">
                    Nenhuma disciplina cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function NotasPage() {
  const user = useCurrentUser();
  if (user.role !== "ADMIN" && user.role !== "STAFF") {
    return <p className="text-sm text-slate-500">Área restrita à equipe da escola.</p>;
  }
  const perfil = { role: user.role, funcao: user.funcao ?? null, isCoordenacao: Boolean(user.isCoordenacao) };
  // Exportar o boletim em PDF (impressão): só direção e coordenação; o servidor também confere.
  return <NotasContent podeEditar={podeLancarNotas(perfil)} podeExportar={podeExportarBoletim(perfil)} />;
}
