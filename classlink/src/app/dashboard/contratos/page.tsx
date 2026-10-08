"use client";

import { useEffect, useRef, useState } from "react";
import { apiJson } from "@/lib/api-client";
import {
  CONTRATO_MAX_BYTES,
  ContratoErro,
  LINK_ASSINADOR_GOVBR,
  METODO_LABEL,
  STATUS_CONTRATO_LABEL,
  formatarDataHora,
  podeEnviarAssinado,
  validarPdf,
  type ContratoMetodo,
  type ContratoStatus,
} from "@/lib/contratos";
import { MODELO_CONTRATO_2027 } from "@/lib/contrato-modelo/tipos";
import { FormularioDados } from "./FormularioDados";

interface ArquivoResumo {
  id: string;
  tipo: "MODELO" | "ASSINADO";
  nomeArquivo: string;
  createdAt: string;
}

interface ContratoFamilia {
  id: string;
  titulo: string;
  anoLetivo: number;
  status: ContratoStatus;
  metodoAssinatura: ContratoMetodo | null;
  assinadoEnviadoEm: string | null;
  motivoDevolucao: string | null;
  modelo: string | null;
  createdAt: string;
  student: { id: string; name: string; class: { name: string } };
  arquivos: ArquivoResumo[];
}

const STATUS_COR: Record<ContratoStatus, string> = {
  AGUARDANDO_DADOS: "bg-orange-100 text-orange-900",
  AGUARDANDO_ASSINATURA: "bg-amber-100 text-amber-900",
  DEVOLVIDO: "bg-red-100 text-red-900",
  EM_CONFERENCIA: "bg-sky-100 text-sky-900",
  AGUARDANDO_ORIGINAL: "bg-indigo-100 text-indigo-900",
  COMPLETO: "bg-emerald-100 text-emerald-900",
};

const botaoPrimario =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60";
const botaoSecundario =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

function urlArquivo(contratoId: string, arquivoId: string, download = false) {
  return `/api/contratos/${contratoId}/arquivos/${arquivoId}${download ? "?download=1" : ""}`;
}

