const AREAS = [
  {
    titulo: "Mural",
    texto: "Fotos e novidades do dia a dia da turma, tipo um quadro de avisos da sala.",
    path: "M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h4",
  },
  {
    titulo: "Comunicados",
    texto: "Avisos oficiais da escola — reuniões, eventos, mudanças de horário.",
    path: "M5 8a3 3 0 013-3h3l3-3v6l-3-3H8 M13 8h3l3 3v6l-3-3h-3",
  },
  {
    titulo: "Mensagens",
    texto: "Fale direto com a coordenação ou a professora, sem precisar de WhatsApp.",
    path: "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 20l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
  },
  {
    titulo: "Agenda",
    texto: "Datas importantes, passeios e compromissos escolares, sempre à mão.",
    path: "M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4",
  },
  {
    titulo: "Notas",
    texto: "Acompanhamento pedagógico do seu filho, direto da escola pra você.",
    path: "M9 4h9v16H9a3 3 0 01-3-3V7a3 3 0 013-3z M11 9h5 M11 13h5",
  },
  {
    titulo: "Frequência",
    texto: "Veja os dias em que seu filho esteve presente na escola.",
    path: "M9 12l2 2 4-4 M12 21a9 9 0 100-18 9 9 0 000 18z",
  },
];

const PASSOS = [
  {
    titulo: "Abra o link",
    texto: "Toque no botão acima pelo navegador do celular (Safari ou Chrome) ou do computador. Não precisa instalar nada da loja de aplicativos.",
  },
  {
    titulo: "Entre com seu e-mail e a senha provisória",
    texto: "A escola te repassa o e-mail cadastrado e uma senha provisória para o primeiro acesso. Se ainda não recebeu a sua, é só pedir à coordenação.",
  },
  {
    titulo: "Troque a senha",
    texto: "Assim que entrar, vá até a opção de trocar senha e escolha uma só sua, fácil de lembrar. A senha provisória para de funcionar depois disso.",
  },
  {
    titulo: "Ative os avisos",
    texto: "Android: quando o navegador perguntar, toque em \"Permitir notificações\". iPhone: toque no ícone de compartilhar do Safari e escolha \"Adicionar à Tela de Início\" — depois disso, abra sempre pelo ícone novo. É o único jeito do iPhone avisar quando chega mensagem.",
    tag: "Importante no iPhone",
  },
];

export const metadata = { title: "Guia da família — ClassLink" };

export default function GuiaPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <img src="/logos/logo-espaco-kids.png" alt="Espaço Kids" className="h-14 w-auto object-contain" />
        <span className="h-10 w-px bg-slate-200" />
        <img src="/logos/logo-instituto-fokus.png" alt="Instituto Fokus" className="h-14 w-auto object-contain" />
      </div>

      <div className="mb-10 text-center">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">Bem-vindo(a) ao ClassLink</h1>
        <p className="mx-auto max-w-sm text-slate-500">
          O jeito mais simples de acompanhar o dia a dia do seu filho — direto do celular ou do
          computador.
        </p>
        <a
          href="/login"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-8 py-3 font-semibold text-white transition hover:bg-indigo-700"
        >
          Entrar no ClassLink
        </a>
      </div>

      <section className="mb-12">
        <h2 className="mb-1 text-xl font-bold text-slate-900">Como entrar pela primeira vez</h2>
        <p className="mb-6 text-sm text-slate-500">São só quatro passos, e você só precisa fazer isso uma vez.</p>

        <div>
          {PASSOS.map((passo, i) => (
            <div key={passo.titulo} className="relative flex gap-4 pb-8 last:pb-0">
              {i < PASSOS.length - 1 && (
                <span className="absolute left-[19px] top-10 bottom-0 w-px bg-indigo-100" />
              )}
              <span className="z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 font-bold text-white">
                {i + 1}
              </span>
              <div className="pt-1.5">
                {passo.tag && (
                  <span className="mb-1.5 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    {passo.tag}
                  </span>
                )}
                <h3 className="mb-1 font-semibold text-slate-900">{passo.titulo}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{passo.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-1 text-xl font-bold text-slate-900">O que você encontra por lá</h2>
        <p className="mb-4 text-sm text-slate-500">
          Tudo em um só lugar, sem precisar ficar perguntando ou esperando bilhete na mochila.
        </p>

        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {AREAS.map((area) => (
            <div key={area.titulo} className="flex gap-3 py-4">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d={area.path} />
                </svg>
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">{area.titulo}</h3>
                <p className="text-sm text-slate-600">{area.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl bg-indigo-50 p-6 text-center">
        <h2 className="mb-1 font-bold text-slate-900">Ficou com alguma dúvida?</h2>
        <p className="mx-auto mb-4 max-w-xs text-sm text-slate-600">
          Qualquer dificuldade para entrar ou usar o ClassLink, é só chamar a coordenação. Estamos
          aqui pra ajudar.
        </p>
        <a
          href="https://wa.me/5521992865778"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white transition hover:bg-indigo-700"
        >
          (21) 99286-5778
        </a>
      </div>
    </div>
  );
}
