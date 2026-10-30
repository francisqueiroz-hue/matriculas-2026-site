import { linkPedirAcesso } from "@/lib/whatsapp-escola";
import { LogoEspacoKids, LogoInstitutoFokus } from "@/components/Logos";
import { CLASSLINK_URL } from "@/lib/matriculas-page";
import { BotaoImprimir } from "./BotaoImprimir";

/**
 * Guia da família: primeiro acesso, instalação do app (Android, iPhone, computador) e como usar
 * cada área. É o link enviado junto com o acesso (WhatsApp/e-mail) e pode ser impresso ou salvo
 * em PDF. Página pública: não mostra nenhum dado de aluno ou família.
 */

const PRIMEIRO_ACESSO = [
  {
    titulo: "Abra o link",
    texto: "Abra o endereço do ClassLink (o link que a escola enviou) pelo navegador do celular (Chrome no Android, Safari no iPhone) ou do computador. Não precisa baixar nada da loja de aplicativos.",
  },
  {
    titulo: "Entre com seu telefone (ou e-mail) e a senha provisória",
    texto: "Use o telefone ou o e-mail que a escola cadastrou. Ainda não recebeu a senha? Toque em \"Receber meu acesso pelo WhatsApp\" e envie a palavra ACESSO: a resposta com a senha chega na hora.",
  },
  {
    titulo: "Troque a senha",
    texto: "Toque no seu nome (Minha conta) e depois em \"Trocar senha\". Escolha uma senha só sua, com pelo menos 8 caracteres. A senha provisória deixa de funcionar.",
  },
  {
    titulo: "Instale o app e ative os avisos",
    texto: "Veja o passo a passo logo abaixo, para o seu tipo de aparelho. Com os avisos ativos, você fica sabendo na hora quando chega mensagem, comunicado ou boleto.",
  },
];

const INSTALACAO = [
  {
    aparelho: "Android (Samsung, Motorola, Xiaomi…)",
    icone: "🤖",
    passos: [
      "Abra o ClassLink no Google Chrome e entre com seu acesso.",
      "Se aparecer o aviso \"Instale o ClassLink na tela do seu celular\", toque em Instalar e pronto.",
      "Se o aviso não aparecer: toque nos três pontinhos (⋮), no canto de cima, e escolha \"Adicionar à tela inicial\" ou \"Instalar app\". Confirme em Instalar.",
      "O ícone do ClassLink aparece junto com os outros aplicativos. Abra sempre por ele.",
      "Quando o celular perguntar, toque em \"Permitir\" para receber as notificações.",
    ],
  },
  {
    aparelho: "iPhone ou iPad",
    icone: "🍎",
    destaque: "No iPhone, os avisos só chegam com o app instalado na Tela de Início.",
    passos: [
      "Abra o ClassLink no Safari (não funciona pelo Chrome nem pelo navegador do Instagram/WhatsApp) e entre com seu acesso.",
      "Toque no botão Compartilhar (o quadrado com uma seta para cima). Se não encontrar, toque nos três pontinhos (⋯) e depois em Compartilhar.",
      "Role a lista e toque em \"Adicionar à Tela de Início\". Depois toque em Adicionar.",
      "Feche o Safari e abra o ClassLink pelo ícone novo da Tela de Início.",
      "Toque em Minha conta e ative as notificações neste aparelho. Quando o iPhone perguntar, toque em \"Permitir\".",
    ],
    nota: "É preciso iPhone com iOS 16.4 ou mais recente. Para conferir: Ajustes › Geral › Sobre › Versão do iOS.",
  },
  {
    aparelho: "Computador (Windows ou Mac)",
    icone: "💻",
    passos: [
      "Abra o ClassLink no Google Chrome ou no Microsoft Edge e entre com seu acesso.",
      "Na barra de endereço, clique no ícone de instalar (um monitor com uma seta, ou um sinal de +) e depois em Instalar.",
      "Se o ícone não aparecer, use o menu do navegador (⋮ ou ⋯) e procure \"Instalar ClassLink\" ou \"Instalar este site como aplicativo\".",
      "Também dá para usar sem instalar: é só salvar o endereço nos favoritos.",
    ],
  },
];

