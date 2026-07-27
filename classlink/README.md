# ClassLink — Comunicação Escola-Família

Aplicativo web (PWA) para comunicação entre escola e responsáveis, inspirado no ClassApp.
Inclui: mural de avisos, mensagens diretas, agenda escolar, painel administrativo com
métricas de engajamento, **autorizações e confirmações digitais** (comunicados com
resposta) e **emissão automática de boletos via Banco Inter**.

## Stack

- **Frontend/Backend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS, com rotas de
  API do próprio Next.js (`src/app/api/**`).
- **Banco de dados**: PostgreSQL via Prisma ORM (driver adapter `@prisma/adapter-pg`).
- **Autenticação**: JWT de acesso (curta duração, cookie httpOnly) + refresh token opaco
  rotativo (cookie httpOnly, hash armazenado no banco), senhas com `bcryptjs`.
- **Mídia**: upload de fotos/vídeos via Cloudinary, com compressão de imagem no navegador
  antes do envio (`browser-image-compression`).
- **Notificações push**: Firebase Cloud Messaging (service worker + `firebase-admin`).
- **Jobs agendados**: rotas de cron protegidas por segredo (`CRON_SECRET`), pensadas para
  o Vercel Cron (`vercel.json`) ou qualquer scheduler externo.
- **Boletos**: API Inter Empresas (Cobrança), OAuth2 `client_credentials` com mTLS.
- **PWA**: `manifest.json` + service worker próprio (cache de app-shell), instalável via
  "Adicionar à tela inicial".
- **Testes**: Vitest (autenticação, upload, comunicados, cálculo de vencimento, payload
  de cobrança do Banco Inter).

## Estrutura de pastas

```
classlink/
├── prisma/
│   ├── schema.prisma        # modelos do banco (School, User, Post, Comunicado, Boleto...)
│   └── seed.ts               # dados de demonstração
├── src/
│   ├── app/
│   │   ├── login/             # tela de login
│   │   ├── dashboard/         # área autenticada (mural, comunicados, mensagens,
│   │   │                        agenda, financeiro, admin)
│   │   ├── api/                # rotas de API
│   │   │   ├── comunicados/     # autorizações/confirmações + respostas
│   │   │   ├── billing/         # "meus boletos" do responsável
│   │   │   ├── admin/billing/   # configuração e resumo financeiro do admin
│   │   │   ├── cron/            # jobs agendados (expiração, emissão de boletos)
│   │   │   └── webhooks/        # confirmação de pagamento do Banco Inter
│   │   ├── sw.js/route.ts     # service worker servido dinamicamente
│   │   └── layout.tsx
│   ├── components/            # componentes de UI reutilizáveis
│   ├── lib/                   # auth, prisma client, cloudinary, push, banco-inter...
│   └── proxy.ts               # proteção de rotas (equivalente ao middleware no Next 16)
├── tests/                     # testes automatizados (Vitest)
├── public/icons/               # ícones do PWA
├── vercel.json                 # agendamento dos jobs de cron
└── .env.example
```

## Perfis de usuário

| Perfil | Pode |
| --- | --- |
| **Administrador** | Gerenciar turmas, alunos e vínculos de responsáveis; criar contas de equipe; publicar avisos/comunicados para toda a escola ou turmas; ver painel de engajamento; configurar mensalidade e vencimento; acompanhar boletos pagos/pendentes. |
| **Professor/Funcionário** | Publicar avisos e comunicados nas turmas em que leciona; enviar mensagens diretas aos responsáveis dessas turmas; criar eventos na agenda; ver quem respondeu um comunicado e reenviar lembrete. |
| **Responsável** | Ver o mural (escola + turma do filho/a), confirmar leitura de avisos, responder comunicados (autorizar passeio, confirmar presença, confirmar leitura) para cada filho vinculado, conversar com a equipe escolar, ver a agenda e seus boletos. |

## Rodando localmente

### 1. Pré-requisitos

- Node.js 20+
- Um banco PostgreSQL (local ou gerenciado — veja opções na seção de deploy)

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Preencha pelo menos `DATABASE_URL` e `JWT_ACCESS_SECRET` para rodar o essencial. As
demais integrações (Cloudinary, Firebase, Banco Inter) são opcionais — sem elas o app
funciona normalmente e cada funcionalidade correspondente falha de forma amigável
(upload retorna erro claro, push é ignorado silenciosamente, emissão de boleto marca o
boleto como `ERRO` com o motivo).

Veja a descrição completa de cada variável em [`.env.example`](./.env.example).

### 4. Preparar o banco de dados

```bash
npx prisma migrate dev --name init
npm run db:seed
```

