"use client";

import { Fragment, useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";

interface StudentOption {
  id: string;
  name: string;
  class: { id: string; name: string };
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

export default function BoletimPage() {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");
  const [boletim, setBoletim] = useState<BoletimLinha[] | null>(null);

  useEffect(() => {
    apiJson<{ students: StudentOption[] }>("/api/account/meus-alunos").then((data) => {
      setStudents(data.students);
      if (data.students.length === 1) setStudentId(data.students[0].id);
    });
  }, []);

  useEffect(() => {
    if (!studentId) return;
    apiJson<{ boletim: BoletimLinha[] }>(`/api/notas/${studentId}`).then((data) => setBoletim(data.boletim));
  }, [studentId]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Boletim</h1>

      {students.length > 1 && (
        <div>
          <label className="mb-1 block text-xs font-medium">Aluno</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Selecione</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.class.name})
              </option>
            ))}
          </select>
        </div>
      )}

      {students.length === 0 && <p className="text-sm text-slate-500">Nenhum aluno vinculado à sua conta.</p>}
      {studentId && boletim === null && <p className="text-sm text-slate-500">Carregando boletim...</p>}

      {studentId && boletim && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[700px] border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th rowSpan={2} className="border-b border-slate-200 px-3 py-2 align-bottom">
                  Disciplina
                </th>
                {TRIMESTRES.map((t) => (
                  <th key={t} className="border-b border-l border-slate-200 px-3 py-2 text-center">
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
                  <th key={t} className="border-b border-l border-slate-200 px-2 py-1 text-center text-xs font-normal">
                    Média
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {boletim.map((linha) => (
                <tr key={linha.disciplinaId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{linha.nome}</td>
                  {TRIMESTRES.map((t) => (
                    <Fragment key={t}>
                      <td className="border-l border-slate-100 px-2 py-2 text-center">{linha.trimestres[t].media ?? "—"}</td>
                    </Fragment>
                  ))}
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
                  <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                    Nenhuma nota lançada ainda.
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