const AREAS = [
  {
    titulo: "Mural",
    texto: "Fotos e novidades da turma. Toque em uma foto para ver no tamanho original e em \"Confirmar leitura\" para avisar a escola que você viu.",
    path: "M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h4",
  },
  {
    titulo: "Comunicados",
    texto: "Avisos oficiais da escola. Alguns pedem resposta, como autorização de passeio (\"Autorizo\") ou reunião (\"Confirmo presença\"): abra o comunicado e toque na sua resposta. O número vermelho no menu mostra quantos ainda esperam por você.",
    path: "M5 8a3 3 0 013-3h3l3-3v6l-3-3H8 M13 8h3l3 3v6l-3-3h-3",
  },
  {
    titulo: "Enquetes",
    texto: "Perguntas rápidas da escola. As que aguardam sua resposta aparecem primeiro; escolha uma opção e envie.",
    path: "M9 11l3 3 8-8 M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9",
  },
  {
    titulo: "Mensagens",
    texto: "Converse direto com a direção e a coordenação. Toque em \"Nova conversa\", escolha com quem quer falar e escreva. Pelo clipe (📎) você também envia arquivos: PDF ou foto de documento.",
    path: "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 20l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
  },
  {
    titulo: "Agenda",
    texto: "Datas importantes, passeios, reuniões e feriados. O próximo evento aparece em destaque no alto.",
    path: "M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4",
  },
  {
    titulo: "Cardápio",
    texto: "O que será servido em cada refeição da semana.",
    path: "M7 3v8 M5 3v4a2 2 0 004 0V3 M7 11v10 M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4v9",
  },
  {
    titulo: "Frequência",
    texto: "Os dias de presença e falta do seu filho, mês a mês.",
    path: "M9 12l2 2 4-4 M12 21a9 9 0 100-18 9 9 0 000 18z",
  },
  {
    titulo: "Boletim",
    texto: "Notas e acompanhamento pedagógico, quando a escola lançar.",
    path: "M12 15a5 5 0 100-10 5 5 0 000 10z M9 14l-2 6 5-3 5 3-2-6",
  },
  {
    titulo: "Financeiro",
    texto: "Seus boletos. Toque em \"Copiar PIX\" e cole no app do seu banco, ou em \"Copiar linha digitável\" para pagar o boleto. Na primeira vez, preencha os dados de cobrança (CPF e endereço).",
    path: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M3 10h18 M7 15h3",
  },
  {
    titulo: "Contratos",
    texto: "Baixe o contrato, assine pelo gov.br (grátis, sem imprimir) ou à mão, e envie o PDF assinado pelo próprio app. A tela mostra cada passo e se a secretaria pediu algum ajuste.",
    path: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z M14 3v5h5 M9 13h6 M9 17h4",
  },
  {
    titulo: "Minha conta",
    texto: "Toque no seu nome (no fim do menu) para trocar a senha, adicionar um e-mail e ativar ou testar as notificações deste aparelho.",
    path: "M12 12a4 4 0 100-8 4 4 0 000 8z M4 20c1-4 4-6 8-6s7 2 8 6",
  },
];

const PEDIR_DOCUMENTO = [
  "Abra Mensagens e toque na conversa com a escola (ou em \"Nova conversa\" e escolha a direção ou a coordenação).",
  "Escreva o que você precisa. Exemplo: \"Bom dia! Preciso de uma declaração de matrícula do João para o trabalho.\"",
  "Se a escola pedir um documento seu (atestado, comprovante, RG…), toque no clipe 📎, escolha o PDF ou tire uma foto nítida do papel, e toque em Enviar.",
  "Quando a escola responder com a declaração, ela chega na mesma conversa. Toque em \"Documento: abrir…\" para ver, salvar ou imprimir.",
];

