"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { apiJson } from "@/lib/api-client";
import { CAMPANHA_REMATRICULA } from "@/lib/rematricula";
import { MODELO_CONTRATO_2027, formatarDinheiro, type ValoresContrato as Valores } from "@/lib/contrato-modelo/tipos";
import type { SituacaoValor } from "@/lib/contrato-modelo/conferencia";
import { ValoresContrato } from "@/components/ValoresContrato";
import { AcoesPdf } from "@/components/AcoesPdf";
import { ContratoModeloPainel } from "./ContratoModeloPainel";
import { ConferenciaAssinatura } from "./ConferenciaAssinatura";
import { ConfirmarRenovacao } from "./ConfirmarRenovacao";
import {
  CONTRATO_LIMITE_ENVIO_SERVIDOR,
  ContratoErro,
  METODO_LABEL,
  STATUS_CONTRATO_LABEL,
  formatarDataHora,
  nomeArquivoPdfSeguro,
  podeConfirmarPelaEscola,
  textoEnvioPdf,
  validarPdf,
  type ContratoMetodo,
  type ContratoStatus,
} from "@/lib/contratos";

interface Arquivo {
  id: string;
  tipo: "MODELO" | "ASSINADO";
  nomeArquivo: string;
  tamanhoBytes: number;
  sha256: string;
  ipOrigem: string | null;
  createdAt: string;
  enviadoPor: { id: string; name: string } | null;
}

interface Evento {
  id: string;
  tipo: "CRIADO" | "DADOS_PREENCHIDOS" | "CONDICOES_ATUALIZADAS" | "ASSINADO_ENVIADO" | "DEVOLVIDO" | "CONFERIDO" | "ORIGINAL_RECEBIDO" | "RENOVACAO_CONFIRMADA";
  ipOrigem: string | null;
  arquivoSha256: string | null;
  detalhe: string | null;
  createdAt: string;
  usuario: { name: string; role: string } | null;
}

interface Contrato {
  id: string;
  titulo: string;
  anoLetivo: number;
  status: ContratoStatus;
  metodoAssinatura: ContratoMetodo | null;
  assinadoEnviadoEm: string | null;
  motivoDevolucao: string | null;
  /** A direção anexou o contrato assinado fora do app e confirmou a renovação. */
  confirmadoPelaEscola: boolean;
  modelo: string | null;
  dadosPreenchidos: boolean;
  valores: Valores | null;
  /** Só contratos do app 2027: valor do contrato x mensalidade cadastrada corrigida. */
  conferencia: {
    situacao: SituacaoValor;
    rotulo: string;
    valorContrato: number;
    valorEsperado: number | null;
    assinado: boolean;
    atualizavel: boolean;
  } | null;
  createdAt: string;
  student: {
    id: string;
    name: string;
    class: { name: string };
    guardians: { relation: string | null; guardian: { id: string; name: string; phone: string | null } }[];
  };
  arquivos: Arquivo[];
  eventos: Evento[];
}

interface AlunoOpcao {
  id: string;
  name: string;
  class: { id: string; name: string };
}

const STATUS_COR: Record<ContratoStatus, string> = {
  AGUARDANDO_ASSINATURA: "bg-amber-100 text-amber-900",
  DEVOLVIDO: "bg-red-100 text-red-900",
  EM_CONFERENCIA: "bg-sky-100 text-sky-900",
  AGUARDANDO_ORIGINAL: "bg-indigo-100 text-indigo-900",
  COMPLETO: "bg-emerald-100 text-emerald-900",
};

// O que precisa de ação da secretaria aparece primeiro.
const PRIORIDADE: Record<ContratoStatus, number> = {
  EM_CONFERENCIA: 0,
  AGUARDANDO_ORIGINAL: 1,
  AGUARDANDO_ASSINATURA: 2,
  DEVOLVIDO: 3,
  COMPLETO: 4,
};

