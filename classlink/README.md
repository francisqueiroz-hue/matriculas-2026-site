# ClassLink — Comunicação Escola-Família

Aplicativo web (PWA) para comunicação entre escola e responsáveis, inspirado no ClassApp.
Inclui: mural de avisos, mensagens diretas (com envio opcional por **WhatsApp/e-mail**
via Chatwoot), agenda escolar, painel administrativo com métricas de engajamento,
**autorizações e confirmações digitais** (comunicados com resposta), lançamento de
**notas por trimestre** e **emissão automática de boletos via Banco Inter**.

## Stack

- **Frontend/Backend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS, com rotas de
  API do próprio Next.js (`src/app/api/**`).
- **Banco de dados**: PostgreSQL via Prisma ORM (driver adapter `@prisma/adapter-pg`).
- **Autenticação**: JWT de acesso (curta duração, cookie httpOnly) + refresh token opaco
  rotativo (cookie httpOnly, hash armazenado no banco), senhas com `bcryptjs`.
- **Mídia**: upload de fotos/vídeos via Firebase Storage (bucket privado, leitura por URL
  assinada de curta duração), com compressão de imagem no navegador antes do envio
  (`browser-image-compression`).
- **Notificações push**: Firebase Cloud Messaging (service worker + `firebase-admin`).
  Push e Storage usam o mesmo projeto/conta de serviço do Firebase.
- **Jobs agendados**: rotas de cron protegidas por segredo (`CRON_SECRET`), pensadas para
  o Vercel Cron (`vercel.json`) ou qualquer scheduler externo.
