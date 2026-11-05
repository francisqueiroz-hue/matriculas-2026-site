"use client";

import { useRef, useState } from "react";
import { uploadPresigned } from "@vercel/blob/client";
import { apiJson } from "@/lib/api-client";
import { useCurrentUser } from "@/components/UserContext";
import {
  CONTRATO_LIMITE_ENVIO_SERVIDOR,
  CONTRATO_MAX_BYTES,
  ContratoErro,
  mensagemArquivoGrande,
  validarPdf,
  type ContratoMetodo,
} from "@/lib/contratos";

const btn =
  "inline-flex min-h-10 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50";
const btnPrimario = `${btn} bg-emerald-600 text-white hover:bg-emerald-700`;
const btnSecundario = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

/** Hoje no fuso de quem está usando, no formato do <input type="date">. */
function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Campos da confirmação de renovação assinada fora do app: como foi assinado, data, via
 * original, observação, PDF e declaração. Usado no cartão de um contrato já enviado
 * (`contratoId`) e no registro de renovação de aluno sem contrato no app (sem `contratoId`,
 * com `titulo` e `anoLetivo`). PDFs acima de 4 MB vão direto ao armazenamento privado.
 */
export function ConfirmarRenovacao({
  studentId,
  nomeAluno,
  contratoId,
  anoLetivo,
  titulo,
  idCampos,
  onConfirmado,
  onCancelar,
}: {
  studentId: string;
  nomeAluno: string;
  contratoId?: string;
  anoLetivo: number;
  titulo?: string;
  /** Prefixo dos ids dos campos (rótulos acessíveis únicos na página). */
  idCampos: string;
  onConfirmado: (mensagem: string) => void;
  onCancelar?: () => void;
}) {
  const user = useCurrentUser();
  const [metodo, setMetodo] = useState<ContratoMetodo | "">("");
  const [originalNaEscola, setOriginalNaEscola] = useState(true);
  const [dataAssinatura, setDataAssinatura] = useState(hojeIso());
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [declaracao, setDeclaracao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function escolherArquivo(file: File | null) {
    setErro(null);
    setArquivo(null);
    if (!file) return;
    if (file.size > CONTRATO_MAX_BYTES) {
      setErro(mensagemArquivoGrande());
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    try {
      validarPdf(new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
      setArquivo(file);
    } catch (e) {
      setErro(e instanceof ContratoErro ? e.message : "Não foi possível ler o arquivo.");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const pronto = Boolean(metodo && arquivo && declaracao && dataAssinatura && (contratoId || (titulo && titulo.trim().length >= 3)));

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!pronto || !arquivo || !metodo) return;
    setEnviando(true);
    setErro(null);
    const campos: Record<string, string> = {
      studentId,
      anoLetivo: String(anoLetivo),
      metodo,
      originalNaEscola: metodo === "MANUSCRITA" && originalNaEscola ? "true" : "false",
      dataAssinatura,
      declaracao: "true",
      ...(contratoId ? { contratoId } : { titulo: titulo ?? "" }),
      ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
    };
    try {
      if (arquivo.size > CONTRATO_LIMITE_ENVIO_SERVIDOR) {
        const caminho = `classlink/${user.schoolId}/contratos/renovacao/${studentId}/${crypto.randomUUID()}.pdf`;
        setProgresso(0);
        await uploadPresigned(caminho, arquivo, {
          access: "private",
          handleUploadUrl: "/api/admin/contratos/renovacao/envio",
          contentType: "application/pdf",
          multipart: arquivo.size > 10 * 1024 * 1024,
          onUploadProgress: (p) => setProgresso(Math.round(p.percentage)),
        });
        await apiJson("/api/admin/contratos/renovacao", {
          method: "POST",
          body: JSON.stringify({ ...campos, path: caminho, nomeArquivo: arquivo.name }),
        });
      } else {
        const form = new FormData();
        for (const [k, v] of Object.entries(campos)) form.append(k, v);
        form.append("file", arquivo, arquivo.name);
        await apiJson("/api/admin/contratos/renovacao", { method: "POST", body: form });
      }
      const falta = metodo === "MANUSCRITA" && !originalNaEscola;
      onConfirmado(
        `Renovação de ${nomeAluno} confirmada${falta ? " (falta registrar a via original em papel)" : ""}. O documento ficou guardado no app e a família foi avisada.`,
      );
    } catch (err) {
      setErro(err instanceof Error && err.message ? err.message : "Não foi possível confirmar. Verifique a internet e tente de novo.");
    } finally {
      setEnviando(false);
      setProgresso(null);
    }
  }

  return (
    <form onSubmit={confirmar} className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-slate-700">Como o contrato foi assinado?</legend>
        <div className="flex flex-wrap gap-2">
          {(["GOVBR", "MANUSCRITA"] as const).map((m) => (
            <label
              key={m}
              className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 ${metodo === m ? "border-emerald-500 bg-white" : "border-slate-300 bg-white"}`}
            >
              <input type="radio" name={`${idCampos}-metodo`} value={m} checked={metodo === m} onChange={() => setMetodo(m)} className="h-4 w-4" />
              {m === "GOVBR" ? "Pelo gov.br (assinatura digital)" : "À mão (papel)"}
            </label>
          ))}
        </div>
      </fieldset>

      {metodo === "MANUSCRITA" && (
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={originalNaEscola} onChange={(e) => setOriginalNaEscola(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>A via original assinada em papel já está arquivada na escola</span>
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
        <div>
          <label htmlFor={`${idCampos}-data`} className="mb-1 block text-xs font-medium text-slate-700">
            Data da assinatura
          </label>
          <input
            id={`${idCampos}-data`}
            type="date"
            required
            max={hojeIso()}
            value={dataAssinatura}
            onChange={(e) => setDataAssinatura(e.target.value)}
            className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2"
          />
        </div>
        <div>
          <label htmlFor={`${idCampos}-obs`} className="mb-1 block text-xs font-medium text-slate-700">
            Observação (opcional, fica no histórico)
          </label>
          <input
            id={`${idCampos}-obs`}
            maxLength={300}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: assinado na secretaria; PDF recebido por WhatsApp"
            className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3"
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${idCampos}-arquivo`} className="mb-1 block text-xs font-medium text-slate-700">
          PDF do contrato assinado (até 20 MB)
        </label>
        <input
          ref={inputRef}
          id={`${idCampos}-arquivo`}
          type="file"
          accept="application/pdf,.pdf"
          required
          onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-white file:px-3 file:text-sm file:font-semibold hover:file:bg-slate-100"
        />
      </div>

      <label className="flex items-start gap-2">
        <input type="checkbox" checked={declaracao} onChange={(e) => setDeclaracao(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>Confirmo que o arquivo anexado é o contrato de {nomeAluno} assinado pelo responsável.</span>
      </label>

      {erro && (
        <p role="alert" className="text-red-700">
          {erro}
        </p>
      )}
      {progresso !== null && (
        <p role="status" className="text-slate-600">
          Enviando o arquivo… {progresso}%
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!pronto || enviando} className={btnPrimario}>
          {enviando ? "Confirmando…" : "Confirmar renovação"}
        </button>
        {onCancelar && (
          <button type="button" onClick={onCancelar} className={btnSecundario}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
