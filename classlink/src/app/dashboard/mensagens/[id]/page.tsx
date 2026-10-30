"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/UserContext";
import { apiJson } from "@/lib/api-client";
import { useConsultaAdaptativa } from "@/lib/consulta-adaptativa";
import { avisoAnexoIndisponivel, rotuloDoAnexo, semLegenda } from "@/lib/anexo-mensagem";
import { ACCEPT_ANEXO, problemaNoAnexo, tamanhoLegivel } from "@/lib/anexo-envio";
import { enviarMensagemComArquivo } from "@/lib/anexo-envio-client";
import { ROTULO_ENVIO, explicacaoDoCanal, reciboPorCanal, whatsappDisponivel, type JanelaWhatsApp } from "@/lib/canal-envio";

type Canal = "APP" | "WHATSAPP" | "EMAIL";

/** Foto, documento, áudio ou vídeo (recebido pelo WhatsApp ou enviado pelo app). `url` nulo: não deu para baixar. */
interface Anexo {
  tipo: string;
  mime: string | null;
  nome: string | null;
  url: string | null;
}

/** Mensagem já normalizada para exibição, venha ela de uma conversa com responsável (com canal) ou de equipe (sem canal). */
interface DisplayMessage {
  id: string;
  body: string;
  channel: Canal | null;
  createdAt: string;
  /** Quando a outra pessoa abriu a mensagem (gravado pelo servidor). */
  readAt?: string | null;
  anexo?: Anexo | null;
  sender: { id: string; name: string; role: string };
}

interface GuardianConversationResponse {
  conversation: {
    id: string;
    staff: { id: string; name: string };
    guardian: { id: string; name: string; phone: string | null; email: string | null };
    janelaWhatsApp?: { aberta: boolean; ate: string | null; avisoPorModelo?: boolean };
  };
  messages: {
    id: string;
    body: string;
    channel: Canal;
    createdAt: string;
    readAt: string | null;
    anexo: Anexo | null;
    sender: { id: string; name: string; role: string };
  }[];
}

interface TeamConversationResponse {
  conversation: {
    id: string;
    userA: { id: string; name: string; role: string };
    userB: { id: string; name: string; role: string };
  };
  messages: { id: string; body: string; createdAt: string; readAt: string | null; sender: { id: string; name: string; role: string } }[];
}

/** Estado unificado da conversa, independente do tipo (responsável ou equipe). */
interface ConversationState {
  counterpart: { id: string; name: string };
  guardianPhone: string | null;
  guardianEmail: string | null;
  janelaWhatsApp: JanelaWhatsApp;
  /** Só relevante para conversas com responsável: se o usuário atual é o membro da equipe (habilita canal e requisição). */
  souStaffNaConversa: boolean;
  messages: DisplayMessage[];
}

const ITENS_REQUISICAO = [
  "Lenço umedecido",
  "Fraldas",
  "Pomada de assadura",
  "Shampoo",
  "Pasta de dente",
  "Escova de dente",
  "Troca de roupa",
];

const CANAL_LABEL: Record<Canal, string> = { APP: "ClassLink", WHATSAPP: "WhatsApp", EMAIL: "E-mail" };

export default function ConversationPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Carregando conversa...</p>}>
      <ConversationPageInner />
    </Suspense>
  );
}

function ConversationPageInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isEquipe = searchParams.get("tipo") === "equipe";
  const user = useCurrentUser();
  const [data, setData] = useState<ConversationState | null>(null);
  const [text, setText] = useState("");
  const [canalEnvio, setCanalEnvio] = useState<Canal>("APP");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [envioInfo, setEnvioInfo] = useState<string | null>(null);
  const [showRequisicao, setShowRequisicao] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState<string[]>([]);
  const [itemOutro, setItemOutro] = useState("");
  // Arquivo escolhido para ir com a próxima mensagem (declaração, documento, foto).
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Última mensagem vista: diz à consulta adaptativa se chegou algo novo.
  const ultimaVistaRef = useRef<string | null>(null);

  /** Carrega a conversa; devolve true se apareceu mensagem nova desde a última consulta. */
  function novidade(mensagens: { id: string }[]): boolean {
    const ultima = mensagens[mensagens.length - 1]?.id ?? null;
    const mudou = ultima !== ultimaVistaRef.current;
    ultimaVistaRef.current = ultima;
    return mudou;
  }

  async function load(): Promise<boolean> {
    if (isEquipe) {
      return apiJson<TeamConversationResponse>(`/api/team-messages/conversations/${id}`).then((res) => {
        const counterpart = user.id === res.conversation.userA.id ? res.conversation.userB : res.conversation.userA;
        setData({
          counterpart,
          guardianPhone: null,
          guardianEmail: null,
          janelaWhatsApp: { aberta: false, ate: null },
          souStaffNaConversa: false,
          messages: res.messages.map((m) => ({ ...m, channel: null })),
        });
        return novidade(res.messages);
      });
    } else {
      return apiJson<GuardianConversationResponse>(`/api/messages/conversations/${id}`).then((res) => {
        const souStaffNaConversa = user.id === res.conversation.staff.id;
        setData({
          counterpart: souStaffNaConversa ? res.conversation.guardian : res.conversation.staff,
          guardianPhone: res.conversation.guardian.phone,
          guardianEmail: res.conversation.guardian.email,
          janelaWhatsApp: {
            aberta: res.conversation.janelaWhatsApp?.aberta ?? false,
            ate: res.conversation.janelaWhatsApp?.ate ? new Date(res.conversation.janelaWhatsApp.ate) : null,
            avisoPorModelo: res.conversation.janelaWhatsApp?.avisoPorModelo ?? false,
          },
          souStaffNaConversa,
          messages: res.messages,
        });
        return novidade(res.messages);
      });
    }
  }

  // Abrir a conversa é o que registra a leitura: só consulta (e, portanto, só marca como lida)
  // com a aba visível. Começa a cada 4 s e espaça até 20 s enquanto ninguém escreve; mensagem
  // nova, envio ou voltar para a aba trazem de volta aos 4 s.
  const reiniciarConsulta = useConsultaAdaptativa(
    async () => (document.visibilityState === "visible" ? load() : false),
    { baseMs: 4_000, maxMs: 20_000, ocultoMs: null },
  );

  // Trocou de conversa: começa do zero.
  useEffect(() => {
    ultimaVistaRef.current = null;
    reiniciarConsulta();
  }, [id, isEquipe, reiniciarConsulta]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  /** WhatsApp vale com a janela de 24h aberta ou, fechada, com o aviso padrão; senão volta para o ClassLink. */
  function canalValido(): Canal {
    return canalEnvio === "WHATSAPP" && !whatsappDisponivel(data?.janelaWhatsApp) ? "APP" : canalEnvio;
  }

  async function enviarMensagem(body: string, channel: Canal = "APP", anexo: File | null = null) {
    setSending(true);
    setSendError(null);
    setEnvioInfo(null);
    try {
      type Resposta = { message: DisplayMessage; avisoPeloWhatsApp?: boolean };
      const path = isEquipe ? `/api/team-messages/conversations/${id}` : `/api/messages/conversations/${id}`;
      const payload = isEquipe ? { body } : { body, channel };
      const res =
        anexo && !isEquipe
          ? await enviarMensagemComArquivo<Resposta>({
              conversaId: id,
              escolaId: user.schoolId,
              texto: body,
              arquivo: anexo,
              aoProgredir: setProgresso,
            })
          : await apiJson<Resposta>(path, { method: "POST", body: JSON.stringify(payload) });
      const message: DisplayMessage = isEquipe ? { ...res.message, channel: null } : res.message;
      setData((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev));
      reiniciarConsulta(); // conversa ativa: volta a consultar no ritmo rápido
      if (res.avisoPeloWhatsApp) {
        setEnvioInfo("Mensagem enviada pelo ClassLink. A família foi avisada no WhatsApp, com um link para abrir.");
      }
      return true;
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Erro ao enviar mensagem");
      return false;
    } finally {
      setSending(false);
      setProgresso(null);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !arquivo) return;
    if (await enviarMensagem(text, arquivo ? "APP" : canalValido(), arquivo)) {
      setText("");
      tirarArquivo();
    }
  }

  function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const escolhido = e.target.files?.[0] ?? null;
    if (!escolhido) return;
    const problema = problemaNoAnexo(escolhido);
    if (problema) {
      setSendError(problema);
      e.target.value = "";
      return;
    }
    setSendError(null);
    setArquivo(escolhido);
  }

  function tirarArquivo() {
    setArquivo(null);
    if (arquivoRef.current) arquivoRef.current.value = "";
  }

  function toggleItem(item: string) {
    setItensSelecionados((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  }

  async function handleEnviarRequisicao(e: React.FormEvent) {
    e.preventDefault();
    const itens = [...itensSelecionados, ...(itemOutro.trim() ? [itemOutro.trim()] : [])];
    if (itens.length === 0) return;
    const corpo = `📋 Requisição de itens pessoais:\n${itens.map((i) => `- ${i}`).join("\n")}\n\nPor favor, providencie o quanto antes. Obrigado!`;
    if (await enviarMensagem(corpo, canalValido())) {
      setItensSelecionados([]);
      setItemOutro("");
      setShowRequisicao(false);
    }
  }

  if (!data) return <p className="text-sm text-slate-500">Carregando conversa...</p>;

  const podeUsarFuncoesDeResponsavel = !isEquipe && data.souStaffNaConversa;
  const guardianTemTelefone = Boolean(data.guardianPhone);
  const guardianTemEmail = Boolean(data.guardianEmail);
  // Arquivo vai sempre pelo ClassLink (armazenamento privado; só quem está na conversa abre).
  const canalAtual = podeUsarFuncoesDeResponsavel && !arquivo ? canalValido() : "APP";
  const podeAnexar = !isEquipe;

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">
          {data.counterpart.name}
          {isEquipe && <span className="ml-2 text-xs font-normal text-slate-400">· equipe</span>}
        </h1>
        {podeUsarFuncoesDeResponsavel && (
          <button
            type="button"
            onClick={() => setShowRequisicao((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
          >
            📋 Requisição
          </button>
        )}
      </div>

      {showRequisicao && podeUsarFuncoesDeResponsavel && (
        <form
          onSubmit={handleEnviarRequisicao}
          className="mb-3 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40"
        >
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Solicitar itens de uso pessoal à família
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ITENS_REQUISICAO.map((item) => (
              <label key={item} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={itensSelecionados.includes(item)} onChange={() => toggleItem(item)} />
                {item}
              </label>
            ))}
          </div>
          <input
            aria-label="Outro item"
            value={itemOutro}
            onChange={(e) => setItemOutro(e.target.value)}
            placeholder="Outro item (opcional)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={sending || (itensSelecionados.length === 0 && !itemOutro.trim())}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Enviar requisição
            </button>
            <button
              type="button"
              onClick={() => setShowRequisicao(false)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        {data.messages.map((m) => {
          const mine = m.sender.id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800"
                }`}
              >
                {m.anexo && <AnexoDaMensagem anexo={m.anexo} />}
                {!(m.anexo && semLegenda(m.body, m.anexo.tipo)) && <p className="whitespace-pre-wrap">{m.body}</p>}
                <p className={`mt-1 flex items-center gap-1 text-[10px] ${mine ? "text-indigo-100" : "text-slate-400"}`}>
                  {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {m.channel && m.channel !== "APP" && <span>· via {CANAL_LABEL[m.channel]}</span>}
                </p>
                {mine && <ReciboMensagem canal={m.channel} readAt={m.readAt} />}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {sendError && <p className="mt-2 text-xs text-red-600">{sendError}</p>}
      {envioInfo && (
        <p role="status" className="mt-2 text-xs text-emerald-700">
          {envioInfo}
        </p>
      )}

      {arquivo && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
          <span className="min-w-0 truncate">
            {arquivo.type === "application/pdf" || arquivo.name.toLowerCase().endsWith(".pdf") ? "📄" : "📷"} {arquivo.name}{" "}
            <span className="text-xs text-slate-500">({tamanhoLegivel(arquivo.size)})</span>
          </span>
          {progresso !== null ? (
            <span role="status" className="shrink-0 text-xs text-slate-600 dark:text-slate-300">
              Enviando… {progresso}%
            </span>
          ) : (
            <button
              type="button"
              onClick={tirarArquivo}
              disabled={sending}
              aria-label="Remover arquivo"
              className="shrink-0 rounded-md px-2 py-0.5 text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSend} className="mt-3 flex flex-wrap gap-2">
        {podeAnexar && (
          <>
            <input
              ref={arquivoRef}
              id="anexo-mensagem"
              type="file"
              accept={ACCEPT_ANEXO}
              onChange={escolherArquivo}
              className="sr-only"
              aria-label="Anexar arquivo (PDF ou foto)"
            />
            <label
              htmlFor="anexo-mensagem"
              title="Anexar arquivo (PDF ou foto, até 20 MB)"
              className="flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <span aria-hidden="true">📎</span>
              <span className="sr-only">Anexar arquivo</span>
            </label>
          </>
        )}
        <input
          aria-label="Mensagem"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={arquivo ? "Escreva algo sobre o arquivo (opcional)" : "Escreva uma mensagem..."}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        {podeUsarFuncoesDeResponsavel && (
          <select
            aria-label="Enviar por"
            value={arquivo ? "APP" : canalEnvio}
            disabled={Boolean(arquivo)}
            onChange={(e) => setCanalEnvio(e.target.value as Canal)}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="APP">Canal: ClassLink</option>
            <option value="WHATSAPP" disabled={!guardianTemTelefone || !whatsappDisponivel(data.janelaWhatsApp)}>
              Canal: WhatsApp
              {!guardianTemTelefone
                ? " (sem telefone)"
                : !whatsappDisponivel(data.janelaWhatsApp)
                  ? " (indisponível agora)"
                  : !data.janelaWhatsApp.aberta
                    ? " (aviso com link)"
                    : ""}
            </option>
            <option value="EMAIL" disabled={!guardianTemEmail}>
              Canal: E-mail{!guardianTemEmail ? " (sem e-mail)" : ""}
            </option>
          </select>
        )}
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {ROTULO_ENVIO[canalAtual]}
        </button>
      </form>
      {podeUsarFuncoesDeResponsavel && (
        <p aria-live="polite" className="mt-1 text-xs text-slate-500">
          {arquivo
            ? "Arquivos vão sempre pelo ClassLink: só a família e a escola abrem. A família recebe a notificação do app."
            : explicacaoDoCanal(canalAtual, data.janelaWhatsApp)}
        </p>
      )}
      {podeAnexar && !podeUsarFuncoesDeResponsavel && (
        <p className="mt-1 text-xs text-slate-500">
          📎 Para pedir uma declaração ou mandar um documento, toque no clipe e escolha um PDF ou uma foto (até 20 MB).
        </p>
      )}
    </div>
  );
}

/** "✓ Enviada" ou "✓✓ Lida no ClassLink em 14/10/2026 às 14:05": só o ClassLink comprova que a pessoa abriu. */
function ReciboMensagem({ canal, readAt }: { canal: Canal | null; readAt?: string | null }) {
  const recibo = reciboPorCanal(canal, readAt);
  return (
    <p className={`mt-0.5 text-[10px] ${recibo.lida ? "font-semibold text-emerald-200" : "text-indigo-200"}`}>
      <span aria-hidden="true">{recibo.marca}</span> {recibo.texto}
    </p>
  );
}

/** Mostra o anexo: foto na conversa (toque abre em tamanho real), player de áudio/vídeo ou link do documento. */
function AnexoDaMensagem({ anexo }: { anexo: Anexo }) {
  if (!anexo.url) {
    return (
      <p role="note" className="mb-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
        ⚠️ {avisoAnexoIndisponivel(anexo.tipo)}
        {anexo.nome && <span className="block">Arquivo: {anexo.nome}</span>}
      </p>
    );
  }
  if (anexo.tipo === "image" || anexo.tipo === "sticker") {
    return (
      <a href={anexo.url} target="_blank" rel="noopener noreferrer" className="mb-1 block" title="Abrir em tamanho real">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={anexo.url}
          alt={anexo.tipo === "sticker" ? "Figurinha enviada pelo WhatsApp" : anexo.nome ? `Foto: ${anexo.nome}` : "Foto enviada na conversa"}
          className={anexo.tipo === "sticker" ? "h-32 w-32 object-contain" : "max-h-72 w-auto max-w-full rounded-lg"}
          loading="lazy"
        />
      </a>
    );
  }
  if (anexo.tipo === "audio") {
    return <audio controls preload="none" src={anexo.url} className="mb-1 max-w-full" aria-label="Áudio enviado pelo WhatsApp" />;
  }
  if (anexo.tipo === "video") {
    return <video controls preload="metadata" src={anexo.url} className="mb-1 max-h-72 max-w-full rounded-lg" aria-label="Vídeo enviado pelo WhatsApp" />;
  }
  return (
    <a
      href={anexo.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-indigo-700 underline dark:border-slate-600 dark:bg-slate-900 dark:text-indigo-300"
    >
      {rotuloDoAnexo(anexo.tipo)}: abrir {anexo.nome ?? "arquivo"}
    </a>
  );
}
