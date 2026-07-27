# ClassLink — Comunicação Escola-Família

Aplicativo web (PWA) para comunicação entre escola e responsáveis, inspirado no ClassApp.
Este é o **MVP (Fase 1)**: mural de avisos, mensagens diretas, agenda escolar e um painel
administrativo com métricas de engajamento. Autorizações digitais e controle financeiro
ficam para uma Fase 2 (veja [Roadmap](#roadmap)).

## Stack

- **Frontend/Backend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS, com rotas de
  API do próprio Next.js (`src/app/api/**`).
- **Banco de dados**: PostgreSQL via Prisma ORM (driver adapter `@prisma/adapter-pg`).
- **Autenticação**: JWT de acesso (curta duração, cookie httpOnly) + refresh token opaco
  rotativo (cookie httpOnly, hash armazenado no banco), senhas com `bcryptjs`.
- **Mídia**: upload de fotos/vídeos via Cloudinary, com compressão de imagem no navegador
  antes do envio (`browser-image-compression`).
- **Notificações push**: Firebase Cloud Messaging (service worker + `firebase-admin`).
- **PWA**: `manifest.json` + service worker próprio (cache de app-shell), instalável via
  "Adicionar à tela inicial".
- **Testes**: Vitest (autenticação e validação de upload).

## Estrutura de pastas

```
classlink/
├── prisma/
│   ├── schema.prisma        # modelos do banco (School, User, Class, Student, Post...)
│   └── seed.ts               # dados de demonstração
├── src/
│   ├── app/
│   │   ├── login/             # tela de login
│   │   ├── dashboard/         # área autenticada (mural, mensagens, agenda, admin)
│   │   ├── api/                # rotas de API (auth, posts, messages, events, admin...)
│   │   ├── sw.js/route.ts     # service worker servido dinamicamente
│   │   └── layout.tsx
│   ├── components/            # componentes de UI reutilizáveis
│   ├── lib/                   # auth, prisma client, cloudinary, push, validadores...
│   └── proxy.ts               # proteção de rotas (equivalente ao middleware no Next 16)
├── tests/                     # testes automatizados (Vitest)
├── public/icons/               # ícones do PWA
└── .env.example
```

## Perfis de usuário

| Perfil | Pode |
| --- | --- |
| **Administrador** | Gerenciar turmas, alunos e vínculos de responsáveis; criar contas de equipe; publicar avisos para toda a escola ou turmas; ver painel de engajamento. |
| **Professor/Funcionário** | Publicar avisos nas turmas em que leciona; enviar mensagens diretas aos responsáveis dessas turmas; criar eventos na agenda. |
| **Responsável** | Ver o mural (escola + turma do filho/a), confirmar leitura de avisos, conversar com a equipe escolar, ver a agenda. |

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
variáveis do Cloudinary e do Firebase são necessárias apenas para upload de mídia e
notificações push, respectivamente — sem elas o app funciona normalmente (upload retorna
erro amigável e push é ignorado silenciosamente).

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

## Deploy (Fase 1 — PWA)

1. Crie um banco PostgreSQL gerenciado (plano gratuito): [Neon](https://neon.tech),
   [Supabase](https://supabase.com) ou [Railway](https://railway.app).
2. Configure as variáveis de ambiente na plataforma de deploy (mesmas do `.env.example`).
3. Rode `npx prisma migrate deploy` contra o banco de produção (uma vez, no pipeline de
   deploy ou manualmente) e depois `npm run db:seed` se quiser dados de exemplo.
4. Faça o deploy na [Vercel](https://vercel.com): conecte o repositório GitHub — a Vercel
   detecta o Next.js automaticamente.
5. Crie um projeto no [Firebase](https://console.firebase.google.com) para ativar as
   notificações push e preencha as chaves `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_*` e
   `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
6. Como o app é um PWA, os responsáveis podem instalá-lo pelo navegador ("Adicionar à
   tela inicial") sem precisar publicar em loja de aplicativos.
7. Teste tudo em produção com uma turma pequena antes de liberar para toda a escola.

## LGPD

- **Minimização de dados**: o cadastro do aluno guarda apenas nome, turma e data de
  nascimento (opcional). Nenhum outro dado sensível é coletado por padrão.
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

## Roadmap (Fase 2 — fora do escopo deste MVP)

- Autorizações digitais (assinatura de termos de consentimento — passeios, uso de
  imagem etc.).
- Controle financeiro simplificado (status de mensalidade, lembretes automáticos).
- Controle de frequência completo pela interface (o modelo `Attendance` já existe no
  banco, mas ainda não tem tela/API dedicada).
- App nativo publicado nas lojas (o MVP atual é um PWA instalável pelo navegador).
