"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { dadosFamiliaSchema } from "@/lib/contrato-modelo/validacao";
import { formatarDinheiro, LINHAS_ANEXO_IMAGEM, type DadosFamilia, type EscolhaImagem, type Pessoa } from "@/lib/contrato-modelo/tipos";

interface Resumo {
  aluno: string;
  turma: string;
  etapa: "EI" | "EF1";
  periodo: string | null;
  temValores: boolean;
  parcelas: number;
  vencimentoDia: number;
  parcelaBruta: number;
  parcelaLiquida: number;
  anuidade: number;
  descontoValor: number;
  descontoPct: number;
}

type Erros = Record<string, string>;

const campo = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base sm:text-sm";
const campoErro = "border-red-500 bg-red-50";
const rotulo = "mb-1 block text-sm font-medium text-slate-800";
const botaoPrimario =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60";
const botaoSecundario =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50";

const pessoaVazia = (base?: Partial<Pessoa>): Pessoa => ({
  nome: "",
  cpf: "",
  nascimento: "",
  rg: "",
  orgao: "",
  uf: "RJ",
  endereco: "",
  numero: "",
  complemento: "",
  cep: "",
  bairro: "",
  cidade: "Niterói",
  email: "",
  telefone: "",
  ...base,
});

function mascaraData(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
}
function mascaraCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function mascaraCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function Campo({
  id,
  label,
  valor,
  onChange,
  erro,
  className = "",
  ...rest
}: {
  id: string;
  label: string;
  valor: string;
  onChange: (v: string) => void;
  erro?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  return (
    <div className={className}>
      <label htmlFor={id} className={rotulo}>
        {label}
      </label>
      <input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`${campo} ${erro ? campoErro : ""}`}
        {...rest}
      />
      {erro && (
        <p id={`${id}-erro`} className="mt-1 text-sm text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}

function CamposPessoa({
  prefixo,
  pessoa,
  onChange,
  erros,
}: {
  prefixo: string;
  pessoa: Pessoa;
  onChange: (p: Pessoa) => void;
  erros: Erros;
}) {
  const set = (k: keyof Pessoa, v: string) => onChange({ ...pessoa, [k]: v });
  const e = (k: keyof Pessoa) => erros[`${prefixo}.${k}`];
  const id = (k: string) => `${prefixo}-${k}`;
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <Campo id={id("nome")} label="Nome completo" valor={pessoa.nome} onChange={(v) => set("nome", v)} erro={e("nome")} autoComplete="name" className="sm:col-span-6" />
      <Campo id={id("cpf")} label="CPF" valor={pessoa.cpf} onChange={(v) => set("cpf", mascaraCpf(v))} erro={e("cpf")} inputMode="numeric" className="sm:col-span-3" />
      <Campo
        id={id("nasc")}
        label="Data de nascimento"
        valor={pessoa.nascimento}
        onChange={(v) => set("nascimento", mascaraData(v))}
        erro={e("nascimento")}
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        className="sm:col-span-3"
      />
      <Campo id={id("rg")} label="RG" valor={pessoa.rg} onChange={(v) => set("rg", v)} erro={e("rg")} className="sm:col-span-3" />
      <Campo id={id("orgao")} label="Órgão emissor" valor={pessoa.orgao} onChange={(v) => set("orgao", v)} erro={e("orgao")} placeholder="DETRAN" className="sm:col-span-2" />
      <Campo id={id("uf")} label="UF" valor={pessoa.uf} onChange={(v) => set("uf", v.toUpperCase().slice(0, 2))} erro={e("uf")} className="sm:col-span-1" />
      <Campo id={id("end")} label="Endereço (rua/avenida)" valor={pessoa.endereco} onChange={(v) => set("endereco", v)} erro={e("endereco")} autoComplete="address-line1" className="sm:col-span-4" />
      <Campo id={id("num")} label="Número" valor={pessoa.numero} onChange={(v) => set("numero", v)} erro={e("numero")} className="sm:col-span-2" />
      <Campo id={id("compl")} label="Complemento (opcional)" valor={pessoa.complemento} onChange={(v) => set("complemento", v)} erro={e("complemento")} className="sm:col-span-3" />
      <Campo id={id("cep")} label="CEP" valor={pessoa.cep} onChange={(v) => set("cep", mascaraCep(v))} erro={e("cep")} inputMode="numeric" autoComplete="postal-code" className="sm:col-span-3" />
      <Campo id={id("bairro")} label="Bairro" valor={pessoa.bairro} onChange={(v) => set("bairro", v)} erro={e("bairro")} className="sm:col-span-3" />
      <Campo id={id("cidade")} label="Cidade" valor={pessoa.cidade} onChange={(v) => set("cidade", v)} erro={e("cidade")} className="sm:col-span-3" />
      <Campo id={id("email")} label="E-mail" valor={pessoa.email} onChange={(v) => set("email", v)} erro={e("email")} type="email" autoComplete="email" className="sm:col-span-3" />
      <Campo id={id("tel")} label="Telefone com DDD" valor={pessoa.telefone} onChange={(v) => set("telefone", v)} erro={e("telefone")} type="tel" autoComplete="tel" className="sm:col-span-3" />
    </div>
  );
}

/**
 * Formulário em que a família confere os dados do contrato guardado no app. Ao confirmar,
 * o servidor gera o PDF preenchido, que a família baixa e assina.
 */
export function FormularioDados({ contratoId, onGerado, onCancelar }: { contratoId: string; onGerado: () => void; onCancelar?: () => void }) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [dados, setDados] = useState<DadosFamilia | null>(null);
  const [imagem, setImagem] = useState<(EscolhaImagem | undefined)[]>(Array(LINHAS_ANEXO_IMAGEM.length).fill(undefined));
  const [erros, setErros] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [conferi, setConferi] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiJson<{ resumo: Resumo; dados: DadosFamilia }>(`/api/contratos/${contratoId}/dados`)
      .then((r) => {
        setResumo(r.resumo);
        setDados(r.dados);
        if (r.dados.imagem.length === LINHAS_ANEXO_IMAGEM.length) setImagem(r.dados.imagem);
      })
      .catch((e) => setErroGeral(e instanceof Error ? e.message : "Não foi possível carregar o contrato"));
  }, [contratoId]);

  if (!dados || !resumo) {
    return erroGeral ? (
      <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
        {erroGeral}
      </p>
    ) : (
      <p className="text-sm text-slate-500">Carregando…</p>
    );
  }

  const d = dados;
  const set = (patch: Partial<DadosFamilia>) => setDados({ ...d, ...patch });
  const setAluno = (patch: Partial<DadosFamilia["aluno"]>) => set({ aluno: { ...d.aluno, ...patch } });
  const setLegal = (patch: Partial<DadosFamilia["responsavelLegal"]>) => set({ responsavelLegal: { ...d.responsavelLegal, ...patch } });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    const corpo = { ...d, imagem };
    const lido = dadosFamiliaSchema.safeParse(corpo);
    if (!lido.success) {
      const novo: Erros = {};
      for (const issue of lido.error.issues) {
        const chave = issue.path.join(".");
        if (!novo[chave]) novo[chave] = issue.message;
      }
      setErros(novo);
      setErroGeral(`Confira ${Object.keys(novo).length === 1 ? "o campo destacado" : `os ${Object.keys(novo).length} campos destacados`} antes de continuar.`);
      // Leva ao primeiro campo com problema.
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true'], [data-erro='true']")?.focus());
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      await apiJson(`/api/contratos/${contratoId}/dados`, { method: "POST", body: JSON.stringify(corpo) });
      onGerado();
    } catch (err) {
      setErroGeral(err instanceof Error ? err.message : "Não foi possível gerar o contrato. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  const primeiroNome = resumo.aluno.split(" ")[0];
  const legalOpcoes: { v: DadosFamilia["responsavelLegal"]["quem"]; label: string }[] = [
    { v: "FINANCEIRO", label: `O responsável financeiro${d.financeiro.nome ? ` (${d.financeiro.nome.split(" ")[0]})` : ""}` },
    ...(!d.pedagogicoMesmo ? [{ v: "PEDAGOGICO" as const, label: `O responsável pedagógico${d.pedagogico?.nome ? ` (${d.pedagogico.nome.split(" ")[0]})` : ""}` }] : []),
    { v: "OUTRO", label: "Outra pessoa" },
  ];

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Contrato de {resumo.aluno}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-slate-500">Turma</dt>
          <dd>{resumo.turma}</dd>
          {resumo.periodo && (
            <>
              <dt className="text-slate-500">Período</dt>
              <dd>{resumo.periodo}</dd>
            </>
          )}
          {resumo.temValores && (
            <>
              <dt className="text-slate-500">Anuidade</dt>
              <dd>
                R$ {formatarDinheiro(resumo.anuidade)} em {resumo.parcelas} parcelas de R$ {formatarDinheiro(resumo.parcelaBruta)}
              </dd>
              <dt className="text-slate-500">Até o dia {resumo.vencimentoDia}</dt>
              <dd>
                R$ {formatarDinheiro(resumo.parcelaLiquida)} por parcela (desconto de R$ {formatarDinheiro(resumo.descontoValor)})
              </dd>
            </>
          )}
        </dl>
        {!resumo.periodo && <p className="mt-2 text-xs text-slate-500">O período e os campos que ficarem em branco podem ser marcados à mão no contrato.</p>}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-slate-900">Responsável financeiro (quem assina e paga)</legend>
        <CamposPessoa prefixo="financeiro" pessoa={d.financeiro} onChange={(p) => set({ financeiro: p })} erros={erros} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-slate-900">Responsável pedagógico</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={d.pedagogicoMesmo}
            onChange={(e) =>
              set({
                pedagogicoMesmo: e.target.checked,
                pedagogico: e.target.checked ? null : (d.pedagogico ?? pessoaVazia({ endereco: d.financeiro.endereco, numero: d.financeiro.numero, complemento: d.financeiro.complemento, cep: d.financeiro.cep, bairro: d.financeiro.bairro, cidade: d.financeiro.cidade, uf: d.financeiro.uf })),
                responsavelLegal: e.target.checked && d.responsavelLegal.quem === "PEDAGOGICO" ? { ...d.responsavelLegal, quem: "FINANCEIRO" } : d.responsavelLegal,
              })
            }
            className="h-5 w-5"
          />
          É a mesma pessoa do responsável financeiro
        </label>
        {!d.pedagogicoMesmo && d.pedagogico && (
          <CamposPessoa prefixo="pedagogico" pessoa={d.pedagogico} onChange={(p) => set({ pedagogico: p })} erros={erros} />
        )}
        {erros["pedagogico"] && <p className="text-sm text-red-700">{erros["pedagogico"]}</p>}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-slate-900">Dados de {primeiroNome}</legend>
        <div className="grid gap-3 sm:grid-cols-6">
          <Campo
            id="aluno-nasc"
            label="Data de nascimento"
            valor={d.aluno.nascimento}
            onChange={(v) => setAluno({ nascimento: mascaraData(v) })}
            erro={erros["aluno.nascimento"]}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            className="sm:col-span-2"
          />
          <Campo id="aluno-rg" label="RG (se tiver)" valor={d.aluno.rg} onChange={(v) => setAluno({ rg: v })} erro={erros["aluno.rg"]} className="sm:col-span-2" />
          <Campo id="aluno-orgao" label="Órgão emissor" valor={d.aluno.orgao} onChange={(v) => setAluno({ orgao: v })} erro={erros["aluno.orgao"]} className="sm:col-span-1" />
          <Campo id="aluno-uf" label="UF" valor={d.aluno.uf} onChange={(v) => setAluno({ uf: v.toUpperCase().slice(0, 2) })} erro={erros["aluno.uf"]} className="sm:col-span-1" />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-800">
          <input type="checkbox" checked={d.aluno.enderecoMesmo} onChange={(e) => setAluno({ enderecoMesmo: e.target.checked })} className="h-5 w-5" />
          Mora no mesmo endereço do responsável financeiro
        </label>
        {!d.aluno.enderecoMesmo && (
          <div className="grid gap-3 sm:grid-cols-6">
            <Campo id="aluno-end" label="Endereço" valor={d.aluno.endereco} onChange={(v) => setAluno({ endereco: v })} erro={erros["aluno.endereco"]} className="sm:col-span-4" />
            <Campo id="aluno-num" label="Número" valor={d.aluno.numero} onChange={(v) => setAluno({ numero: v })} erro={erros["aluno.numero"]} className="sm:col-span-2" />
            <Campo id="aluno-compl" label="Complemento" valor={d.aluno.complemento} onChange={(v) => setAluno({ complemento: v })} className="sm:col-span-3" />
            <Campo id="aluno-cep" label="CEP" valor={d.aluno.cep} onChange={(v) => setAluno({ cep: mascaraCep(v) })} erro={erros["aluno.cep"]} inputMode="numeric" className="sm:col-span-3" />
            <Campo id="aluno-bairro" label="Bairro" valor={d.aluno.bairro} onChange={(v) => setAluno({ bairro: v })} erro={erros["aluno.bairro"]} className="sm:col-span-3" />
            <Campo id="aluno-cidade" label="Cidade" valor={d.aluno.cidade} onChange={(v) => setAluno({ cidade: v })} erro={erros["aluno.cidade"]} className="sm:col-span-3" />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-slate-900">Responsável legal (quem tem a guarda)</legend>
        <div className="grid gap-2">
          {legalOpcoes.map((o) => (
            <label key={o.v} className={`flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm ${d.responsavelLegal.quem === o.v ? "border-indigo-500 bg-indigo-50" : "border-slate-300"}`}>
              <input type="radio" name="legal-quem" checked={d.responsavelLegal.quem === o.v} onChange={() => setLegal({ quem: o.v })} className="h-4 w-4" />
              {o.label}
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {d.responsavelLegal.quem === "OUTRO" && (
            <>
              <Campo id="legal-nome" label="Nome completo" valor={d.responsavelLegal.nome} onChange={(v) => setLegal({ nome: v })} erro={erros["responsavelLegal.nome"]} />
              <Campo id="legal-cpf" label="CPF" valor={d.responsavelLegal.cpf} onChange={(v) => setLegal({ cpf: mascaraCpf(v) })} erro={erros["responsavelLegal.cpf"]} inputMode="numeric" />
              <Campo id="legal-contato" label="Telefone para contato" valor={d.responsavelLegal.contato} onChange={(v) => setLegal({ contato: v })} type="tel" />
            </>
          )}
          <Campo
            id="legal-vinculo"
            label={`Vínculo com ${primeiroNome}`}
            valor={d.responsavelLegal.vinculo}
            onChange={(v) => setLegal({ vinculo: v })}
            erro={erros["responsavelLegal.vinculo"]}
            placeholder="mãe, pai, avó, tutor…"
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-slate-900">Anexo I — Autorização de uso de imagem</legend>
        <p className="text-sm text-slate-600">
          Escolha uma opção em cada linha. Nada vem marcado: autorizar é opcional e não muda a matrícula. Você pode rever a decisão depois com a escola.
        </p>
        {erros["imagem"] && (
          <p data-erro="true" tabIndex={-1} className="text-sm text-red-700">
            {erros["imagem"]}
          </p>
        )}
        <ol className="space-y-2">
          {LINHAS_ANEXO_IMAGEM.map((texto, i) => {
            const faltando = Boolean(erros["imagem"] || erros[`imagem.${i}`]) && !imagem[i];
            return (
              <li key={i} className={`rounded-lg border p-3 text-sm ${faltando ? "border-red-400 bg-red-50" : "border-slate-200"}`}>
                <p id={`img-${i}`} className="text-slate-800">
                  {i + 1}. {texto}
                </p>
                <div role="radiogroup" aria-labelledby={`img-${i}`} className="mt-2 flex flex-wrap gap-2">
                  {(["AUTORIZO", "NAO_AUTORIZO"] as const).map((v) => (
                    <label
                      key={v}
                      className={`flex min-h-11 flex-1 items-center gap-2 rounded-lg border px-3 ${imagem[i] === v ? "border-indigo-500 bg-indigo-50 font-semibold" : "border-slate-300 bg-white"}`}
                    >
                      <input
                        type="radio"
                        name={`imagem-${i}`}
                        checked={imagem[i] === v}
                        onChange={() => setImagem((atual) => atual.map((x, j) => (j === i ? v : x)))}
                        className="h-4 w-4"
                      />
                      {v === "AUTORIZO" ? "Autorizo" : "Não autorizo"}
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </fieldset>

      <label className="flex min-h-11 items-start gap-3 text-sm text-slate-800">
        <input type="checkbox" checked={conferi} onChange={(e) => setConferi(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
        <span>Conferi os dados acima e quero gerar o contrato para assinar.</span>
      </label>

      {erroGeral && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erroGeral}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!conferi || enviando} className={`${botaoPrimario} w-full sm:w-auto`}>
          {enviando ? "Gerando o contrato…" : "Gerar contrato para assinar"}
        </button>
        {onCancelar && (
          <button type="button" onClick={onCancelar} className={`${botaoSecundario} w-full sm:w-auto`}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