const EVENTO_LABEL: Record<Evento["tipo"], string> = {
  CRIADO: "Contrato enviado à família",
  DADOS_PREENCHIDOS: "Família preencheu os dados no app (contrato gerado preenchido)",
  CONDICOES_ATUALIZADAS: "Escola corrigiu as condições (contrato gerado novamente)",
  ASSINADO_ENVIADO: "Família enviou o contrato assinado",
  DEVOLVIDO: "Devolvido para correção",
  CONFERIDO: "Conferido e aprovado",
  ORIGINAL_RECEBIDO: "Via original recebida",
  RENOVACAO_CONFIRMADA: "Renovação confirmada pela escola (contrato assinado fora do app, anexado pela direção)",
};

const btn =
  "inline-flex min-h-10 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50";
const btnPrimario = `${btn} bg-indigo-600 text-white hover:bg-indigo-700`;
const btnSecundario = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

function urlArquivo(contratoId: string, arquivoId: string) {
  return `/api/contratos/${contratoId}/arquivos/${arquivoId}`;
}

function linkWhatsApp(telefone: string, responsavel: string, aluno: string) {
  let numero = telefone.replace(/\D/g, "");
  if (numero.length === 10 || numero.length === 11) numero = `55${numero}`;
  const texto = `Olá, ${responsavel.split(" ")[0]}! Aqui é da secretaria. O contrato de matrícula de ${aluno.split(" ")[0]} já está no ClassLink, no menu Contratos. Dá para assinar grátis pelo gov.br e enviar por lá mesmo. Qualquer dúvida, estamos à disposição!`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function NovoContrato({ ano, contratos, onCriado }: { ano: number; contratos: Contrato[]; onCriado: () => void }) {
  const [alunos, setAlunos] = useState<AlunoOpcao[]>([]);
  const [studentId, setStudentId] = useState("");
  const [anoLetivo, setAnoLetivo] = useState(ano);
  const [titulo, setTitulo] = useState(`Contrato de prestação de serviços educacionais ${ano}`);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiJson<{ students: AlunoOpcao[] }>("/api/admin/students")
      .then((data) => setAlunos(data.students))
      .catch(() => setAlunos([]));
  }, []);

  const jaEnviados = useMemo(
    () => new Set(contratos.filter((c) => c.anoLetivo === anoLetivo).map((c) => c.student.id)),
    [contratos, anoLetivo],
  );

  const porTurma = useMemo(() => {
    const grupos = new Map<string, AlunoOpcao[]>();
    for (const a of alunos) grupos.set(a.class.name, [...(grupos.get(a.class.name) ?? []), a]);
    return [...grupos.entries()];
  }, [alunos]);

  async function escolherArquivo(file: File | null) {
    setErro(null);
    setArquivo(null);
    if (!file) return;
    if (file.size > CONTRATO_LIMITE_ENVIO_SERVIDOR) {
      setErro("O PDF passa de 4 MB. Exporte o contrato novamente com tamanho menor.");
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

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId || !arquivo) return;
    setEnviando(true);
    setErro(null);
    setSucesso(null);
    try {
      const form = new FormData();
      form.append("studentId", studentId);
      form.append("anoLetivo", String(anoLetivo));
      form.append("titulo", titulo);
      form.append("file", arquivo, arquivo.name);
      await apiJson("/api/admin/contratos", { method: "POST", body: form });
      const nome = alunos.find((a) => a.id === studentId)?.name ?? "o aluno";
      setSucesso(`Contrato enviado para ${nome}. Os responsáveis foram avisados no app.`);
      // Mantém ano e título para agilizar o próximo envio; limpa aluno e arquivo.
      setStudentId("");
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = "";
      onCriado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar o contrato");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Enviar um PDF próprio (aditivo ou outro modelo)</h2>
      <p className="text-sm text-slate-600">
        Anexe o PDF já preenchido com os dados do aluno. A família recebe um aviso no app e assina pelo gov.br (grátis) ou à
        mão.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <label htmlFor="novo-aluno" className="mb-1 block text-xs font-medium text-slate-600">
            Aluno
          </label>
          <select
            id="novo-aluno"
            required
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="">Escolha o aluno…</option>
            {porTurma.map(([turma, lista]) => (
              <optgroup key={turma} label={turma}>
                {lista.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {jaEnviados.has(a.id) ? " — já tem contrato neste ano" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="novo-ano" className="mb-1 block text-xs font-medium text-slate-600">
            Ano letivo
          </label>
          <input
            id="novo-ano"
            type="number"
            min={2020}
            max={2100}
            required
            value={anoLetivo}
            onChange={(e) => setAnoLetivo(Number(e.target.value))}
            className="min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label htmlFor="novo-titulo" className="mb-1 block text-xs font-medium text-slate-600">
          Título (aparece para a família)
        </label>
        <input
          id="novo-titulo"
          required
          minLength={3}
          maxLength={150}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
        />
      </div>
      <div>
        <label htmlFor="novo-arquivo" className="mb-1 block text-xs font-medium text-slate-600">
          PDF do contrato preenchido (até 4 MB)
        </label>
        <input
          ref={inputRef}
          id="novo-arquivo"
          type="file"
          accept="application/pdf,.pdf"
          required
          onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:text-sm file:font-semibold hover:file:bg-slate-200"
        />
      </div>
      {studentId && jaEnviados.has(studentId) && (
        <p className="text-sm text-amber-800">Atenção: este aluno já tem contrato em {anoLetivo}. Envie só se for um aditivo.</p>
      )}
      {erro && (
        <p role="alert" className="text-sm text-red-700">
          {erro}
        </p>
      )}
      {sucesso && (
        <p role="status" className="text-sm font-medium text-emerald-800">
          ✓ {sucesso}
        </p>
      )}
      <button type="submit" disabled={!studentId || !arquivo || enviando} className={btnPrimario}>
        {enviando ? "Enviando…" : "Enviar para a família"}
      </button>
    </form>
  );
}

/**
 * Renovação que nunca passou pelo app (contrato feito e assinado fora): a direção escolhe o
 * aluno, anexa o contrato assinado e confirma. O app cria o registro já assinado.
 */
function RegistrarRenovacaoForaDoApp({ ano, contratos, onRegistrado }: { ano: number; contratos: Contrato[]; onRegistrado: () => void }) {
  const [alunos, setAlunos] = useState<AlunoOpcao[]>([]);
  const [studentId, setStudentId] = useState("");
  const [titulo, setTitulo] = useState(`Contrato de prestação de serviços educacionais ${ano}`);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [chave, setChave] = useState(0);

  useEffect(() => {
    apiJson<{ students: AlunoOpcao[] }>("/api/admin/students")
      .then((data) => setAlunos(data.students))
      .catch(() => setAlunos([]));
  }, []);

  const contratoDoAluno = useMemo(() => {
    const m = new Map<string, Contrato>();
    for (const c of contratos) if (c.anoLetivo === ano) m.set(c.student.id, c);
    return m;
  }, [contratos, ano]);

  const porTurma = useMemo(() => {
    const grupos = new Map<string, AlunoOpcao[]>();
    for (const a of alunos) grupos.set(a.class.name, [...(grupos.get(a.class.name) ?? []), a]);
    return [...grupos.entries()];
  }, [alunos]);

  const aluno = alunos.find((a) => a.id === studentId);
  const existente = studentId ? contratoDoAluno.get(studentId) : undefined;
  const existenteAberto = existente && podeConfirmarPelaEscola(existente.status);

  return (
    <div className="space-y-3 p-4 text-sm">
      <p className="text-slate-600">
        Para alunos que renovaram com contrato feito e assinado fora do app. Se o contrato já foi enviado pelo app, use o botão
        &quot;Confirmar renovação&quot; no cartão dele, na lista abaixo.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="renovar-aluno" className="mb-1 block text-xs font-medium text-slate-600">
            Aluno
          </label>
          <select
            id="renovar-aluno"
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setSucesso(null);
            }}
            className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="">Escolha o aluno…</option>
            {porTurma.map(([turma, lista]) => (
              <optgroup key={turma} label={turma}>
                {lista.map((a) => {
                  const c = contratoDoAluno.get(a.id);
                  return (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {c ? ` — já tem contrato ${ano} (${STATUS_CONTRATO_LABEL[c.status].toLowerCase()})` : ""}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="renovar-titulo" className="mb-1 block text-xs font-medium text-slate-600">
            Título do contrato ({ano})
          </label>
          <input
            id="renovar-titulo"
            minLength={3}
            maxLength={150}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
          />
        </div>
      </div>
      {sucesso && (
        <p role="status" className="font-medium text-emerald-800">
          ✓ {sucesso}
        </p>
      )}
      {aluno && existenteAberto && (
        <p className="rounded-md bg-amber-50 p-2 text-amber-900">
          {aluno.name} já tem contrato {ano} enviado pelo app ({STATUS_CONTRATO_LABEL[existente!.status].toLowerCase()}). Confirme a
          renovação no cartão desse contrato, na lista abaixo, para não ficar um contrato duplicado em aberto.
        </p>
      )}
      {aluno && !existenteAberto && (
        <>
          {existente && (
            <p className="text-amber-800">Atenção: {aluno.name} já tem um contrato {ano} concluído. Registre só se for outro documento (ex.: aditivo).</p>
          )}
          <ConfirmarRenovacao
            key={`${studentId}-${chave}`}
            studentId={aluno.id}
            nomeAluno={aluno.name}
            anoLetivo={ano}
            titulo={titulo}
            idCampos="renovacao-nova"
            onConfirmado={(msg) => {
              setSucesso(msg);
              setStudentId("");
              setChave((k) => k + 1);
              onRegistrado();
            }}
          />
        </>
      )}
    </div>
  );
}

function ContratoAdminCard({ c, onMudou }: { c: Contrato; onMudou: () => void }) {
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const modelo = c.arquivos.find((a) => a.tipo === "MODELO");
  const doApp = c.modelo === MODELO_CONTRATO_2027;
  const envios = c.arquivos.filter((a) => a.tipo === "ASSINADO");
  const ultimo = envios[0];

  async function agir(body: Record<string, string>) {
    setSalvando(true);
    setErro(null);
    try {
      await apiJson(`/api/admin/contratos/${c.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setDevolvendo(false);
      setMotivo("");
      onMudou();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function atualizarValor() {
    const v = c.conferencia?.valorEsperado;
    const texto = v ? `12 parcelas de R$ ${formatarDinheiro(v)} (total R$ ${formatarDinheiro(v * 12)})` : "isento (bolsista)";
    if (!confirm(`Atualizar o contrato de ${c.student.name} para ${texto}?\n\nO app gera o contrato novo e avisa a família para assinar esta versão.`)) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await apiJson<{ total: number }>("/api/admin/contratos/valores", { method: "POST", body: JSON.stringify({ ids: [c.id] }) });
      if (r.total === 0) setErro("Não foi possível atualizar: a família pode ter assinado nesse meio-tempo. Recarregue a página.");
      onMudou();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao atualizar o valor");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir o contrato de ${c.student.name}? Use só se foi enviado por engano.`)) return;
    try {
      await apiJson(`/api/admin/contratos/${c.id}`, { method: "DELETE" });
      onMudou();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  const aguardandoFamilia = c.status === "AGUARDANDO_ASSINATURA" || c.status === "DEVOLVIDO";

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{c.student.name}</h3>
          <p className="text-slate-600">
            {c.student.class.name} · {c.titulo}
            {doApp && " · modelo do app"}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COR[c.status]}`}>{STATUS_CONTRATO_LABEL[c.status]}</span>
      </div>

      {ultimo && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <p className="font-medium text-slate-900">
            {c.confirmadoPelaEscola ? "Assinado fora do app · anexado pela escola" : "Enviado"} por{" "}
            {ultimo.enviadoPor?.name ?? (c.confirmadoPelaEscola ? "direção" : "responsável")} em {formatarDataHora(ultimo.createdAt)}
            {c.metodoAssinatura && ` · ${METODO_LABEL[c.metodoAssinatura]}`}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            SHA-256 {ultimo.sha256.slice(0, 16)}… · IP {ultimo.ipOrigem ?? "não informado"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <AcoesPdf
              url={urlArquivo(c.id, ultimo.id)}
              nome={nomeArquivoPdfSeguro(ultimo.nomeArquivo)}
              rotuloBaixar="Baixar"
              rotuloAbrir="Ver assinado"
              rotuloCompartilhar="Compartilhar"
              tituloCompartilhar={`${c.titulo} (assinado) - ${c.student.name}`}
              classePrimario={btnSecundario}
              classeSecundario={btnSecundario}
            />
          </div>
          <div className="mt-2">
            <ConferenciaAssinatura
              contratoId={c.id}
              arquivoId={ultimo.id}
              urlPdf={urlArquivo(c.id, ultimo.id)}
              nomePdf={nomeArquivoPdfSeguro(ultimo.nomeArquivo)}
              metodoGovBr={c.metodoAssinatura === "GOVBR"}
              classeBotao={btnSecundario}
            />
          </div>
          {c.status === "EM_CONFERENCIA" && c.metodoAssinatura === "MANUSCRITA" && (
            <p className="mt-2 text-xs text-slate-600">
              Assinatura à mão: ao aprovar, o contrato fica aguardando a via original em papel.
            </p>
          )}
        </div>
      )}

      {doApp && aguardandoFamilia && (
        <p className="mt-2 text-slate-600">
          {c.dadosPreenchidos ? "A família preencheu os dados no app; o contrato para assinar já sai preenchido." : "Contrato em branco enviado; a família pode preencher à mão ou no app."}
        </p>
      )}

      {c.status === "DEVOLVIDO" && c.motivoDevolucao && (
        <p className="mt-2 rounded-md bg-red-50 p-2 text-red-900">Motivo da devolução: {c.motivoDevolucao}</p>
      )}

      {c.conferencia && c.conferencia.situacao !== "OK" && c.conferencia.situacao !== "AJUSTADO" && (
        <div role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">
            {c.conferencia.situacao === "SEM_VALOR"
              ? "Este contrato foi enviado sem os valores de 2027."
              : c.conferencia.situacao === "VALOR_DIFERENTE"
                ? `Este contrato saiu com R$ ${formatarDinheiro(c.conferencia.valorContrato)} por parcela, diferente do valor corrigido.`
                : "Aluno sem mensalidade cadastrada: não há como calcular o valor 2027."}
          </p>
          {c.conferencia.situacao === "SEM_MENSALIDADE" ? (
            <p className="mt-1">Preencha a mensalidade no cadastro do aluno (ou marque como bolsista) e volte aqui para atualizar o contrato.</p>
          ) : (
            <p className="mt-1">
              Valor corrigido:{" "}
              {c.conferencia.valorEsperado
                ? `12 parcelas de R$ ${formatarDinheiro(c.conferencia.valorEsperado)} (total R$ ${formatarDinheiro(c.conferencia.valorEsperado * 12)}).`
                : "isento de mensalidade (bolsista)."}
              {c.conferencia.assinado && " A família já assinou esta versão: a correção precisa de aditivo."}
            </p>
          )}
          {c.conferencia.atualizavel && (
            <button type="button" disabled={salvando} onClick={atualizarValor} className={`${btnPrimario} mt-2`}>
              Atualizar este contrato com o valor corrigido
            </button>
          )}
        </div>
      )}

      {c.valores && (
        <div className="mt-2">
          <ValoresContrato valores={c.valores} ano={c.anoLetivo} mostrarCorrecao />
        </div>
      )}

      {modelo && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-slate-600">
            Contrato enviado para assinar (PDF){aguardandoFamilia && " — baixe ou envie o arquivo direto à família se ela não conseguir pelo app"}
          </p>
          <AcoesPdf
            url={urlArquivo(c.id, modelo.id)}
            nome={nomeArquivoPdfSeguro(modelo.nomeArquivo)}
            rotuloBaixar="Baixar PDF"
            rotuloAbrir="Ver contrato enviado"
            rotuloCompartilhar="Enviar PDF (WhatsApp, e-mail…)"
            tituloCompartilhar={c.titulo}
            textoCompartilhar={textoEnvioPdf(c.student.name)}
            classePrimario={btnPrimario}
            classeSecundario={btnSecundario}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {c.status === "EM_CONFERENCIA" && !devolvendo && (
          <>
            <button type="button" disabled={salvando} onClick={() => agir({ acao: "APROVAR" })} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
              Aprovar
            </button>
            <button type="button" disabled={salvando} onClick={() => setDevolvendo(true)} className={btnSecundario}>
              Devolver para correção
            </button>
          </>
        )}
        {c.status === "AGUARDANDO_ORIGINAL" && (
          <button type="button" disabled={salvando} onClick={() => agir({ acao: "ORIGINAL_RECEBIDO" })} className={btnPrimario}>
            Registrar via original recebida
          </button>
        )}
        {aguardandoFamilia &&
          c.student.guardians
            .filter((g) => g.guardian.phone)
            .map((g) => (
              <a
                key={g.guardian.id}
                href={linkWhatsApp(g.guardian.phone!, g.guardian.name, c.student.name)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btn} bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
              >
                Lembrar {g.guardian.name.split(" ")[0]} no WhatsApp
              </a>
            ))}
        {podeConfirmarPelaEscola(c.status) && !confirmando && (
          <button type="button" onClick={() => setConfirmando(true)} className={`${btn} border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50`}>
            Confirmar renovação (assinado fora do app)
          </button>
        )}
        {c.status === "AGUARDANDO_ASSINATURA" && envios.length === 0 && (
          <button type="button" onClick={excluir} className="px-2 py-2 text-xs text-red-700 hover:underline">
            Excluir (enviado por engano)
          </button>
        )}
      </div>

      {confirmando && podeConfirmarPelaEscola(c.status) && (
        <div className="mt-3 space-y-2">
          <p className="text-slate-700">
            Use quando a família assinou fora do app (papel na secretaria, PDF do gov.br recebido por WhatsApp ou e-mail). Anexe o
            contrato assinado: ele fica guardado aqui com o histórico, o contrato conta como renovado e os lembretes param.
            {envios.length > 0 && " O arquivo que a família já enviou continua guardado no histórico."}
          </p>
          <ConfirmarRenovacao
            studentId={c.student.id}
            nomeAluno={c.student.name}
            contratoId={c.id}
            anoLetivo={c.anoLetivo}
            idCampos={`renovacao-${c.id}`}
            onConfirmado={() => {
              setConfirmando(false);
              onMudou();
            }}
            onCancelar={() => setConfirmando(false)}
          />
        </div>
      )}

      {devolvendo && (
        <div className="mt-3 space-y-2">
          <label htmlFor={`motivo-${c.id}`} className="block text-xs font-medium text-slate-600">
            O que a família precisa corrigir? (aparece para ela)
          </label>
          <textarea
            id={`motivo-${c.id}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Ex.: falta a assinatura na página 3."
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={salvando || motivo.trim().length < 3}
              onClick={() => agir({ acao: "DEVOLVER", motivo })}
              className={btnPrimario}
            >
              Devolver
            </button>
            <button type="button" onClick={() => setDevolvendo(false)} className={btnSecundario}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="mt-2 text-red-700">
          {erro}
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-500">Histórico e auditoria ({c.eventos.length})</summary>
        <ol className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
          {c.eventos.map((ev) => (
            <li key={ev.id}>
              <span className="font-medium text-slate-800">{EVENTO_LABEL[ev.tipo]}</span> · {formatarDataHora(ev.createdAt)}
              {ev.usuario && ` · ${ev.usuario.name}`}
              {ev.ipOrigem && ` · IP ${ev.ipOrigem}`}
              {ev.detalhe && ` · ${ev.detalhe}`}
              {ev.arquivoSha256 && <span className="block break-all font-mono text-slate-400">SHA-256 {ev.arquivoSha256}</span>}
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

function ContratosContent() {
  const [ano, setAno] = useState<number>(CAMPANHA_REMATRICULA.ano);
  const [status, setStatus] = useState<ContratoStatus | "">("");
  const [dados, setDados] = useState<{ contratos: Contrato[]; resumo: { status: ContratoStatus; total: number }[]; anos: number[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Poucos contratos por ano (um por aluno): carrega o ano inteiro e filtra a situação aqui,
  // para a lista, os indicadores e o aviso de "já tem contrato" usarem os mesmos dados.
  const carregar = useCallback(() => {
    apiJson<{ contratos: Contrato[]; resumo: { status: ContratoStatus; total: number }[]; anos: number[] }>(`/api/contratos?ano=${ano}`)
      .then((d) => {
        setDados(d);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar"));
  }, [ano]);

  useEffect(carregar, [carregar]);

  const total = (s: ContratoStatus) => dados?.resumo.find((r) => r.status === s)?.total ?? 0;
  const indicadores: { status: ContratoStatus; label: string }[] = [
    { status: "EM_CONFERENCIA", label: "Para conferir" },
    { status: "AGUARDANDO_ASSINATURA", label: "Aguardando família" },
    { status: "AGUARDANDO_ORIGINAL", label: "Falta via original" },
    { status: "COMPLETO", label: "Completos" },
  ];

  const visiveis = (dados?.contratos ?? []).filter((c) => !status || c.status === status);
  const semValor = (dados?.contratos ?? []).filter((c) => c.conferencia && c.conferencia.situacao !== "OK" && c.conferencia.situacao !== "AJUSTADO");
  const semValorAtualizaveis = semValor.filter((c) => c.conferencia?.atualizavel).length;
  const ordenados = [...visiveis].sort(
    (a, b) => PRIORIDADE[a.status] - PRIORIDADE[b.status] || a.student.name.localeCompare(b.student.name, "pt-BR"),
  );
  const jaTemModelo = useMemo(
    () => new Set((dados?.contratos ?? []).filter((c) => c.modelo === MODELO_CONTRATO_2027).map((c) => c.student.id)),
    [dados],
  );
  const anosDisponiveis = [...new Set([CAMPANHA_REMATRICULA.ano, ...(dados?.anos ?? [])])].sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Contratos {ano}</h1>
          <p className="text-sm text-slate-500">Envio, assinatura e conferência dos contratos de matrícula — sem custo de plataforma.</p>
        </div>
        <div>
          <label htmlFor="filtro-ano" className="sr-only">
            Ano letivo
          </label>
          <select
            id="filtro-ano"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            {anosDisponiveis.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {indicadores.map((i) => (
          <button
            key={i.status}
            type="button"
            onClick={() => setStatus(status === i.status ? "" : i.status)}
            aria-pressed={status === i.status}
            className={`rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
              status === i.status ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <span className="block text-2xl font-bold text-slate-900">{total(i.status)}</span>
            <span className="text-xs text-slate-500">{i.label}</span>
          </button>
        ))}
      </div>

      <ContratoModeloPainel ano={ano} jaTemModelo={jaTemModelo} onEnviado={carregar} />

      <details className="rounded-xl border border-emerald-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-emerald-800">
          Confirmar renovação assinada fora do app (anexar o contrato)
        </summary>
        <div className="border-t border-slate-100">
          <RegistrarRenovacaoForaDoApp key={ano} ano={ano} contratos={dados?.contratos ?? []} onRegistrado={carregar} />
        </div>
      </details>

      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">Enviar um PDF próprio (aditivo ou outro modelo)</summary>
        <div className="border-t border-slate-100 [&>form]:rounded-none [&>form]:border-0">
          <NovoContrato key={ano} ano={ano} contratos={dados?.contratos ?? []} onCriado={carregar} />
        </div>
      </details>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">
          {status ? STATUS_CONTRATO_LABEL[status] : "Todos os contratos"} {dados ? `(${visiveis.length})` : ""}
        </h2>
        {status && (
          <button type="button" onClick={() => setStatus("")} className="text-sm text-indigo-700 hover:underline">
            Mostrar todos
          </button>
        )}
      </div>

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
      {semValor.length > 0 && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>{semValor.length} contrato(s) 2027 sem o valor corrigido.</strong> Eles aparecem com um aviso amarelo na lista abaixo;{" "}
          {semValorAtualizaveis > 0
            ? `${semValorAtualizaveis} ainda não foram assinados e podem ser atualizados no próprio cartão (ou todos de uma vez em "Conferir valores dos contratos já enviados", acima).`
            : "os que já foram assinados precisam de aditivo."}
        </p>
      )}
      {dados === null && !erro && <p className="text-sm text-slate-500">Carregando…</p>}
      {dados && visiveis.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Nenhum contrato {status ? "nesta situação" : `em ${ano}`}. Use o envio acima para começar.
        </p>
      )}
      <ul className="space-y-3">
        {ordenados.map((c) => (
          <ContratoAdminCard key={c.id} c={c} onMudou={carregar} />
        ))}
      </ul>
    </div>
  );
}

export default function ContratosAdminPage() {
  return (
    <AdminGuard>
      <ContratosContent />
    </AdminGuard>
  );
}
