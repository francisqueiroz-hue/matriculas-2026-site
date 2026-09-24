# ClassLink — Comunicação Escola-Família

Aplicativo web (PWA) para comunicação entre escola e responsáveis, inspirado no ClassApp.
Inclui: mural de avisos, mensagens diretas (com envio opcional por **WhatsApp/e-mail**),
agenda escolar, painel administrativo com métricas de engajamento,
**autorizações e confirmações digitais** (comunicados com resposta), lançamento de
**notas por trimestre**, **controle de frequência** e **emissão automática de boletos via
Banco Inter**.

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
- **Mensagens por WhatsApp/e-mail**: WhatsApp Cloud API (Meta, oficial) + Mailgun
  (envio e recebimento de e-mail), cada canal recebendo respostas via webhook próprio.
- **PWA**: `manifest.json` + service worker próprio (cache de app-shell), instalável via
  "Adicionar à tela inicial".
- **Testes**: Vitest (autenticação, upload, comunicados, cálculo de vencimento, cálculo de
  frequência, payload de cobrança do Banco Inter).

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
│   │   │   ├── attendance/      # marcação e histórico de frequência
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
| **Administrador** | Gerenciar turmas, alunos e vínculos de responsáveis; criar contas de equipe; publicar avisos/comunicados para toda a escola ou turmas; ver painel de engajamento; configurar mensalidade e vencimento; acompanhar boletos pagos/pendentes; marcar e consultar frequência de qualquer turma; conversar com responsáveis e com qualquer outro membro da equipe. |
| **Professor/Funcionário** | Publicar avisos e comunicados nas turmas em que leciona; enviar mensagens diretas aos responsáveis dessas turmas e a outros membros da equipe (direção e demais professores/funcionários); criar eventos na agenda; ver quem respondeu um comunicado e reenviar lembrete; marcar e consultar frequência das turmas em que leciona. |
| **Responsável** | Ver o mural (escola + turma do filho/a), confirmar leitura de avisos, responder comunicados (autorizar passeio, confirmar presença, confirmar leitura) para cada filho vinculado, conversar com a equipe escolar, ver a agenda, a frequência e os boletos de cada filho. |

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
3. Cadastre as variáveis na Vercel (Settings → Environment Variables, ambiente
   **Production**) e faça um novo deploy — as `NEXT_PUBLIC_*` entram no código do
   navegador no momento do build. O quadro **Configuração dos avisos**, no Painel da
   administração, mostra se cada parte foi reconhecida.
4. No ClassLink, clique em **Ativar avisos** (convite no topo do painel) e permita as
   notificações. O contador "Dispositivos registrados para push" do Painel deve subir.
5. No iPhone, o push só funciona com o ClassLink **adicionado à Tela de Início** e aberto
   pelo ícone (limitação do iOS).

> O plano gratuito (**Spark**) do Firebase não exige cartão de crédito, não expira, e
> cobre bastante margem para uma escola pequena/média (5 GB de armazenamento, milhares
> de notificações/dia). Se a escola crescer muito, o Firebase avisa antes de qualquer
> cobrança — o plano pago (Blaze) só é necessário acima desses limites.

## Página de matrículas e rematrícula

- A página pública de matrículas fica em **`/matriculas`** (link também na tela de login).
  A fonte única é `site/index.html` na raiz do repositório — a mesma publicada no GitHub
  Pages e enviada para a hospedagem do site da escola. Depois de editá-la, rode
  `npm run sync:matriculas` para regenerar `public/matriculas.html` (logos apontando para
  `/logos` e links do ClassLink relativos). O teste `tests/matriculas.test.ts` falha se as
  duas versões ficarem fora de sincronia.
- Responsáveis logados veem no painel o aviso de **rematrícula** com o nome dos filhos e
  um botão que abre o WhatsApp da secretaria com a confirmação pronta. Ano, número e
  ativação da campanha ficam em `src/lib/rematricula.ts` (`ativa: false` desliga o aviso).