O seed cria uma escola de demonstração com os logins:

| E-mail | Perfil | Senha |
| --- | --- | --- |
| `admin@classlink.demo` | Administrador | `classlink123` |
| `professora@classlink.demo` | Professor/Funcionário | `classlink123` |
| `responsavel@classlink.demo` | Responsável | `classlink123` |

### 5. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

### 6. Testes

```bash
npm test
```

## Autorizações e confirmações (Comunicados)

Tela **Comunicados**, disponível para todos os perfis:

- Administrador/professor cria um comunicado de 3 tipos, cada um com botões diferentes
  para o responsável: **autorização de passeio** ("Autorizo" / "Não autorizo"),
  **confirmação de reunião** ("Confirmo presença" / "Não poderei comparecer") ou
  **circular** ("Confirmar leitura").
- Cada resposta é gravada com **data/hora e IP definidos pelo servidor** (nunca aceitos
  do cliente) em `RespostaComunicado`. Se o responsável responder de novo para o mesmo
  aluno, a resposta anterior é preservada em `RespostaComunicadoLog` (auditoria) antes de
  ser sobrescrita.
- O painel do comunicado mostra "X de Y responderam", lista quem falta responder e
  permite reenviar a notificação push individualmente, além de exportar um CSV com
  aluno/responsável/resposta/data-hora.
- Se `prazoResposta` for definido e expirar, o job `/api/cron/expirar-comunicados`
  marca automaticamente cada par responsável/aluno sem resposta como
  `PENDENTE_EXPIRADO` (nunca é um valor que o cliente pode enviar manualmente).

## Emissão de boletos via Banco Inter

Módulo financeiro simplificado: **não há** conciliação de extrato ou PIX avulso — apenas
emissão mensal de boleto por aluno e atualização automática do status quando pago.

### Como funciona

1. O administrador define, em **Financeiro**, o dia de vencimento padrão e o dia do mês
   em que os boletos devem ser emitidos; e, na tela **Alunos**, o valor da mensalidade
   (e opcionalmente um dia de vencimento específico) de cada aluno.
2. O responsável cadastra CPF e endereço em **Financeiro → Cadastrar dados de cobrança**
   (exigido pelo registro bancário do boleto — por isso não é coletado no cadastro
   padrão, só quando o módulo financeiro é usado).
3. O job `/api/cron/emitir-boletos`, rodando uma vez por dia, verifica se hoje é o dia
   configurado para cada escola; para cada aluno com mensalidade definida e sem boleto
   no mês corrente, chama a API do Inter e grava o resultado (`PENDENTE` ou `ERRO`, com
   o motivo).
4. O Inter chama `POST /api/webhooks/banco-inter` quando o boleto é pago; o status muda
   para `PAGO` e o responsável recebe uma notificação push.
5. O responsável acessa **Financeiro** para ver todos os boletos e baixar o PDF (buscado
   sob demanda na API do Inter — o PDF não fica armazenado no servidor).

### Obtendo as credenciais no portal do Inter

