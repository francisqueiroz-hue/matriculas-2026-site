"use client";

import { useEffect, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";

interface ClassOption {
  id: string;
  name: string;
}

interface StudentItem {
  id: string;
  name: string;
  class: { id: string; name: string };
  guardians: { guardian: { id: string; name: string; email: string; phone: string | null } }[];
  mensalidadeValor: string | null;
  diaVencimento: number | null;
}

function AlunosContent() {
  const [students, setStudents] = useState<StudentItem[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardianForms, setGuardianForms] = useState<
    Record<string, { email: string; guardianName: string; phone: string; relation: string }>
  >({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [billingForms, setBillingForms] = useState<Record<string, { mensalidadeValor: string; diaVencimento: string }>>({});
  const [editingGuardianId, setEditingGuardianId] = useState<string | null>(null);
  const [editGuardianName, setEditGuardianName] = useState("");
  const [editGuardianPhone, setEditGuardianPhone] = useState("");
  const [editGuardianError, setEditGuardianError] = useState<string | null>(null);

  function load() {
    apiJson<{ students: StudentItem[] }>("/api/admin/students").then((data) => setStudents(data.students));
    apiJson<{ classes: ClassOption[] }>("/api/admin/classes").then((data) => setClasses(data.classes));
  }
  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiJson("/api/admin/students", { method: "POST", body: JSON.stringify({ name, classId }) });
      setName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar aluno");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este aluno?")) return;
    await apiJson(`/api/admin/students/${id}`, { method: "DELETE" });
    load();
  }

  function guardianForm(studentId: string) {
    return guardianForms[studentId] ?? { email: "", guardianName: "", phone: "", relation: "" };
  }

  async function handleLinkGuardian(studentId: string, e: React.FormEvent) {
    e.preventDefault();
    const form = guardianForm(studentId);
    try {
      const data = await apiJson<{ temporaryPassword?: string }>(`/api/admin/students/${studentId}/guardians`, {
        method: "POST",
        body: JSON.stringify({
          guardianEmail: form.email,
          guardianName: form.guardianName,
          guardianPhone: form.phone || undefined,
          relation: form.relation,
        }),
      });
      setFeedback((prev) => ({
        ...prev,
        [studentId]: data.temporaryPassword
          ? `Responsável criado. Senha temporária: ${data.temporaryPassword}`
          : "Responsável vinculado.",
      }));
      setGuardianForms((prev) => ({ ...prev, [studentId]: { email: "", guardianName: "", phone: "", relation: "" } }));
      load();
    } catch (err) {
      setFeedback((prev) => ({ ...prev, [studentId]: err instanceof Error ? err.message : "Erro ao vincular" }));
    }
  }

  async function handleUnlinkGuardian(studentId: string, guardianId: string) {
    if (!confirm("Revogar vínculo com este responsável?")) return;
    await apiJson(`/api/admin/students/${studentId}/guardians/${guardianId}`, { method: "DELETE" });
    load();
  }

  function startEditGuardian(guardian: { id: string; name: string; phone: string | null }) {
    setEditingGuardianId(guardian.id);
    setEditGuardianName(guardian.name);
    setEditGuardianPhone(guardian.phone ?? "");
    setEditGuardianError(null);
  }

  async function handleSaveGuardian(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGuardianId) return;
    setEditGuardianError(null);
    try {
      await apiJson(`/api/admin/users/${editingGuardianId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editGuardianName, phone: editGuardianPhone }),
      });
      setEditingGuardianId(null);
      load();
    } catch (err) {
      setEditGuardianError(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  function billingForm(student: StudentItem) {
    return (
      billingForms[student.id] ?? {
        mensalidadeValor: student.mensalidadeValor ?? "",
        diaVencimento: student.diaVencimento ? String(student.diaVencimento) : "",
      }
    );
  }

  async function handleSalvarMensalidade(studentId: string, e: React.FormEvent) {
    e.preventDefault();
    const form = billingForm(students!.find((s) => s.id === studentId)!);
    try {
      await apiJson(`/api/admin/students/${studentId}/billing`, {
        method: "PUT",
        body: JSON.stringify({
          mensalidadeValor: form.mensalidadeValor ? Number(form.mensalidadeValor) : null,
          diaVencimento: form.diaVencimento ? Number(form.diaVencimento) : null,
        }),
      });
      setFeedback((prev) => ({ ...prev, [studentId]: "Mensalidade atualizada." }));
      load();
    } catch (err) {
      setFeedback((prev) => ({ ...prev, [studentId]: err instanceof Error ? err.message : "Erro ao salvar mensalidade" }));
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Alunos</h1>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label className="mb-1 block text-xs font-medium">Nome do aluno</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Turma</label>
          <select
            required
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">Selecione</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          Cadastrar aluno
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <ul className="space-y-3">
        {students?.map((s) => {
          const form = guardianForm(s.id);
          return (
            <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {s.name} <span className="text-xs text-slate-500">({s.class.name})</span>
                </span>
                <button onClick={() => handleDelete(s.id)} className="text-xs text-red-600 hover:underline">
                  Remover
                </button>
              </div>

              <ul className="mt-2 space-y-1 text-sm">
                {s.guardians.map((g) =>
                  editingGuardianId === g.guardian.id ? (
                    <li key={g.guardian.id} className="rounded-md border border-indigo-200 p-2 dark:border-indigo-800">
                      <form onSubmit={handleSaveGuardian} className="flex flex-wrap items-end gap-2">
                        <label className="text-xs text-slate-500">
                          Nome
                          <input
                            required
                            value={editGuardianName}
                            onChange={(e) => setEditGuardianName(e.target.value)}
                            className="mt-1 block rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          Telefone
                          <input
                            value={editGuardianPhone}
                            onChange={(e) => setEditGuardianPhone(e.target.value)}
                            placeholder="(00) 00000-0000"
                            className="mt-1 block rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                          />
                        </label>
                        <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
                          Salvar
                        </button>
                        <button type="button" onClick={() => setEditingGuardianId(null)} className="text-xs text-slate-500 hover:underline">
                          Cancelar
                        </button>
                      </form>
                      {editGuardianError && <p className="mt-1 text-xs text-red-600">{editGuardianError}</p>}
                    </li>
                  ) : (
                    <li key={g.guardian.id} className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>
                        {g.guardian.name} ({g.guardian.email}
                        {g.guardian.phone ? ` · ${g.guardian.phone}` : ""})
                      </span>
                      <span className="flex items-center gap-3">
                        <button onClick={() => startEditGuardian(g.guardian)} className="text-xs text-indigo-600 hover:underline">
                          Editar
                        </button>
                        <button
                          onClick={() => handleUnlinkGuardian(s.id, g.guardian.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Revogar vínculo
                        </button>
                      </span>
                    </li>
                  ),
                )}
              </ul>

              <form onSubmit={(e) => handleLinkGuardian(s.id, e)} className="mt-3 flex flex-wrap gap-2">
                <input
                  required
                  placeholder="Nome do responsável"
                  value={form.guardianName}
                  onChange={(e) => setGuardianForms((prev) => ({ ...prev, [s.id]: { ...form, guardianName: e.target.value } }))}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <input
                  required
                  type="email"
                  placeholder="E-mail do responsável"
                  value={form.email}
                  onChange={(e) => setGuardianForms((prev) => ({ ...prev, [s.id]: { ...form, email: e.target.value } }))}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <input
                  placeholder="Telefone (opcional)"
                  value={form.phone}
                  onChange={(e) => setGuardianForms((prev) => ({ ...prev, [s.id]: { ...form, phone: e.target.value } }))}
                  className="w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <input
                  placeholder="Parentesco (opcional)"
                  value={form.relation}
                  onChange={(e) => setGuardianForms((prev) => ({ ...prev, [s.id]: { ...form, relation: e.target.value } }))}
                  className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <button type="submit" className="rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950">
                  Vincular responsável
                </button>
              </form>

              <form onSubmit={(e) => handleSalvarMensalidade(s.id, e)} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <label className="text-xs text-slate-500">
                  Mensalidade (R$)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={billingForm(s).mensalidadeValor}
                    onChange={(e) =>
                      setBillingForms((prev) => ({ ...prev, [s.id]: { ...billingForm(s), mensalidadeValor: e.target.value } }))
                    }
                    className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Dia de vencimento
                  <input
                    type="number"
                    min={1}
                    max={28}
                    placeholder="padrão da escola"
                    value={billingForm(s).diaVencimento}
                    onChange={(e) =>
                      setBillingForms((prev) => ({ ...prev, [s.id]: { ...billingForm(s), diaVencimento: e.target.value } }))
                    }
                    className="mt-1 block w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                  Salvar mensalidade
                </button>
              </form>
              {feedback[s.id] && <p className="mt-1 text-xs text-slate-500">{feedback[s.id]}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function AlunosPage() {
  return (
    <AdminGuard>
      <AlunosContent />
    </AdminGuard>
  );
}
