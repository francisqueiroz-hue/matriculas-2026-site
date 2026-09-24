"use client";

import { useEffect, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";

type Funcao = "DIRECAO" | "COORDENACAO" | "PROFESSOR" | "AUXILIAR";

const FUNCAO_LABEL: Record<Funcao, string> = {
  DIRECAO: "Direção",
  COORDENACAO: "Coordenação",
  PROFESSOR: "Professor(a)",
  AUXILIAR: "Auxiliar",
};

const FUNCAO_DICA: Record<Funcao, string> = {
  DIRECAO: "Acesso total à administração da escola.",
  COORDENACAO: "Publica nas turmas, conversa com as famílias e lança notas.",
  PROFESSOR: "Publica e conversa com as famílias das turmas em que leciona.",
  AUXILIAR: "Mesmo acesso de professor(a), nas turmas em que atua.",
};

interface ClassOption {
  id: string;
  name: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "ADMIN" | "STAFF" | "GUARDIAN";
  active: boolean;
  isCoordenacao: boolean;
  funcao: Funcao | null;
  classesTeaching: { class: { id: string; name: string } }[];
}

interface RespostaAcesso {
  temporaryPassword?: string;
  envio?: { enviado: boolean; mensagem: string } | null;
}

/** Cadastros antigos não têm função gravada — deduz pelo perfil. */
function funcaoDe(u: UserItem): Funcao {
  if (u.funcao) return u.funcao;
  if (u.role === "ADMIN") return "DIRECAO";
  return u.isCoordenacao ? "COORDENACAO" : "PROFESSOR";
}

function formatarTelefone(telefone: string | null) {
  if (!telefone) return "";
  const d = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

function textoAcesso(prefixo: string, data: RespostaAcesso) {
  if (data.envio?.enviado) return `${prefixo} ${data.envio.mensagem}`;
  const motivo = data.envio?.mensagem ?? "Sem envio pelo WhatsApp da escola.";
  return `${prefixo} ${motivo} Senha provisória: ${data.temporaryPassword} — entregue pessoalmente ou tente de novo em Acessos.`;
}

function SeletorTurmas({ classes, value, onChange }: { classes: ClassOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (classes.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium">Turmas em que atua</p>
      <div className="flex flex-wrap gap-3">
        {classes.map((c) => (
          <label key={c.id} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={value.includes(c.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((id) => id !== c.id))}
            />
            {c.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function UsuariosContent() {
  const [users, setUsers] = useState<UserItem[] | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  // Cadastro — mesmo formato do vínculo de responsável: nome + celular e/ou e-mail.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [funcao, setFuncao] = useState<Funcao>("PROFESSOR");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [criado, setCriado] = useState<{ texto: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editFuncao, setEditFuncao] = useState<Funcao>("PROFESSOR");
  const [editClassIds, setEditClassIds] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<Record<string, string>>({});
  // Link wa.me com a mensagem de acesso, para a escola enviar do próprio WhatsApp.

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
    setCriado(null);
    if (!phone.trim() && !email.trim()) {
      setError("Informe pelo menos o celular ou o e-mail.");
      return;
    }
    setSalvando(true);
    try {
      const data = await apiJson<RespostaAcesso & { user: { name: string } }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name,
          phone,
          email,
          funcao,
          classIds: funcao === "DIRECAO" ? undefined : classIds,
        }),
      });
      setCriado({ texto: textoAcesso(`${data.user.name} cadastrado(a) como ${FUNCAO_LABEL[funcao]}.`, data) });
      setName("");
      setPhone("");
      setEmail("");
      setClassIds([]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar");
    } finally {
      setSalvando(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("Desativar este usuário?")) return;
    await apiJson(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  async function handleResetPassword(id: string) {
    if (!confirm("Gerar uma nova senha temporária para este usuário? A senha atual deixará de funcionar.")) return;
    try {
      const data = await apiJson<RespostaAcesso>(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ resetPassword: true }),
      });
      setFeedback((prev) => ({ ...prev, [id]: textoAcesso("Nova senha gerada.", data) }));
    } catch (err) {
      setFeedback((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Erro ao redefinir senha" }));
    }
  }

  function startEdit(u: UserItem) {
    setEditingId(u.id);
    setEditName(u.name);
    setEditPhone(formatarTelefone(u.phone));
    setEditFuncao(funcaoDe(u));
    setEditClassIds(u.classesTeaching.map((c) => c.class.id));
    setEditError(null);
  }

  async function handleSaveEdit(id: string, e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    try {
      await apiJson(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName,
          phone: editPhone,
          funcao: editFuncao,
          ...(editFuncao !== "DIRECAO" ? { classIds: editClassIds } : {}),
        }),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const campo = "rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Equipe</h1>
        <p className="text-sm text-slate-500">
          Direção, coordenação, professores e auxiliares. O cadastro funciona como o dos responsáveis: basta o nome e o
          celular (ou e-mail) — a senha provisória é gerada automaticamente e pode ser enviada pelo WhatsApp.
        </p>
      </div>

      <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-3">
          <input required placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className={campo} />
          <input
            type="tel"
            inputMode="tel"
            placeholder="Celular com DDD"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`${campo} min-w-64`}
          />
          <input type="email" placeholder="E-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
          <label className="sr-only" htmlFor="funcao-nova">
            Função
          </label>
          <select id="funcao-nova" value={funcao} onChange={(e) => setFuncao(e.target.value as Funcao)} className={campo}>
            {(Object.keys(FUNCAO_LABEL) as Funcao[]).map((f) => (
              <option key={f} value={f}>
                {FUNCAO_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">
          {FUNCAO_DICA[funcao]} Informe o celular ou o e-mail (pelo menos um); sem e-mail, o login é feito pelo celular.
        </p>

        {funcao !== "DIRECAO" && <SeletorTurmas classes={classes} value={classIds} onChange={setClassIds} />}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {salvando ? "Cadastrando..." : "Cadastrar"}
        </button>
        {criado && (
          <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
            <p>{criado.texto}</p>
          </div>
        )}
      </form>

      <ul className="space-y-2">
        {users?.map((u) =>
          editingId === u.id ? (
            <li key={u.id} className="rounded-xl border border-indigo-300 bg-white p-3 dark:border-indigo-700 dark:bg-slate-900">
              <form onSubmit={(e) => handleSaveEdit(u.id, e)} className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-500">
                    Nome
                    <input required value={editName} onChange={(e) => setEditName(e.target.value)} className={`mt-1 block ${campo}`} />
                  </label>
                  <label className="text-xs text-slate-500">
                    Celular
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="(21) 90000-0000"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className={`mt-1 block ${campo}`}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Função
                    <select value={editFuncao} onChange={(e) => setEditFuncao(e.target.value as Funcao)} className={`mt-1 block ${campo}`}>
                      {(Object.keys(FUNCAO_LABEL) as Funcao[]).map((f) => (
                        <option key={f} value={f}>
                          {FUNCAO_LABEL[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {editFuncao !== "DIRECAO" && <SeletorTurmas classes={classes} value={editClassIds} onChange={setEditClassIds} />}
                <div className="flex items-center gap-3">
                  <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
                    Salvar
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-sm text-slate-500 hover:underline">
                    Cancelar
                  </button>
                </div>
              </form>
              {editError && <p className="mt-1 text-xs text-red-600">{editError}</p>}
              <p className="mt-1 text-xs text-slate-400">O e-mail de login não pode ser alterado por aqui.</p>
            </li>
          ) : (
            <li key={u.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {u.name}{" "}
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {FUNCAO_LABEL[funcaoDe(u)]}
                    </span>{" "}
                    {!u.active && <span className="text-xs text-red-500">inativo</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[formatarTelefone(u.phone), u.email].filter(Boolean).join(" · ") || "sem contato"}
                    {u.classesTeaching.length > 0 && ` · ${u.classesTeaching.map((c) => c.class.name).join(", ")}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => startEdit(u)} className="text-xs text-indigo-600 hover:underline">
                    Editar
                  </button>
                  <button onClick={() => handleResetPassword(u.id)} className="text-xs text-indigo-600 hover:underline">
                    Redefinir senha
                  </button>
                  {u.active && (
                    <button onClick={() => handleDeactivate(u.id)} className="text-xs text-red-600 hover:underline">
                      Desativar
                    </button>
                  )}
                </div>
              </div>
              {feedback[u.id] && <p className="mt-1 text-xs text-slate-500">{feedback[u.id]}</p>}
            </li>
          ),
        )}
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