const DUVIDAS = [
  {
    pergunta: "Esqueci minha senha. E agora?",
    resposta: "Na tela de entrada, toque em \"Esqueci minha senha\". Ou envie ACESSO para o WhatsApp da escola e receba um novo acesso.",
  },
  {
    pergunta: "Não estou recebendo as notificações.",
    resposta: "Abra Minha conta e veja o quadro de notificações: ele diz o que falta e tem um botão para testar. No iPhone, confirme que você abre o ClassLink pelo ícone da Tela de Início, e não pelo Safari.",
  },
  {
    pergunta: "Quais arquivos posso enviar nas Mensagens?",
    resposta: "PDF ou foto (JPG, PNG ou WEBP), de até 20 MB cada. Fotos grandes são reduzidas automaticamente, sem perder a leitura.",
  },
  {
    pergunta: "Quem vê os arquivos e mensagens que eu envio?",
    resposta: "Só você e a equipe da direção/coordenação que participa da conversa. Os arquivos ficam guardados de forma privada, sem link público, conforme a Lei Geral de Proteção de Dados (LGPD).",
  },
  {
    pergunta: "Tenho mais de um filho na escola.",
    resposta: "Use o mesmo acesso. Comunicados, boletos, frequência e contratos mostram o nome de cada criança.",
  },
];

function Icone({ path }: { path: string }) {
  return (
    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <path d={path} />
      </svg>
    </span>
  );
}

