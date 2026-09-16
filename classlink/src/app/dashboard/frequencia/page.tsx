"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "JUSTIFIED";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Presente",
  ABSENT: "Falta",
  LATE: "Atraso",
  JUSTIFIED: "Falta justificada",
};
const STATUS_OPTIONS: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "JUSTIFIED"];
const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-green-100 text-green-700",
  ABSENT: "bg-red-100 text-red-700",
  LATE: "bg-amber-100 text-amber-700",
  JUSTIFIED: "bg-slate-100 text-slate-600",
};

interface ClassOption {
  id: string;
  name: string;
  year: number;
}
interface StudentOption {
  id: string;
  name: string;
}
interface ResumoFrequencia {
  total: number;
  presentes: number;
  atrasos: number;
  faltas: number;
  justificadas: number;
  percentual: number | null;
}
interface HistoricoResposta {
  student: { id: string; name: string; class: { id: string; name: string } };
  mes: string;
  registros: { date: string; status: AttendanceStatus }[];
  resumo: ResumoFrequencia;
  abaixoDoMinimo: boolean;
}

// Usa os componentes de data LOCAIS do navegador (não toISOString/UTC): a escola está no
// Brasil (UTC-3), então depois das 21h toISOString() já mostraria o dia seguinte.
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function formatarDiaMes(dataISO: string) {
  return new Date(dataISO).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/** Resumo + histórico de frequência de um aluno num mês — usado tanto por quem marca quanto pelo responsável. */
function HistoricoFrequencia({ studentId }: { studentId: string }) {
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<HistoricoResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiJson<HistoricoResposta>(`/api/attendance/${studentId}?mes=${mes}`)
      .then((data) => {
        setDados(data);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar frequência"));
  }, [studentId, mes]);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium">Mês</label>
        <input
          type="month"
          value={mes}
          onChange={(e) => {
            setMes(e.target.value);
            setDados(null);
            setErro(null);
          }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!erro && !dados && <p className="text-sm text-slate-500">Carregando frequência...</p>}

      {dados && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-bold">{dados.resumo.percentual ?? "—"}%</span>
            <span className="text-sm text-slate-500">
              {dados.resumo.presentes} presenças, {dados.resumo.atrasos} atrasos, {dados.resumo.faltas} faltas,{" "}
              {dados.resumo.justificadas} faltas justificadas ({dados.resumo.total} dia(s) letivo(s) lançado(s))
            </span>
          </div>

          {dados.abaixoDoMinimo && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              A frequência no mês está abaixo do mínimo legal de 75% previsto na LDB (art. 24, VI) para aprovação na
              educação básica.
            </div>
          )}

          {dados.resumo.total === 0 ? (
            <p className="text-sm text-slate-500">Nenhum registro de frequência lançado neste mês.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {dados.registros.map((r) => (
                <span
                  key={r.date}
                  title={STATUS_LABEL[r.status]}
                  className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_BADGE[r.status]}`}
                >
                  {formatarDiaMes(r.date)}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Tela de marcação de frequência (ADMIN/STAFF): escolhe turma + dia e marca o status de cada aluno. */
function MarcacaoFrequencia() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(hojeISO());
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ classes: ClassOption[] }>("/api/attendance/classes")
      .then((data) => setClasses(data.classes))
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar turmas"));
  }, []);

  useEffect(() => {
    if (!classId || !date) return;
    apiJson<{ students: StudentOption[]; records: { studentId: string; status: AttendanceStatus }[] }>(
      `/api/attendance?classId=${classId}&date=${date}`,
    )
      .then((data) => {
        setStudents(data.students);
        const marcados: Record<string, AttendanceStatus> = {};
        for (const s of data.students) {
          const registro = data.records.find((r) => r.studentId === s.id);
          marcados[s.id] = registro?.status ?? "PRESENT";
        }
        setMarks(marcados);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar turma"))
      .finally(() => setCarregando(false));
  }, [classId, date]);

  async function handleSalvar() {
    setErro(null);
    setSucesso(null);
    setSalvando(true);
    try {
      await apiJson("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          classId,
          date,
          marks: students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? "PRESENT" })),
        }),
      });
      setSucesso("Frequência salva com sucesso.");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar frequência");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4">
      <h2 className="text-lg font-semibold">Marcar frequência</h2>

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Turma</label>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStudents([]);
              setMarks({});
              setErro(null);
              setSucesso(null);
              setCarregando(Boolean(e.target.value));
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
          <label className="mb-1 block text-xs font-medium">Data</label>
          <input
            type="date"
            value={date}
            max={hojeISO()}
            onChange={(e) => {
              setDate(e.target.value);
              setErro(null);
              setSucesso(null);
              if (classId) setCarregando(true);
            }}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {classes.length === 0 && (
        <p className="text-sm text-slate-500">
          Nenhuma turma disponível para marcar frequência{" "}
          {classes.length === 0 ? "(nenhuma turma cadastrada, ou você não leciona em nenhuma)." : ""}
        </p>
      )}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {sucesso && <p className="text-sm text-green-700">{sucesso}</p>}

      {!classId && classes.length > 0 && <p className="text-sm text-slate-500">Selecione uma turma e uma data.</p>}
      {classId && carregando && <p className="text-sm text-slate-500">Carregando alunos...</p>}

      {classId && !carregando && students.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[500px] border-collapse text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2">Aluno</th>
                  <th className="border-b border-slate-200 px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2">
                      <select
                        value={marks[s.id] ?? "PRESENT"}
                        onChange={(e) => setMarks((prev) => ({ ...prev, [s.id]: e.target.value as AttendanceStatus }))}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {STATUS_LABEL[opt]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar frequência"}
          </button>
        </div>
      )}

      {classId && !carregando && students.length === 0 && (
        <p className="text-sm text-slate-500">Nenhum aluno cadastrado nesta turma.</p>
      )}
    </div>
  );
}

/** Consulta de histórico (ADMIN/STAFF): escolhe turma + aluno para ver o resumo de frequência. */
function ConsultaFrequencia() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");

  useEffect(() => {
    apiJson<{ classes: ClassOption[] }>("/api/attendance/classes").then((data) => setClasses(data.classes));
  }, []);

  useEffect(() => {
    if (!classId) return;
    apiJson<{ students: StudentOption[] }>(`/api/attendance?classId=${classId}&date=${hojeISO()}`).then((data) =>
      setStudents(data.students),
    );
  }, [classId]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4">
      <h2 className="text-lg font-semibold">Consultar histórico de um aluno</h2>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Turma</label>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStudents([]);
              setStudentId("");
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
          <label className="mb-1 block text-xs font-medium">Aluno</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
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

      {studentId ? <HistoricoFrequencia key={studentId} studentId={studentId} /> : (
        <p className="text-sm text-slate-500">Selecione uma turma e um aluno para ver o histórico.</p>
      )}
    </div>
  );
}

/** Tela do responsável: escolhe (quando houver mais de um) o filho e vê o histórico de frequência. */
function FrequenciaResponsavel() {
  interface StudentComTurma extends StudentOption {
    class: { id: string; name: string };
  }
  const [students, setStudents] = useState<StudentComTurma[]>([]);
  const [studentId, setStudentId] = useState("");

  useEffect(() => {
    apiJson<{ students: StudentComTurma[] }>("/api/account/meus-alunos").then((data) => {
      setStudents(data.students);
      if (data.students.length === 1) setStudentId(data.students[0].id);
    });
  }, []);

  return (
    <div className="space-y-4">
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
      {studentId && <HistoricoFrequencia key={studentId} studentId={studentId} />}
    </div>
  );
}

export default function FrequenciaPage() {
  const user = useCurrentUser();
  const podeMarcar = useMemo(() => user.role === "ADMIN" || user.role === "STAFF", [user.role]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Frequência</h1>
        <p className="text-sm text-slate-500">
          Mínimo legal de frequência para aprovação na educação básica: 75% (LDB, art. 24, VI).
        </p>
      </div>

      {podeMarcar ? (
        <>
          <MarcacaoFrequencia />
          <ConsultaFrequencia />
        </>
      ) : (
        <FrequenciaResponsavel />
      )}
    </div>
  );
}
