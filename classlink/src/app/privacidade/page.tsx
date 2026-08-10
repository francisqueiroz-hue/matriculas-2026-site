export const metadata = { title: "Política de Privacidade — ClassLink" };

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <img src="/logos/logo-espaco-kids.png" alt="Espaço Kids" className="h-14 w-auto object-contain" />
        <span className="h-10 w-px bg-slate-200" />
        <img src="/logos/logo-instituto-fokus.png" alt="Instituto Fokus" className="h-14 w-auto object-contain" />
      </div>

      <h1 className="mb-2 text-2xl font-bold">Política de Privacidade</h1>
      <p className="mb-8 text-sm text-slate-500">ClassLink — Espaço Kids e Instituto Fokus</p>

      <div className="space-y-6 text-sm leading-relaxed text-slate-700">
        <p>
          O ClassLink é o aplicativo de comunicação entre a escola e as famílias dos alunos.
          Esta página explica quais dados coletamos e como eles são usados, em conformidade
          com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
        </p>

        <section>
          <h2 className="mb-2 font-semibold">Dados que coletamos</h2>
          <p>
            Do aluno: nome, turma e data de nascimento (opcional). Do responsável: nome,
            e-mail, telefone e, quando o módulo financeiro é utilizado, CPF e endereço. Não
            coletamos dados sensíveis além do estritamente necessário para a comunicação
            escolar e a gestão administrativa.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Como usamos os dados</h2>
          <p>
            Os dados são usados exclusivamente para viabilizar a comunicação entre a escola e
            os responsáveis (mural, comunicados, mensagens, agenda), a gestão financeira
            (emissão de boletos) e o envio de notificações. O telefone e e-mail do responsável
            só são compartilhados com nossos provedores de mensageria (WhatsApp/Meta e
            e-mail) no momento em que a escola envia uma mensagem por aquele canal para
            aquele responsável específico — não há envio em massa nem compartilhamento com
            terceiros para fins de marketing.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Seus direitos</h2>
          <p>
            Qualquer usuário pode solicitar a exclusão da própria conta a qualquer momento
            pelo próprio aplicativo (Conta → Excluir conta) ou entrando em contato com a
            escola. O vínculo entre responsável e aluno pode ser revogado a qualquer momento
            pela administração da escola.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Contato</h2>
          <p>
            Dúvidas sobre o tratamento de dados podem ser enviadas diretamente à secretaria
            da escola.
          </p>
        </section>
      </div>
    </div>
  );
}