1. Acesse [developers.bancointer.com.br](https://developers.bancointer.com.br) e faça
   login com as credenciais da conta PJ do Inter que receberá os pagamentos.
2. Crie uma aplicação em **Minhas aplicações**, habilitando o escopo **Cobrança
   (Boletos)** — inclua também `webhook-boleto.write`/`webhook-boleto.read` se quiser
   cadastrar o webhook por lá.
3. Gere o **certificado digital** da aplicação: o portal disponibiliza para download o
   certificado (`.crt`) e a chave privada (`.key`) usados na autenticação mTLS. Salve-os
   fora do controle de versão (ex: `classlink/certs/`, já ignorado pelo `.gitignore`).
4. Copie o **Client ID** e o **Client Secret** exibidos na aplicação.
5. Anote o **número da conta corrente** Inter que vai receber os boletos.
6. Preencha no `.env`:
   ```
   BANCO_INTER_AMBIENTE="sandbox"        # troque para "producao" quando for para valer
   BANCO_INTER_CLIENT_ID="..."
   BANCO_INTER_CLIENT_SECRET="..."
   BANCO_INTER_CERT_PATH="./certs/inter-certificado.crt"
   BANCO_INTER_KEY_PATH="./certs/inter-chave.key"
   BANCO_INTER_CONTA_CORRENTE="..."
   BANCO_INTER_WEBHOOK_SECRET="gere-uma-string-aleatoria"
   ```
7. Teste primeiro no **ambiente sandbox** do Inter (dados fictícios) antes de apontar
   para produção.
8. Cadastre o webhook de pagamento chamando `registrarWebhook` (em
   `src/lib/banco-inter.ts`) uma vez, apontando para
   `https://SEU_DOMINIO/api/webhooks/banco-inter?secret=BANCO_INTER_WEBHOOK_SECRET`
   — esse `secret` é seu, não do Inter; ele impede que qualquer pessoa chame o seu
   webhook forjando confirmações de pagamento.

> ⚠️ A API do Inter evolui com o tempo — antes de ir para produção, confira os campos
> exatos exigidos na documentação oficial e ajuste `buildCobrancaPayload` em
> `src/lib/banco-inter.ts` se necessário (toda a integração fica isolada nesse arquivo).

### Agendando os jobs em produção

- **Vercel**: o `vercel.json` já define os crons (`/api/cron/expirar-comunicados` e
  `/api/cron/emitir-boletos`, diariamente). Basta definir a env var `CRON_SECRET` no
  projeto — a Vercel injeta automaticamente o header
  `Authorization: Bearer $CRON_SECRET` nas chamadas de cron.
- **Outras plataformas** (Railway/Render): use um scheduler externo (ex:
  [cron-job.org](https://cron-job.org) ou GitHub Actions com `schedule`) apontando um
  `POST` diário para essas rotas, enviando o header
  `Authorization: Bearer SEU_CRON_SECRET`.

## LGPD

- **Minimização de dados**: o cadastro do aluno guarda apenas nome, turma e data de
  nascimento (opcional). CPF e endereço só são coletados do responsável quando ele
  mesmo opta por usar o módulo financeiro.
- **Vínculo explícito e revogável**: o vínculo entre responsável e aluno
  (`GuardianStudent`) pode ser revogado a qualquer momento pelo administrador.
- **Direito à eliminação**: qualquer usuário pode excluir a própria conta em
  `/dashboard/conta` (endpoint `POST /api/account/delete`). Os dados de identificação são
  anonimizados (e-mail, nome, telefone, foto) e as sessões são revogadas; mensagens e
  avisos já publicados são preservados de forma anonimizada para manter o histórico da
  turma.
- **Exclusão lógica**: alunos e turmas removidos são marcados como excluídos
  (`deletedAt`) em vez de apagados fisicamente, preservando o histórico de frequência e
  comunicados já enviados.
- **Auditoria de respostas**: `RespostaComunicadoLog` preserva o histórico de respostas
  substituídas (ex.: autorização trocada por não-autorização), com data/hora e IP de
  origem sempre atribuídos pelo servidor.
- **Boletos**: o PDF do boleto não é armazenado no servidor — é buscado sob demanda na
  API do Inter a cada visualização.

## Deploy (PWA)

1. Crie um banco PostgreSQL gerenciado (plano gratuito): [Neon](https://neon.tech),
   [Supabase](https://supabase.com) ou [Railway](https://railway.app).
2. Configure as variáveis de ambiente na plataforma de deploy (mesmas do `.env.example`).
   Os certificados do Banco Inter não podem ser lidos de um caminho de arquivo em
   ambientes serverless — grave o conteúdo do `.crt`/`.key` como variáveis de ambiente
   (ou em um volume/secret da plataforma) e adapte `BANCO_INTER_CERT_PATH`/
   `BANCO_INTER_KEY_PATH` em `src/lib/banco-inter.ts` para gravá-los em `/tmp` no boot,
   se necessário.
3. Rode `npx prisma migrate deploy` contra o banco de produção (uma vez, no pipeline de
   deploy ou manualmente) e depois `npm run db:seed` se quiser dados de exemplo.
4. Faça o deploy na [Vercel](https://vercel.com): conecte o repositório GitHub — a Vercel
   detecta o Next.js automaticamente e já lê o `vercel.json` para agendar os crons.
5. Crie um projeto no [Firebase](https://console.firebase.google.com) para ativar as
   notificações push e preencha as chaves `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_*` e
   `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
6. Configure o Banco Inter seguindo o passo a passo acima antes de ativar a emissão em
   produção.
7. Como o app é um PWA, os responsáveis podem instalá-lo pelo navegador ("Adicionar à
   tela inicial") sem precisar publicar em loja de aplicativos.
8. Teste tudo em produção (Inter em modo sandbox primeiro) com uma turma pequena antes
   de liberar para toda a escola.

## Roadmap (fora do escopo atual)

- Controle de frequência completo pela interface (o modelo `Attendance` já existe no
  banco, mas ainda não tem tela/API dedicada).
- Conciliação de extrato bancário ou PIX avulso (deliberadamente fora do escopo do
  módulo financeiro atual).
- App nativo publicado nas lojas (o app atual é um PWA instalável pelo navegador).