- **Registro no sistema:** cada envio dos formulários de pré-matrícula e rematrícula (no
  site da escola ou em `/matriculas`) e cada confirmação feita pelo aviso do painel é
  gravado em `SolicitacaoMatricula` e aparece para a administração em **Matrículas**
  (`/dashboard/admin/matriculas`): indicadores, filtros por tipo e situação (Nova, Em
  atendimento, Visita agendada, Matriculado, Desistiu), anotações internas, botão de
  WhatsApp para a família, exportação CSV e exclusão (pedido LGPD). Só o perfil ADMIN acessa.
- O endpoint público `POST /api/matriculas/solicitacoes` aceita chamadas de outros
  domínios (CORS aberto, sem cookies), exige o consentimento, tem campo-armadilha contra
  robôs e limita a 5 envios a cada 10 minutos por IP. Se houver mais de uma escola no
  banco, defina `MATRICULAS_SCHOOL_ID`.
- Para garantir que todas as famílias foram avisadas, crie também um **Comunicado** do tipo
  circular "Rematrícula 2027" com prazo de resposta: o painel mostra quem ainda não
  confirmou a leitura, permite reenviar lembrete e exportar CSV. (Os tipos atuais de
  comunicado não têm botões "rematricular / não rematricular"; a confirmação da vaga em si
  chega pelo WhatsApp.)

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

## Controle de frequência

Tela **Frequência**, disponível para todos os perfis (o que cada um vê/faz depende do
perfil, como na tabela acima):

- Administrador e professor marcam a frequência (Presente/Falta/Atraso/Falta
  justificada) de uma turma num dia — o professor só nas turmas em que leciona, a
  direção em qualquer turma da escola. Cada marcação é um upsert por aluno/dia
  (`Attendance`, único por `[studentId, date]`), então reabrir o mesmo dia e turma
  permite corrigir uma marcação já lançada.
- Administrador e professor também podem consultar o histórico e o resumo mensal de
  frequência de um aluno específico (mesma tela).
- O responsável vê o histórico e o resumo mensal de frequência de cada filho
  vinculado, com o percentual do mês e um alerta quando esse percentual fica abaixo de
  75% — o mínimo de frequência exigido pela LDB (Lei nº 9.394/1996, art. 24, VI) para
  aprovação na educação básica. Atraso conta como presença no percentual; falta
  justificada conta como ausência no percentual (mas é exibida separadamente) — essa é
  uma leitura razoável da norma geral, não uma opinião jurídica definitiva; confirme
  com a assessoria jurídica da escola antes de usar o percentual isoladamente para
  decidir uma retenção, já que regimentos internos e normas estaduais/municipais podem
  prever regras adicionais de abono/reposição.
- Alunos e turmas excluídos (`deletedAt`) preservam o histórico de frequência já
  lançado, consistente com a exclusão lógica usada no resto do app.

## Emissão de boletos via Banco Inter

Módulo financeiro simplificado: **não há** conciliação de extrato ou PIX avulso — apenas
geração mensal do valor da mensalidade por aluno, com emissão real de boleto/PIX no Inter
e atualização automática do status quando pago.

**O valor não depende do Inter estar configurado.** São duas etapas independentes:

1. **Geração do valor** — sempre acontece: cria o registro do mês (valor + vencimento)
   para cada aluno com mensalidade definida, e é isso que aparece para o responsável em
   **Financeiro**. Não exige nenhuma credencial do Inter.
2. **Emissão real** (boleto com linha digitável, PIX copia-e-cola e PDF pagáveis) — só é
   tentada quando as credenciais do Inter (abaixo) estão configuradas. Sem elas, o
   responsável já vê o valor e o vencimento, mas ainda sem opção de pagar online — a
   tela mostra "Pagamento online ainda não disponível para este mês" nesse caso.

Isso significa que dá para usar só a etapa 1 por enquanto (ex: enquanto a integração com
o Inter não é prioridade) e ligar a etapa 2 depois, sem retrabalho — quando o Inter for
configurado, os boletos do mês corrente que já existiam só com o valor são completados
com a emissão real, em vez de duplicados.

### Como funciona

1. O administrador define, em **Financeiro**, o dia de vencimento padrão e o dia do mês
   em que os valores devem ser gerados; e, na tela **Alunos**, o valor da mensalidade
   (e opcionalmente um dia de vencimento específico) de cada aluno.