- **Boletos**: API Inter Empresas (Cobrança), OAuth2 `client_credentials` com mTLS.
- **Mensagens por WhatsApp/e-mail**: [Chatwoot](https://www.chatwoot.com) (API), com
  sincronização por polling na tela de conversa — funciona no plano gratuito, sem
  depender do webhook (recurso pago no Chatwoot Cloud).
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
│   ├── lib/                   # auth, prisma client, firebase-storage, push, banco-inter...
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
demais integrações (Firebase, Banco Inter) são opcionais — sem elas o app funciona
normalmente e cada funcionalidade correspondente falha de forma amigável (upload
retorna erro claro, push é ignorado silenciosamente, emissão de boleto marca o boleto
como `ERRO` com o motivo).

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

## Ativando o Firebase (notificações push + upload de mídia)

Um único projeto Firebase cobre as duas funcionalidades: **notificações push** (mural,
mensagens, comunicados, boletos) e **upload de fotos/vídeos do mural** (Firebase
Storage). Sem essas variáveis o app funciona normalmente — só essas duas
funcionalidades ficam desativadas (erro amigável, nada quebra).

Passo a passo completo, do zero:

### Passo 1 — Criar a conta e o projeto

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e faça
   login com uma conta Google (crie uma em [accounts.google.com](https://accounts.google.com)
   se ainda não tiver — é grátis, sem cartão de crédito).
2. Clique em **Criar projeto** (ou **Adicionar projeto**).
3. Dê um nome ao projeto (ex: "ClassLink Escola Modelo") e continue.
4. Na etapa do Google Analytics, pode **desativar** — não é necessário para o app.
5. Aguarde o projeto ser criado e clique em **Continuar**.

### Passo 2 — Registrar o app Web e pegar a config pública

1. Na tela inicial do projeto, clique no ícone **Web** (`</>`) para adicionar um app.
2. Dê um apelido (ex: "ClassLink Web") e clique em **Registrar app**. Não é necessário
   marcar "Configurar também o Firebase Hosting".
3. O Firebase mostra um bloco de código com `firebaseConfig` — copie os valores para o
   `.env`:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=apiKey
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=authDomain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=projectId
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=storageBucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=messagingSenderId
   NEXT_PUBLIC_FIREBASE_APP_ID=appId
   ```
4. Clique em **Continuar no console** (pode pular os passos de instalar o SDK/rodar o
   app — o ClassLink já vem pronto).

### Passo 3 — Ativar o Cloud Messaging (push) e pegar a chave VAPID

1. No menu lateral, vá em **Compilação → Cloud Messaging** (ou acesse
   **Configurações do projeto** ⚙️ → aba **Cloud Messaging**).
2. Role até **Certificados push da Web** e clique em **Gerar par de chaves**.
3. Copie o valor gerado para `NEXT_PUBLIC_FIREBASE_VAPID_KEY` no `.env`.

### Passo 4 — Ativar o Firebase Storage

1. No menu lateral, vá em **Compilação → Storage**.
2. Clique em **Começar** (Get started).
3. Escolha o **modo de produção** (não o modo de teste — o app não usa o SDK do
   cliente para acessar o Storage diretamente, então não precisa liberar acesso
   público; tudo passa pelo backend com a conta de serviço).
4. Escolha a localização do bucket (qualquer região próxima do Brasil, ex:
   `southamerica-east1`) e confirme.
5. Na aba **Rules**, substitua o conteúdo por uma regra que **nega todo acesso direto**
   (o backend usa a conta de serviço, que ignora essas regras — elas só protegem
   contra acesso indevido vindo do navegador):
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if false;
       }
     }
   }
   ```
   Clique em **Publicar**.

### Passo 5 — Gerar a conta de serviço (credenciais do backend)

1. Vá em **Configurações do projeto** ⚙️ → aba **Contas de serviço**.
2. Clique em **Gerar nova chave privada** → confirme. Um arquivo `.json` será baixado.
3. Abra o arquivo e copie os campos para o `.env`:
   ```
   FIREBASE_PROJECT_ID=project_id
   FIREBASE_CLIENT_EMAIL=client_email
   FIREBASE_PRIVATE_KEY=private_key
   ```
   A `private_key` do JSON já vem com `\n` escapado — copie o valor inteiro entre
   aspas, sem editar as quebras de linha.
4. **Guarde esse arquivo `.json` em local seguro e nunca o versione no Git** — ele dá
   acesso total ao seu projeto Firebase.

### Passo 6 — Testar

1. Reinicie o servidor (`npm run dev`) para carregar as novas variáveis.
2. Publique um aviso no mural com uma foto anexada — se o upload funcionar e a foto
   aparecer no mural, o Storage está OK.
3. Acesse o app pelo navegador como responsável e aceite a permissão de notificação —
   se não der erro no console, o push está registrando o token corretamente.

> O plano gratuito (**Spark**) do Firebase não exige cartão de crédito, não expira, e
> cobre bastante margem para uma escola pequena/média (5 GB de armazenamento, milhares
> de notificações/dia). Se a escola crescer muito, o Firebase avisa antes de qualquer
> cobrança — o plano pago (Blaze) só é necessário acima desses limites.

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

## Mensagens por WhatsApp e e-mail (Chatwoot)

A tela **Mensagens** conversa nativamente dentro do app, mas a equipe também pode enviar
uma mensagem por **WhatsApp** ou **e-mail** direto de uma conversa — e a resposta do
responsável (por qualquer um dos dois canais) volta automaticamente para a mesma
conversa no ClassLink, com atualização quase em tempo real (a tela busca mensagens
novas a cada poucos segundos).

Quem cuida de falar de fato com o WhatsApp/e-mail é o **[Chatwoot](https://www.chatwoot.com)**
— uma plataforma de atendimento open source. O ClassLink só conversa com a API do
Chatwoot; a conexão com o WhatsApp Business e a caixa de e-mail em si é configurada
dentro do próprio Chatwoot.

### Como funciona

1. Ao escolher "Enviar por: WhatsApp" ou "Enviar por: E-mail" numa conversa, o ClassLink
   cria (ou reaproveita) um contato e uma conversa no Chatwoot para aquele responsável e
   envia a mensagem por lá.
2. Quando o responsável responde — pelo WhatsApp ou respondendo o e-mail — o ClassLink
   busca as mensagens novas dessa conversa direto na API do Chatwoot toda vez que a tela
   de conversa é aberta/atualizada (a cada poucos segundos, enquanto estiver aberta) e
   grava as que ainda não existem. **Webhooks são um recurso pago no Chatwoot Cloud**
   (a partir do plano Startups), então o ClassLink usa esse polling como caminho padrão
   — funciona no plano gratuito. Se sua conta tiver webhooks disponíveis, `/api/webhooks/
   chatwoot` também existe e entrega a mesma coisa de forma mais instantânea (os dois
   convivem sem conflito: cada mensagem só é gravada uma vez, seja por qual caminho
   chegar primeiro).
3. Cada mensagem mostra de qual canal veio ("via WhatsApp", "via E-mail" ou nenhuma
   marcação quando foi só pelo app).

### Configurando o Chatwoot

1. Crie uma conta em [chatwoot.com](https://www.chatwoot.com) (nuvem, tem plano
   gratuito) ou suba a versão self-hosted. Anote a **URL da instância** e o **id da
   conta** (aparece na URL do painel, ex: `.../app/accounts/1/...` → id `1`).
2. Em **Perfil (canto inferior esquerdo) → Configurações de acesso**, gere um **token de
   acesso** do agente que vai enviar as mensagens.
3. Crie um **inbox de WhatsApp**: Configurações → Inboxes → Adicionar inbox → WhatsApp.
   O Chatwoot pede as mesmas credenciais da **WhatsApp Cloud API da Meta** (Meta
   Business Manager → WhatsApp → Introdução): número de telefone comercial verificado,
   `Phone Number ID` e token permanente. Essa verificação da Meta é o passo que mais
   demora — pode levar dias e costuma pedir documentos reais da escola.
4. Crie um **inbox de E-mail**: Configurações → Inboxes → Adicionar inbox → E-mail. O
   Chatwoot gera um endereço próprio (ex: `suporte@suaempresa.chatwoot.com`) ou você
   pode configurar um domínio próprio com encaminhamento — qualquer uma das duas
   opções funciona, o ClassLink só precisa do **id do inbox**.
5. Pegue o **id de cada inbox**: abra o inbox em Configurações → Inboxes → (o inbox) →
   Configurações, o id aparece na URL da página.
6. Preencha no `.env`:
   ```
   CHATWOOT_BASE_URL="https://app.chatwoot.com"
   CHATWOOT_ACCOUNT_ID="1"
   CHATWOOT_API_ACCESS_TOKEN="..."
   CHATWOOT_INBOX_ID_WHATSAPP="..."
   CHATWOOT_INBOX_ID_EMAIL="..."
   CHATWOOT_WEBHOOK_SECRET="gere-uma-string-aleatoria"
   ```
7. **Opcional** (só funciona em planos pagos do Chatwoot Cloud — pule se estiver no
   plano gratuito, o polling do passo 2 já cobre isso): cadastre o webhook em
   Configurações → Integrações → Webhooks → Adicionar webhook, URL
   `https://SEU_DOMINIO/api/webhooks/chatwoot?secret=CHATWOOT_WEBHOOK_SECRET` (o
   `secret` é seu, não do Chatwoot — a versão open source não assina o payload do
   webhook, então a segurança depende dessa URL ser secreta), evento **Message
   created**.

> ⚠️ Fora de uma janela de 24h desde a última mensagem recebida do contato, o WhatsApp
> só permite enviar "modelos de mensagem" pré-aprovados pela Meta, não texto livre —
> isso é uma regra do WhatsApp, não do Chatwoot ou do ClassLink. Para o primeiro contato
> com uma família, pode ser necessário aprovar um modelo no Meta Business Manager.

> ⚠️ Assim como a API do Banco Inter, a API do Chatwoot pode mudar de versão — confira
> a [documentação oficial](https://www.chatwoot.com/developers/api) antes de ir para
> produção. Toda a integração fica isolada em `src/lib/chatwoot.ts`.

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
- **Fotos e vídeos do mural**: o bucket do Firebase Storage é privado (regras negam
  qualquer acesso direto do navegador) — a leitura só acontece via URL assinada de
  curta duração (7 dias), gerada pelo backend a cada carregamento do mural. Não existe
  link público permanente para as fotos de alunos.
- **Chatwoot (WhatsApp/e-mail)**: nome, telefone e e-mail do responsável só são
  compartilhados com o Chatwoot no momento em que a equipe manda a primeira mensagem
  por WhatsApp ou e-mail para aquele responsável específico — não há sincronização em
  massa de contatos. Trate o Chatwoot como operador de dados (LGPD art. 5º, VII) e
  inclua-o no seu registro de tratamento/política de privacidade caso ative esse canal.

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
5. Siga o passo a passo de [Ativando o Firebase](#ativando-o-firebase-notificações-push--upload-de-mídia)
   para habilitar push e upload de mídia, preenchendo `NEXT_PUBLIC_FIREBASE_*`,
   `FIREBASE_*` e `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
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