function FormularioEnvio({ contrato, onEnviado }: { contrato: ContratoFamilia; onEnviado: () => void }) {
  const [metodo, setMetodo] = useState<ContratoMetodo | "">("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [declaracao, setDeclaracao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const primeiroNome = contrato.student.name.split(" ")[0];

  async function escolherArquivo(file: File | null) {
    setErro(null);
    setArquivo(null);
    if (!file) return;
    if (file.size > CONTRATO_MAX_BYTES) {
      setErro("O arquivo passa de 4 MB. Gere o PDF novamente ou digitalize em resolução menor.");
      return;
    }
    try {
      // Confere só o começo do arquivo: é onde fica a marca "%PDF-".
      validarPdf(new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
      setArquivo(file);
    } catch (e) {
      setErro(e instanceof ContratoErro ? e.message : "Não foi possível ler o arquivo.");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!metodo || !arquivo || !declaracao) return;
    setEnviando(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("metodo", metodo);
      form.append("declaracao", "true");
      form.append("file", arquivo, arquivo.name);
      await apiJson(`/api/contratos/${contrato.id}/assinado`, { method: "POST", body: form });
      onEnviado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-800">Como você assinou?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["GOVBR", "MANUSCRITA"] as const).map((m) => (
            <label
              key={m}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                metodo === m ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white"
              }`}
            >
              <input
                type="radio"
                name={`metodo-${contrato.id}`}
                value={m}
                checked={metodo === m}
                onChange={() => setMetodo(m)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-semibold text-slate-900">{m === "GOVBR" ? "Pelo gov.br" : "À mão"}</span>
                <span className="text-slate-600">
                  {m === "GOVBR" ? "Assinatura digital gratuita (recomendado)" : "Impresso, assinado e digitalizado em PDF"}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {metodo === "MANUSCRITA" && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Assinou à mão? Depois de enviar aqui, entregue também a <strong>via original em papel</strong> na secretaria. O
          contrato só fica completo quando a escola receber o original.
        </p>
      )}

      <div>
        <label htmlFor={`arquivo-${contrato.id}`} className="mb-1 block text-sm font-medium text-slate-800">
          PDF do contrato assinado <span className="font-normal text-slate-500">(até 4 MB)</span>
        </label>
        <input
          ref={inputRef}
          id={`arquivo-${contrato.id}`}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-700 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:text-sm file:font-semibold file:text-slate-800 hover:file:bg-slate-200"
        />
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={declaracao}
          onChange={(e) => setDeclaracao(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        <span>
          Declaro que sou responsável por {primeiroNome} e que este arquivo é o contrato assinado por mim.
        </span>
      </label>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      <button type="submit" disabled={!metodo || !arquivo || !declaracao || enviando} className={`${botaoPrimario} w-full sm:w-auto`}>
        {enviando ? "Enviando…" : "Enviar contrato assinado"}
      </button>
    </form>
  );
}

function ContratoCard({ contrato, onAtualizar }: { contrato: ContratoFamilia; onAtualizar: () => void }) {
  const [enviadoAgora, setEnviadoAgora] = useState(false);
  const [geradoAgora, setGeradoAgora] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const doApp = contrato.modelo === MODELO_CONTRATO_2027;
  const modelo = contrato.arquivos.find((a) => a.tipo === "MODELO");
  const ultimoEnvio = contrato.arquivos.find((a) => a.tipo === "ASSINADO");
  const aguardandoFamilia = podeEnviarAssinado(contrato.status);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{contrato.titulo}</h2>
          <p className="text-sm text-slate-600">
            {contrato.student.name} · {contrato.student.class.name}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COR[contrato.status]}`}>
          {STATUS_CONTRATO_LABEL[contrato.status]}
        </span>
      </div>

      {enviadoAgora && (
        <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          ✓ Contrato enviado com sucesso!
        </p>
      )}

      {geradoAgora && !corrigindo && aguardandoFamilia && (
        <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          ✓ Contrato gerado com os seus dados. Agora é só baixar, assinar e enviar.
        </p>
      )}

      {contrato.status === "AGUARDANDO_DADOS" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            <strong>Passo 1 de 2:</strong> confira os seus dados. O app preenche o contrato e, em seguida, você assina pelo gov.br (grátis) ou à mão.
          </p>
          <FormularioDados
            contratoId={contrato.id}
            onGerado={() => {
              setGeradoAgora(true);
              onAtualizar();
            }}
          />
        </div>
      )}

      {corrigindo && aguardandoFamilia && (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">Corrija o que for preciso. O app gera um contrato novo; o anterior fica só no histórico.</p>
          <FormularioDados
            contratoId={contrato.id}
            onCancelar={() => setCorrigindo(false)}
            onGerado={() => {
              setCorrigindo(false);
              setGeradoAgora(true);
              onAtualizar();
            }}
          />
        </div>
      )}

      {contrato.status === "DEVOLVIDO" && contrato.motivoDevolucao && !corrigindo && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">A secretaria pediu um ajuste:</p>
          <p className="mt-1">{contrato.motivoDevolucao}</p>
          <p className="mt-1">
            {doApp ? "Se for um dado seu, use “Corrigir meus dados”; depois assine e envie novamente abaixo." : "Corrija e envie o contrato assinado novamente abaixo."}
          </p>
        </div>
      )}

      {aguardandoFamilia && modelo && !corrigindo && (
        <ol className="space-y-4">
          <li>
            <h3 className="text-sm font-semibold text-slate-900">1. Baixe o contrato</h3>
            <p className="mb-2 text-sm text-slate-600">Leia com atenção. Se tiver dúvida, fale com a secretaria em Mensagens.</p>
            <div className="flex flex-wrap gap-2">
              <a href={urlArquivo(contrato.id, modelo.id, true)} className={botaoPrimario}>
                Baixar contrato (PDF)
              </a>
              <a href={urlArquivo(contrato.id, modelo.id)} target="_blank" rel="noopener noreferrer" className={botaoSecundario}>
                Ler no navegador
              </a>
              {doApp && (
                <button type="button" onClick={() => setCorrigindo(true)} className={botaoSecundario}>
                  Corrigir meus dados
                </button>
              )}
            </div>
          </li>
          <li>
            <h3 className="text-sm font-semibold text-slate-900">2. Assine</h3>
            <div className="mt-1 space-y-2 text-sm text-slate-700">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">Pelo gov.br — grátis, sem imprimir (recomendado)</p>
                <p className="mt-1">
                  Abra o Assinador gov.br, entre com sua conta gov.br (nível prata ou ouro — a mesma do app do banco ou do
                  Meu INSS), envie o PDF, posicione a assinatura e baixe o arquivo assinado.
                </p>
                <a
                  href={LINK_ASSINADOR_GOVBR}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${botaoSecundario} mt-2`}
                >
                  Abrir o Assinador gov.br ↗
                </a>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">À mão</p>
                <p className="mt-1">
                  Imprima, assine e digitalize em PDF pelo celular (Google Drive → Digitalizar, ou app Notas no iPhone). Depois,
                  entregue a via original na secretaria.
                </p>
              </div>
            </div>
          </li>
          <li>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">3. Envie o PDF assinado</h3>
            <FormularioEnvio
              contrato={contrato}
              onEnviado={() => {
                setEnviadoAgora(true);
                onAtualizar();
              }}
            />
          </li>
        </ol>
      )}

      {contrato.status === "EM_CONFERENCIA" && (
        <p className="text-sm text-slate-700">
          Recebemos o seu contrato{contrato.assinadoEnviadoEm && ` em ${formatarDataHora(contrato.assinadoEnviadoEm)}`}
          {contrato.metodoAssinatura && ` (${METODO_LABEL[contrato.metodoAssinatura].toLowerCase()})`}. A secretaria vai conferir e
          você recebe o aviso por aqui.
        </p>
      )}

      {contrato.status === "AGUARDANDO_ORIGINAL" && (
        <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
          Contrato conferido ✓ Falta só entregar a <strong>via original assinada, em papel,</strong> na secretaria.
        </p>
      )}

      {contrato.status === "COMPLETO" && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          Contrato completo ✓ Obrigado! Guarde uma cópia do arquivo assinado.
        </p>
      )}

      {!aguardandoFamilia && (modelo || ultimoEnvio) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ultimoEnvio && (
            <a href={urlArquivo(contrato.id, ultimoEnvio.id, true)} className={botaoSecundario}>
              Baixar o contrato que enviei
            </a>
          )}
          {modelo && (
            <a href={urlArquivo(contrato.id, modelo.id)} target="_blank" rel="noopener noreferrer" className={botaoSecundario}>
              Ver contrato original
            </a>
          )}
        </div>
      )}
    </li>
  );
}

export default function ContratosPage() {
  const [contratos, setContratos] = useState<ContratoFamilia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    apiJson<{ contratos: ContratoFamilia[] }>("/api/contratos")
      .then((data) => {
        setContratos(data.contratos);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar os contratos"));
  }

  useEffect(carregar, []);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Contratos</h1>
        <p className="text-sm text-slate-600">
          Assine o contrato de matrícula sem sair de casa — de graça, pelo gov.br — e envie por aqui.
        </p>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
      {contratos === null && !erro && <p className="text-sm text-slate-500">Carregando…</p>}
      {contratos?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          Nenhum contrato para assinar no momento. Quando a escola enviar o contrato de matrícula, ele aparece aqui e você
          recebe um aviso.
        </p>
      )}

      <ul className="space-y-4">
        {contratos?.map((c) => (
          <ContratoCard key={c.id} contrato={c} onAtualizar={carregar} />
        ))}
      </ul>
    </div>
  );
}