2. O job `/api/cron/emitir-boletos`, rodando uma vez por dia, verifica se hoje é o dia
   configurado para cada escola; para cada aluno com mensalidade definida e sem boleto
   no mês corrente, cria o registro de valor e, se o Inter estiver configurado, tenta
   também a emissão real (gravando `PENDENTE` ou `ERRO`, com o motivo, se essa etapa
   falhar). Em **Financeiro** (admin) também dá para clicar em **"Gerar valores deste
   mês"** para criar esses registros na hora, sem esperar o dia configurado — útil para
   já popular o mês corrente.
3. O responsável cadastra CPF e endereço em **Financeiro → Cadastrar dados de cobrança**
   — só é exigido quando a emissão real (etapa 2 acima) for tentada; por isso não é
   coletado no cadastro padrão, só quando o módulo financeiro é usado.
4. O Inter chama `POST /api/webhooks/banco-inter` quando o boleto é pago; o status muda
   para `PAGO` e o responsável recebe uma notificação push.
5. O responsável acessa **Financeiro** para ver o valor, o vencimento e — quando já
   emitido de verdade — baixar o PDF (buscado sob demanda na API do Inter; o PDF não
   fica armazenado no servidor).

### Obtendo as credenciais no portal do Inter

1. Acesse [developers.bancointer.com.br](https://developers.bancointer.com.br) e faça
   login com as credenciais da conta PJ do Inter que receberá os pagamentos.
2. Crie uma aplicação em **Minhas aplicações**, habilitando o escopo **Cobrança
   (Boletos)** — inclua também `webhook-boleto.write`/`webhook-boleto.read` se quiser
   cadastrar o webhook por lá.
3. Gere o **certificado digital** da aplicação: o portal disponibiliza para download o
   certificado (`.crt`) e a chave privada (`.key`) usados na autenticação mTLS. Em
   desenvolvimento local, salve-os fora do controle de versão (ex: `classlink/certs/`,
   já ignorado pelo `.gitignore`). **Em produção na Vercel** (sem sistema de arquivos
   persistente), copie o conteúdo de cada arquivo direto para as variáveis de ambiente
   `BANCO_INTER_CERT`/`BANCO_INTER_KEY` — veja a opção 1 no `.env.example`.
4. Copie o **Client ID** e o **Client Secret** exibidos na aplicação.
5. Anote o **número da conta corrente** Inter que vai receber os boletos.
6. Preencha no `.env` (desenvolvimento local, usando os caminhos de arquivo):
   ```
   BANCO_INTER_AMBIENTE="sandbox"        # troque para "producao" quando for para valer
   BANCO_INTER_CLIENT_ID="..."
   BANCO_INTER_CLIENT_SECRET="..."
   BANCO_INTER_CERT_PATH="./certs/inter-certificado.crt"
   BANCO_INTER_KEY_PATH="./certs/inter-chave.key"
   BANCO_INTER_CONTA_CORRENTE="..."
   BANCO_INTER_WEBHOOK_SECRET="gere-uma-string-aleatoria"
   ```
   Em produção serverless, substitua as duas últimas linhas do certificado por
   `BANCO_INTER_CERT`/`BANCO_INTER_KEY` com o conteúdo dos arquivos (veja o passo 3).
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

## Mensagens por WhatsApp e e-mail

A tela **Mensagens** conversa nativamente dentro do app, mas a equipe também pode enviar
uma mensagem por **WhatsApp** ou **e-mail** direto de uma conversa — e a resposta do
responsável (por qualquer um dos dois canais) volta automaticamente para a mesma
conversa no ClassLink. Cada canal fala com seu próprio provedor:

- **WhatsApp**: WhatsApp Cloud API, direto da Meta (sem intermediário).
- **E-mail**: Mailgun, que envia e também roteia as respostas de volta.

### Como funciona

1. Ao escolher "Enviar por: WhatsApp" ou "Enviar por: E-mail" numa conversa, o ClassLink
   chama a API do respectivo provedor.
2. Quando o responsável responde — pelo WhatsApp ou respondendo o e-mail — o provedor
   chama um webhook do ClassLink (`/api/webhooks/whatsapp` ou `/api/webhooks/email`),
   que grava a resposta na conversa e notifica a equipe. A tela de conversa aberta
   também atualiza sozinha a cada poucos segundos, então a resposta aparece quase na
   hora sem precisar recarregar a página.
3. Cada mensagem mostra de qual canal veio ("via WhatsApp", "via E-mail" ou nenhuma
   marcação quando foi só pelo app).

### Configurando o WhatsApp (Meta Cloud API)

1. Acesse [business.facebook.com](https://business.facebook.com) e crie/entre numa
   **Conta Comercial Meta**.
2. Em [developers.facebook.com](https://developers.facebook.com), crie um **App** do
   tipo "Business" e adicione o produto **WhatsApp**.
3. Em WhatsApp → Introdução, você recebe um **número de teste** gratuito (dá pra
   começar testando com ele) e o **Token de acesso temporário**. Para produção de
   verdade, registre o **número de telefone comercial da escola** (WhatsApp → Números
   de telefone) — esse é o passo que exige verificação da empresa pela Meta e pode
   levar alguns dias, às vezes pedindo documentos reais da escola (CNPJ, etc.).
4. Gere um **token permanente**: crie um Utilizador de Sistema em Configurações da
   Empresa → Utilizadores → Utilizadores do sistema, atribua o app do WhatsApp a ele, e
   gere um token sem prazo de expiração (o token temporário do passo 3 expira em 24h).
5. Anote o **Phone Number ID** (WhatsApp → Configuração da API).
6. Preencha no `.env`:
   ```
   WHATSAPP_API_TOKEN="..."
   WHATSAPP_PHONE_NUMBER_ID="..."
   WHATSAPP_VERIFY_TOKEN="escolha-uma-string-qualquer"
   WHATSAPP_APP_SECRET="..."   # Configurações do App → Básico → Chave Secreta do Aplicativo
   ```
7. Cadastre o webhook: no painel do App → WhatsApp → Configuração, campo **Webhook**,
   informe a URL `https://SEU_DOMINIO/api/webhooks/whatsapp`, cole o mesmo valor de
   `WHATSAPP_VERIFY_TOKEN` no campo de verificação, e clique em Verificar — a Meta
   chama a URL uma vez para confirmar antes de aceitar. Depois, inscreva-se no campo
   **messages**.

> ⚠️ Fora de uma janela de 24h desde a última mensagem recebida do contato, a Cloud API
> só permite enviar "modelos de mensagem" pré-aprovados pela Meta, não texto livre. Pior:
> o texto livre é **aceito** pela API (resposta 200 com id) e só depois descartado — a
> falha (código 131047) chega pelo webhook de status e fica registrada nos logs.

#### Família pede o acesso pelo WhatsApp ("ACESSO")

Não precisa de modelo aprovado: quando o responsável envia **ACESSO** (ou uma mensagem
curta com "senha") para o número dedicado da escola — (21) 99286-5778, definido em
`src/lib/whatsapp-escola.ts` —, o webhook reconhece o telefone cadastrado e responde na
hora, em texto livre (a janela de 24h foi aberta pela própria família), com o link e uma
senha provisória. A senha só é trocada se a resposta for aceita pela Meta. Número não
cadastrado recebe uma orientação para procurar a secretaria; conversas comuns não geram
senha. A comparação de telefones aceita o formato que a Meta usa no webhook para
celulares brasileiros, **sem o nono dígito** (ex.: 552187654321 = (21) 98765-4321).

Requisitos: webhook configurado (passo 7 acima, campo **messages**) e
`WHATSAPP_APP_SECRET` preenchido — sem a assinatura válida o webhook recusa as mensagens.

A tela **Acessos** (administração) lista os responsáveis que nunca entraram (nenhuma
sessão criada), com o botão **Enviar convite pelo meu WhatsApp** (mensagem sem senha, com
o link `wa.me/5521992865778?text=ACESSO`), **Gerar nova senha** e, com o modelo aprovado
configurado, **Enviar acesso automático para quem nunca entrou** (em lote). O login, o
guia (`/guia`), o "Esqueci minha senha" e a página de matrículas também mostram o atalho.

Para testes locais, `WHATSAPP_API_URL` pode apontar a Graph API para um simulador.

#### Avisos de mensagens para a equipe no WhatsApp

Cada pessoa da equipe (direção/professores) pode ativar em **Conta → Avisos de mensagens
no WhatsApp** (informando o celular). A partir daí, quando uma família escreve (pelo app ou
pelo WhatsApp) ou um colega manda mensagem interna, o número da escola envia ao celular
dela um aviso com o remetente, o trecho da mensagem e o link para responder. Várias
mensagens seguidas na mesma conversa geram no máximo um aviso a cada 10 minutos.

Como o aviso parte da escola (fora da janela de 24h), ele exige um modelo aprovado:

1. WhatsApp Manager → **Modelos de mensagem** → Criar. Categoria **Utilidade**, idioma
   **Português (BR)**, nome por exemplo `aviso_mensagem_classlink`.
2. Corpo (a Meta não aceita variável no começo nem no fim do texto):
   ```
   Você recebeu uma nova mensagem no ClassLink de {{1}}:

   "{{2}}"

   Para responder, abra: {{3}}

   Aviso automático da escola.
   ```
   Exemplos para a revisão: `Maria Silva`, `Bom dia! O Davi vai sair mais cedo hoje`,
   `https://seu-dominio/dashboard/mensagens/abc123`.
3. Aprovado, configure `WHATSAPP_TEMPLATE_AVISO=aviso_mensagem_classlink` na Vercel e faça
   um novo deploy. O Painel da administração mostra, em **Configuração dos avisos**, o que
   já está ativo.

#### Modelo para enviar acesso e senha provisória

O envio automático do acesso (ao vincular um responsável novo, ao redefinir a senha pelo
painel e no "Esqueci minha senha") usa **somente** um modelo aprovado — nunca texto
livre, que não chegaria a famílias que ainda não conversaram com a escola.

1. WhatsApp Manager → **Modelos de mensagem** → Criar modelo. Categoria **Utilidade**,
   idioma **Português (BR)**, nome por exemplo `acesso_classlink`.
2. Corpo sugerido (as variáveis precisam estar nesta ordem):
   ```
   Olá, {{1}}! Seu acesso ao ClassLink, o aplicativo de comunicação da escola, está pronto.

   Acesse: {{2}}
   Entrar com: {{3}}
   Senha provisória: {{4}}

   Assim que entrar, troque a senha em Conta > Trocar senha.
   ```
   Exemplos para a revisão da Meta: `Maria`, `https://seu-dominio/guia`,
   `(21) 98765-4321`, `a1b2c3d4e5f6`.
3. Depois de aprovado, configure `WHATSAPP_TEMPLATE_ACESSO=acesso_classlink` (e
   `WHATSAPP_TEMPLATE_IDIOMA=pt_BR`, que já é o padrão).

Sem o modelo configurado, nada é enviado automaticamente — e o sistema diz isso. Em todos
os casos, o painel mostra o botão **"Enviar acesso pelo meu WhatsApp"**, que abre o
WhatsApp de quem está no painel (celular ou WhatsApp Web) com a mensagem pronta para
aquele contato. Isso funciona na hora, sem API nem aprovação. O "Esqueci minha senha" só
troca a senha quando consegue entregar a nova (modelo no WhatsApp ou e-mail); caso
contrário, a senha antiga continua valendo.

### Configurando o e-mail (Mailgun)

1. Crie uma conta em [mailgun.com](https://www.mailgun.com) (tem plano gratuito).
2. Adicione e verifique um **domínio** (Sending → Domains → Add New Domain) — siga as
   instruções para adicionar os registros DNS (MX, TXT) indicados pelo Mailgun no
   provedor onde o domínio da escola está registrado.
3. Pegue a **API Key** em Settings → API Keys ("Private API key").
4. Configure o **recebimento**: Receiving → Create route. Em "Expression Type" escolha
   **Match Recipient**, com o filtro `conversa-.*@SEU_DOMINIO` (regex); em "Actions",
   marque **Forward** e informe `https://SEU_DOMINIO_CLASSLINK/api/webhooks/email`.
5. Pegue a **chave de assinatura do webhook** em Settings → Webhooks → "HTTP webhook
   signing key".
6. Preencha no `.env`:
   ```
   MAILGUN_API_KEY="..."
   MAILGUN_DOMAIN="mail.suaescola.com.br"
   MAILGUN_REGION=""            # "eu" só se sua conta for da região Europa
   EMAIL_FROM="escola@mail.suaescola.com.br"
   MAILGUN_WEBHOOK_SIGNING_KEY="..."
   ```

> ⚠️ As APIs da Meta e do Mailgun podem mudar de versão — confira a documentação oficial
> ([WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api),
> [Mailgun](https://documentation.mailgun.com)) antes de ir para produção. Cada
> integração fica isolada em `src/lib/whatsapp.ts` e `src/lib/email.ts`.

## Mensagens internas da equipe

Além de conversar com responsáveis, administradores e professores/funcionários também
podem trocar mensagens diretamente entre si — por exemplo, um professor avisando a
coordenação sobre uma ocorrência, ou a direção combinando algo com toda a equipe
individualmente. É um canal separado das conversas com família:

- Aparece na mesma tela **Mensagens**, numa lista única e ordenada pela mensagem mais
  recente, com um rótulo "· equipe" para diferenciar visualmente das conversas com
  responsáveis.
- Ao clicar em "Nova conversa", os contatos ficam agrupados em duas seções: **Equipe**
  (qualquer ADMIN/STAFF ativo da escola, exceto você mesmo) e **Responsáveis**.
- Não tem envio por WhatsApp/e-mail nem o botão de "Requisição de itens" — esses dois
  recursos são específicos da comunicação com a família. É só texto, dentro do app.
- Só ADMIN e STAFF têm acesso; responsáveis não veem nem podem iniciar esse tipo de
  conversa.
- Tecnicamente é modelado como uma tabela separada (`TeamConversation`/`TeamMessage`),
  reaproveitando o mesmo padrão de UI e as mesmas notificações push das conversas com
  responsáveis, mas sem a lógica de "só posso falar com quem compartilha uma turma" —
  qualquer membro da equipe pode falar com qualquer outro da mesma escola.

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
- **WhatsApp/e-mail**: o telefone/e-mail do responsável só é enviado à Meta (WhatsApp)
  ou ao Mailgun no momento em que a equipe manda uma mensagem por aquele canal para
  aquele responsável específico — não há sincronização em massa de contatos. Trate
  esses provedores como operadores de dados (LGPD art. 5º, VII) e inclua-os no seu
  registro de tratamento/política de privacidade caso ative esses canais.

## Deploy (PWA)

1. Crie um banco PostgreSQL gerenciado (plano gratuito): [Neon](https://neon.tech),
   [Supabase](https://supabase.com) ou [Railway](https://railway.app).
2. Configure as variáveis de ambiente na plataforma de deploy (mesmas do `.env.example`).
   Os certificados do Banco Inter não podem ser lidos de um caminho de arquivo em
   ambientes serverless (a Vercel não tem sistema de arquivos persistente) — grave o
   conteúdo do `.crt`/`.key` diretamente nas variáveis `BANCO_INTER_CERT`/
   `BANCO_INTER_KEY` (veja a opção 1 no `.env.example`); `src/lib/banco-inter.ts` já lê
   o certificado a partir delas quando estiverem preenchidas, sem precisar de arquivo
   nenhum em disco.
3. As migrações do banco são aplicadas **automaticamente** a cada deploy de produção na
   Vercel: o script `vercel-build` roda `scripts/migrate-on-deploy.mjs` (que executa
   `prisma migrate deploy` só quando `VERCEL_ENV=production`) antes do `next build`.
   Deploys de preview nunca migram. Se a migração falhar, o deploy é interrompido e a
   versão anterior continua no ar. São até 3 tentativas (a 2ª e a 3ª sem o advisory lock
   do Prisma, que costuma travar via pooler), e o log do build mostra o host do banco
   (sem senha) e a provável causa em português. No Neon, se o `DATABASE_URL` for o do
   pooler e não houver `DIRECT_URL`, a migração usa a conexão direta automaticamente;
   em outros provedores com pooler (PgBouncer, Supabase porta 6543), cadastre
   `DIRECT_URL` com a conexão direta.
   Fora da Vercel, rode `npx prisma migrate deploy` manualmente. Depois,
   `npm run db:seed` se quiser dados de exemplo.
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

- Conciliação de extrato bancário ou PIX avulso (deliberadamente fora do escopo do
  módulo financeiro atual).
- App nativo publicado nas lojas (o app atual é um PWA instalável pelo navegador).
