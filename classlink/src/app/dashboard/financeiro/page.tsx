"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { Faturas } from "./Faturas";
import { BoletosDoAno } from "./BoletosDoAno";
import type { FaturaEntrada } from "@/lib/faturas-familia";

interface BillingInfo {
  cpf: string | null;
  enderecoCobranca: { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string } | null;
}

export default function FinanceiroPage() {
  const [boletos, setBoletos] = useState<FaturaEntrada[] | null>(null);
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ cpf: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiJson<{ boletos: FaturaEntrada[] }>("/api/billing/boletos").then((data) => setBoletos(data.boletos));
    apiJson<BillingInfo>("/api/account/billing-info").then((data) => {
      setBillingInfo(data);
      if (data.cpf) setForm((f) => ({ ...f, cpf: data.cpf ?? "" }));
      if (data.enderecoCobranca) {
        const e = data.enderecoCobranca;
        setForm((f) => ({ ...f, ...e }));
      }
    });
  }

  useEffect(load, []);

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiJson("/api/account/billing-info", {
        method: "PUT",
        body: JSON.stringify({
          cpf: form.cpf,
          endereco: {
            cep: form.cep,
            logradouro: form.logradouro,
            numero: form.numero,
            complemento: form.complemento || undefined,
            bairro: form.bairro,
            cidade: form.cidade,
            uf: form.uf,
          },
        }),
      });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar dados de cobrança");
    } finally {
      setSaving(false);
    }
  }

  const dadosCompletos = Boolean(billingInfo?.cpf && billingInfo?.enderecoCobranca);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Faturas</h1>

      {billingInfo && !dadosCompletos && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Para receber boletos é preciso cadastrar CPF e endereço.{" "}
          <button type="button" onClick={() => setShowForm(true)} className="font-semibold underline">
            Cadastrar agora
          </button>
        </div>
      )}
      {dadosCompletos && !showForm && (
        <button type="button" onClick={() => setShowForm(true)} className="text-xs text-slate-500 underline">
          Editar dados de cobrança
        </button>
      )}

      {showForm && (
        <form onSubmit={salvarDados} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-500">Dados de cobrança</p>
          <input required aria-label="CPF" placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          <div className="grid grid-cols-2 gap-2">
            <input required aria-label="CEP" placeholder="CEP" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
            <input required aria-label="UF" placeholder="UF" maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          </div>
          <input required aria-label="Logradouro" placeholder="Logradouro" value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          <div className="grid grid-cols-2 gap-2">
            <input required aria-label="Número" placeholder="Número" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
            <input aria-label="Complemento" placeholder="Complemento" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input required aria-label="Bairro" placeholder="Bairro" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
            <input required aria-label="Cidade" placeholder="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {dadosCompletos && <BoletosDoAno aoEmitir={load} />}

      <Faturas boletos={boletos} />
    </div>
  );
}
