# Controle Financeiro

App de controle financeiro pessoal e da empresa — instalável no celular e no
computador (PWA), com todos os lançamentos sincronizados automaticamente
entre os dispositivos assim que houver internet (via Firebase Firestore).
Funciona offline: o que for lançado sem internet fica na fila e é enviado
sozinho quando a conexão voltar.

Categorias e alguns lançamentos de referência de Agosto/2026 já vêm
baseados na planilha original (`Custo Mensal`, `Despesas Gerais`, `Caixa -
Checklist`) — ver "Importar dados da planilha" abaixo.

## O que o app faz

- **Dashboard**: saldo geral, saldo separado por "pessoal" e "empresa", e os
  últimos lançamentos.
- **Lançamentos**: adicionar/editar/excluir receitas e despesas, com
  categoria, escopo (pessoal/empresa), data e descrição.
- **Relatórios**: despesas por categoria (gráfico de barras e de pizza) por
  mês, filtrando por pessoal/empresa.
- **Categorias**: criar/remover categorias e importar os lançamentos de
  referência da planilha original.

## 1. Configurar o Firebase (obrigatório)

O app usa o [Firebase](https://firebase.google.com) para guardar os dados
na nuvem e sincronizar entre aparelhos. É gratuito para este uso (plano
Spark).

1. Acesse o [Console do Firebase](https://console.firebase.google.com) e
   crie um projeto novo (ex: "controle-financeiro").
2. **Ative o Firestore**: menu lateral → *Firestore Database* → *Criar
   banco de dados* → modo produção → escolha uma região (ex:
   `southamerica-east1`).
3. **Ative a autenticação por e-mail/senha**: menu lateral → *Authentication*
   → *Get started* → aba *Sign-in method* → habilite *E-mail/senha*.
4. **Crie seu usuário**: aba *Users* → *Add user* → informe o e-mail e a
   senha que você vai usar para entrar no app (celular e computador usam a
   mesma conta).
5. **Pegue a config do app web**: *Configurações do projeto* (ícone de
   engrenagem) → aba *Geral* → em "Seus apps" clique no ícone `</>` para
   criar um app Web → copie os valores de `firebaseConfig`.
6. **Publique as regras de segurança**: com a
   [Firebase CLI](https://firebase.google.com/docs/cli) instalada
   (`npm install -g firebase-tools`), rode dentro desta pasta:
   ```bash
   firebase login
   firebase use --add          # selecione o projeto criado
   firebase deploy --only firestore:rules
   ```
   Isso garante que cada pessoa só acesse os próprios dados
   (`firestore.rules` já vem pronto no projeto).

7. Copie `.env.example` para `.env` e preencha com os valores do passo 5:
   ```bash
   cp .env.example .env
   ```

## 2. Rodar localmente

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal, entre com o e-mail/senha criados no
passo 1.4, e pronto.

## 3. Publicar (para usar no celular e no computador)

Qualquer host de sites estáticos serve. O mais simples é o
[Vercel](https://vercel.com) ou o próprio [Firebase Hosting](https://firebase.google.com/docs/hosting):

```bash
npm run build
firebase deploy --only hosting   # se optar pelo Firebase Hosting
```

Se usar Firebase Hosting, rode `firebase init hosting` uma vez (diretório
público: `dist`, SPA: sim) antes do primeiro deploy. Configure as mesmas
variáveis de `.env` no painel do serviço de hosting escolhido (Vercel,
Netlify etc. têm uma seção de "Environment Variables").

**Instalar no celular/computador**: abra o link publicado no navegador
(Chrome/Safari) e use "Adicionar à tela inicial" (celular) ou o ícone de
instalar na barra de endereço (computador). O app abre como um aplicativo
normal, com ícone próprio, mesmo sem o navegador aberto.

## 4. Importar dados da planilha

Depois de configurado, entre no app → aba **Categorias** → botão
**"Importar Agosto/2026"**. Isso lança no app os valores de referência que
já estavam na planilha (folha de pagamento, água, luz, aluguel, casa,
supermercado etc.), para você editar ou apagar conforme necessário. É uma
ação única — passe a lançar os próximos gastos direto pelo app, no celular
ou no computador, e tudo fica sincronizado nos dois.

## Estrutura dos dados

Cada usuário autenticado tem sua própria árvore de dados no Firestore
(`users/{uid}/transactions`, `users/{uid}/categories`), isolada por conta
segundo `firestore.rules`. Para compartilhar o controle entre duas pessoas
(ex: você e um sócio/contador), use o mesmo login em ambos os aparelhos.

## Comandos

```bash
npm run dev      # ambiente de desenvolvimento
npm run build    # build de produção (pasta dist/)
npm run lint     # checagem de lint
```