function ListaNumerada({ itens }: { itens: string[] }) {
  return (
    <ol className="space-y-2">
      {itens.map((item, i) => (
        <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-700">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export const metadata = {
  title: "Guia da família — ClassLink",
  description: "Como entrar, instalar o app no celular ou computador e usar cada área do ClassLink.",
};

export default function GuiaPage() {
  return (
    <div className="flex-1 bg-white text-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-12 print:py-0">
        <div className="mb-8 flex items-center gap-4">
          <LogoEspacoKids className="h-14" />
          <span className="h-10 w-px bg-slate-200" />
          <LogoInstitutoFokus className="h-14" />
        </div>

        <div className="mb-10 text-center">
          <h1 className="mb-2 text-3xl font-bold text-slate-900">Guia da família ClassLink</h1>
          <p className="mx-auto max-w-md text-slate-500">
            Como entrar, instalar o app no celular ou no computador e usar cada área. Leva poucos minutos, e você só faz
            a instalação uma vez.
          </p>
          {/* No papel/PDF os botões somem: fica o endereço para digitar. */}
          <p className="mt-4 hidden text-sm font-semibold text-indigo-700 print:block">
            Endereço: {CLASSLINK_URL.replace(/^https:\/\//, "")}
          </p>
          <div className="print:hidden">
            <a
              href="/login"
              className="mt-6 inline-block rounded-lg bg-indigo-600 px-8 py-3 font-semibold text-white transition hover:bg-indigo-700"
            >
              Entrar no ClassLink
            </a>
            <a
              href={linkPedirAcesso()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700 hover:underline"
            >
              📲 Ainda não tem senha? Receber meu acesso pelo WhatsApp
            </a>
            <div className="mt-4">
              <BotaoImprimir />
            </div>
          </div>
        </div>

        <nav aria-label="Neste guia" className="mb-12 rounded-xl border border-slate-200 p-4 text-sm print:hidden">
          <p className="mb-2 font-semibold text-slate-700">Neste guia</p>
          <ol className="list-decimal space-y-1 pl-5 text-indigo-700">
            <li><a href="#primeiro-acesso" className="hover:underline">Primeiro acesso</a></li>
            <li><a href="#instalar" className="hover:underline">Instalar o app (Android, iPhone, computador)</a></li>
            <li><a href="#areas" className="hover:underline">O que tem em cada área</a></li>
            <li><a href="#documentos" className="hover:underline">Pedir declarações e enviar documentos</a></li>
            <li><a href="#duvidas" className="hover:underline">Dúvidas frequentes</a></li>
          </ol>
        </nav>

        <section id="primeiro-acesso" className="mb-12 scroll-mt-6">
          <h2 className="mb-1 text-xl font-bold text-slate-900">1. Primeiro acesso</h2>
          <p className="mb-6 text-sm text-slate-500">São quatro passos, e você só precisa fazer isso uma vez.</p>
          <div>
            {PRIMEIRO_ACESSO.map((passo, i) => (
              <div key={passo.titulo} className="relative flex gap-4 pb-8 last:pb-0">
                {i < PRIMEIRO_ACESSO.length - 1 && <span className="absolute bottom-0 left-[19px] top-10 w-px bg-indigo-100" />}
                <span className="z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 font-bold text-white">
                  {i + 1}
                </span>
                <div className="pt-1.5">
                  <h3 className="mb-1 font-semibold text-slate-900">{passo.titulo}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{passo.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="instalar" className="mb-12 scroll-mt-6">
          <h2 className="mb-1 text-xl font-bold text-slate-900">2. Instalar o app</h2>
          <p className="mb-6 text-sm text-slate-500">
            O ClassLink é instalado direto pelo navegador, sem loja de aplicativos e sem ocupar quase nada de espaço. Escolha
            o seu aparelho:
          </p>
          <div className="space-y-6">
            {INSTALACAO.map((bloco) => (
              <div key={bloco.aparelho} className="break-inside-avoid rounded-xl border border-slate-200 p-5">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                  <span aria-hidden="true" className="text-xl">{bloco.icone}</span>
                  {bloco.aparelho}
                </h3>
                {bloco.destaque && (
                  <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">⚠️ {bloco.destaque}</p>
                )}
                <ListaNumerada itens={bloco.passos} />
                {bloco.nota && <p className="mt-3 text-xs text-slate-500">{bloco.nota}</p>}
              </div>
            ))}
          </div>
        </section>

        <section id="areas" className="mb-12 scroll-mt-6">
          <h2 className="mb-1 text-xl font-bold text-slate-900">3. O que tem em cada área</h2>
          <p className="mb-4 text-sm text-slate-500">
            No celular, toque no menu (☰) no alto da tela para ver todas as áreas. No computador, elas ficam na lateral
            esquerda.
          </p>
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {AREAS.map((area) => (
              <div key={area.titulo} className="flex break-inside-avoid gap-3 py-4">
                <Icone path={area.path} />
                <div>
                  <h3 className="font-semibold text-slate-900">{area.titulo}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{area.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="documentos" className="mb-12 scroll-mt-6 break-inside-avoid rounded-xl bg-indigo-50 p-5">
          <h2 className="mb-1 text-xl font-bold text-slate-900">4. Pedir declarações e enviar documentos</h2>
          <p className="mb-4 text-sm text-slate-600">
            Declaração de matrícula, de frequência, atestado, comprovante: tudo pode ser pedido e enviado pela área
            Mensagens, sem precisar ir à secretaria.
          </p>
          <ListaNumerada itens={PEDIR_DOCUMENTO} />
          <p className="mt-4 text-xs text-slate-500">
            Aceitamos PDF ou foto (JPG, PNG, WEBP) de até 20 MB. Para fotografar um documento: coloque o papel numa mesa
            bem iluminada, sem sombra, e enquadre a folha inteira.
          </p>
        </section>

        <section id="duvidas" className="mb-12 scroll-mt-6">
          <h2 className="mb-4 text-xl font-bold text-slate-900">5. Dúvidas frequentes</h2>
          <dl className="space-y-4">
            {DUVIDAS.map((d) => (
              <div key={d.pergunta} className="break-inside-avoid">
                <dt className="font-semibold text-slate-900">{d.pergunta}</dt>
                <dd className="text-sm leading-relaxed text-slate-600">{d.resposta}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="break-inside-avoid rounded-xl bg-indigo-50 p-6 text-center">
          <h2 className="mb-1 font-bold text-slate-900">Ficou com alguma dúvida?</h2>
          <p className="mx-auto mb-4 max-w-xs text-sm text-slate-600">
            Qualquer dificuldade para entrar ou usar o ClassLink, é só chamar a secretaria. Estamos aqui pra ajudar.
          </p>
          <a
            href="https://wa.me/5521964699441"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white transition hover:bg-indigo-700"
          >
            (21) 96469-9441
          </a>
        </div>
      </div>
    </div>
  );
}
