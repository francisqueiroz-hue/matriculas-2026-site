"use client";

import { useEffect, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";

interface ClassOption {
  id: string;
  name: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF" | "GUARDIAN";
  active: boolean;
  classesTeaching: { class: { id: string; name: string } }[];
}

function UsuariosContent() {
  const [users, setUsers] = useState<UserItem[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "STAFF">("STAFF");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiJson<{ users: UserItem[] }>("/api/admin/users").then((data) =>
      setUsers(data.users.filter((u) => u.role !== "GUARDIAN")),
    );
    apiJson<{ classes: ClassOption[] }>("/api/admin/classes").then((data) => setClasses(data.classes));
  }
  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiJson("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role, classIds: role === "STAFF" ? classIds : undefined }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setClassIds([]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar usuário");
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("Desativar este usuário?")) return;
    await apiJson(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Equipe (usuários administrativos)</h1>

      <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-3">
          <input required placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          <input required type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          <input required type="password" minLength={8} placeholder="Senha (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          <select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "STAFF")} className="rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
            <option value="STAFF">Professor/Funcionário</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>

        {role === "STAFF" && (
          <div>
            <p className="mb-1 text-xs font-medium">Turmas que leciona</p>
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={classIds.includes(c.id)}
                    onChange={(e) =>
                      setClassIds((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          Criar usuário
        </button>
      </form>

      <ul className="space-y-2">
        {users?.map((u) => (
          <li key={u.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <p className="font-medium">
                {u.name} <span className="text-xs text-slate-500">({u.role === "ADMIN" ? "admin" : "professor(a)"})</span>{" "}
                {!u.active && <span className="text-xs text-red-500">inativo</span>}
              </p>
              <p className="text-xs text-slate-500">
                {u.email}
                {u.classesTeaching.length > 0 && ` · ${u.classesTeaching.map((c) => c.class.name).join(", ")}`}
              </p>
            </div>
            {u.active && (
              <button onClick={() => handleDeactivate(u.id)} className="text-xs text-red-600 hover:underline">
                Desativar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function UsuariosPage() {
  return (
    <AdminGuard>
      <UsuariosContent />
    </AdminGuard>
  );
}
