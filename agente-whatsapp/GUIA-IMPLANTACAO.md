# Guia de implantação da Lia — Cloudflare e Meta (sem programar)

Feito para você, dono da escola, executar **só pelo navegador**. Tempo total: cerca de 2 horas, em duas sessões. Custo-alvo: R$ 0.

> **Leia antes.** Os nomes de menus e botões abaixo vêm de documentação e de guias de terceiros, não de uma conta aberta por mim. A Cloudflare e a Meta mudam as telas com frequência. Se algum nome for diferente, procure o equivalente. Se **travar ou ficar em dúvida, pare e me mande uma captura de tela**: não adivinhe.
>
> **Regras de segurança.** Nunca cole senhas, tokens ou chaves no chat comigo. Eles ficam só nos lugares indicados abaixo (cofres de segredos do GitHub e da Cloudflare). Nunca desinstale o WhatsApp Business do celular da escola. Não registre o número público de novo na API pelo caminho comum da Meta: isso pode **desconectar o aplicativo**.

## Visão geral — três fases

| Fase | O que acontece | Mexe nas famílias? |
|---|---|---|
| **A. Cloudflare** | A Lia fica "hospedada" e o painel fica protegido | Não |
| **B. Teste com o Número de Teste da Meta** | Você conversa com a Lia de verdade, sem risco | Não |
| **C. Número público** | A Lia passa a atender as famílias | **Sim** — só depois de A e B aprovados |

Você já tem os dois números na Meta e o *Test Number* (+1 555-669-1138), que é o que vamos usar na fase B.

---

## Parte 0 — Conferências rápidas (10 min)

Faça antes de tudo; as respostas me ajudam a decidir o caminho.

- [ ] **0.1** No **WhatsApp Manager** (a tela das suas capturas), clique nos três pontinhos ao lado do selo **"IA ativa"** e veja o que é e se dá para desligar. Se for uma IA da própria Meta respondendo clientes, ela responderia **sem a triagem da Lia**: desligue ou me avise antes de continuar. *Mande-me uma captura.*
- [ ] **0.2** No celular da escola, o ícone do WhatsApp tem um **"B"**? (WhatsApp **Business**). Anote a versão do aplicativo (Configurações → Ajuda → Informações do app).
- [ ] **0.3** Decida quem será o **único e-mail** autorizado a abrir o painel (o seu).

---

## Parte A — Cloudflare e GitHub (cerca de 45 min)

### A1. Conta na Cloudflare (gratuita)
- [ ] Acesse cloudflare.com → **Sign up** → crie a conta e confirme o e-mail. Escolha o plano **Free**; não precisa cadastrar cartão nem domínio.

### A2. Criar o banco de dados
- [ ] No painel: **Storage & Databases → D1 SQL Database → Create** (o nome do menu pode variar).
- [ ] Nome do banco: `lia` (exatamente assim, minúsculo).
- [ ] Abra o banco criado e **copie o "Database ID"** (um código longo). Guarde no bloco de notas.

### A3. Duas informações da conta
- [ ] **Account ID**: na página inicial da conta (ou em *Workers & Pages* → barra lateral direita). Copie.
- [ ] **Token de API** (a "chave" para o GitHub publicar por você): *Profile (ícone do usuário) → API Tokens → Create Token*. Use o modelo **"Edit Cloudflare Workers"**; depois inclua a permissão **Account → D1 → Edit**. Crie e **copie o token na hora** (ele só aparece uma vez).

### A4. GitHub: guardar as chaves e rodar a publicação
O código da Lia está na branch `claude/upbeat-ramanujan-jgdelo` do repositório `matriculas-2026-site`.

- [ ] **Integrar o código**: o botão de publicar só aparece quando o arquivo `.github/workflows/lia-implantar.yml` está na branch principal. Peça-me para abrir o *pull request* e faça o *merge* quando eu avisar que está tudo verde. *(Não faço isso sem você pedir.)*
- [ ] No GitHub: repositório → **Settings → Secrets and variables → Actions**.
  - Aba **Secrets → New repository secret**: crie `CLOUDFLARE_API_TOKEN` (o token do A3) e `CLOUDFLARE_ACCOUNT_ID` (o Account ID).
  - Aba **Variables → New repository variable**: crie `CLOUDFLARE_D1_ID` (o Database ID do A2).
- [ ] **Primeiro teste, sem risco**: aba **Actions → "Lia - testar e implantar (manual)" → Run workflow → ação `testar`**. Deve terminar **verde** (todos os testes passam).
- [ ] **Publicar**: Run workflow de novo, ação `implantar`. Se pedir o modelo, deixe o padrão e depois confira na lista de modelos do **Workers AI** da Cloudflare se ele existe e atende bem em português (veja "Qualidade do português" no fim). Aguarde ficar verde. *(Esta publicação ainda não foi executada por mim; se falhar, mande-me o texto do erro.)*

### A5. Anotar o endereço da Lia
- [ ] Cloudflare → **Workers & Pages → lia**. O endereço é parecido com `https://lia.SEU-SUBDOMINIO.workers.dev`. Anote.
- [ ] **Teste**: abra no navegador `https://lia.SEU-SUBDOMINIO.workers.dev/webhook?hub.mode=subscribe&hub.verify_token=X&hub.challenge=123`. Deve aparecer **403** ("verificação falhou"). Isso é o certo: o endereço está no ar e protegido.

### A6. Segredos do Worker (os "cofres" da Lia)
Cloudflare → **Workers & Pages → lia → Settings → Variables and Secrets → Add → tipo *Secret***. Crie estes (cada um com o valor indicado):

| Nome | De onde vem |
|---|---|
| `WHATSAPP_APP_SECRET` | Meta for Developers → seu app → **Settings → Basic → App Secret** (o mesmo app que o ClassLink usa) |
| `WHATSAPP_VERIFY_TOKEN` | **Invente** uma frase longa e aleatória (20+ caracteres). Guarde: vai igual no GitHub (A4) e na Meta |
| `WHATSAPP_API_TOKEN` | Token **permanente** da Meta (ver B1) |
| `WHATSAPP_PHONE_NUMBER_ID` | **Fase B:** ID do Test Number. **Fase C:** ID do número público (ver B1) |
| `MCP_TOKEN` | Invente outra frase longa (serve para administrar a Lia pelo Claude) |
| `DONO_EMAIL` | Seu e-mail (o mesmo da etapa A7) |
| `ACCESS_TEAM_DOMAIN` | Da etapa A7, ex.: `seunome.cloudflareaccess.com` |
| `ACCESS_AUD` | Da etapa A7 (o *Application Audience (AUD) Tag*) |
| `TELEFONE_CLASSLINK` | `(21) 99286-5778` |
| `TELEFONES_IGNORADOS` | **Deixe vazio nos testes** (um número listado aqui é ignorado pela Lia, inclusive o seu). Depois do go-live, liste só números da equipe que escrevem para a escola e não devem ser atendidos pela Lia |

Depois de criar, **salve/implante** se a tela pedir. No GitHub, crie também os segredos `WHATSAPP_API_TOKEN` e `WHATSAPP_VERIFY_TOKEN` (mesmos valores), usados só para registrar o webhook.

### A7. Proteger o painel (Cloudflare Access)
O painel mostra conversas de famílias; só você pode abrir.

- [ ] Cloudflare → **Zero Trust** (se pedir, escolha um nome de equipe e o plano **Free**). O nome da equipe vira o `seunome.cloudflareaccess.com`.
- [ ] **Access controls → Applications → Add an application → Self-hosted**.
  - Application name: `Painel da Lia`.
  - Domínio: o endereço do A5 (`lia.SEU-SUBDOMINIO.workers.dev`) e **caminho `painel`** (ou `painel/*`). **O caminho é essencial:** não proteja o endereço inteiro, ou a Meta não conseguirá entregar as mensagens em `/webhook`.
  - Política: **Allow** → regra *Emails* → o seu e-mail. Método de login: **One-time PIN** (código por e-mail).
  - Salve e abra a aplicação de novo para copiar o **Application Audience (AUD) Tag**.
- [ ] Preencha `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` (A6).
- [ ] **Testes obrigatórios** (computador e celular):
  1. Abra `https://lia.SEU-SUBDOMINIO.workers.dev/painel/` → deve pedir seu e-mail, mandar um código e abrir o painel.
  2. Em uma janela anônima, abra o link de teste do A5 (`/webhook?hub.mode=…`) → deve continuar mostrando **403**, **sem pedir login**. Se pedir login, **pare e me avise**: o Access está cobrindo o webhook.
- [ ] **Se a Cloudflare não permitir proteger só o caminho `painel` no endereço `workers.dev`** (por exemplo, só oferecer proteger o endereço inteiro): **pare e me avise**. A solução é usar um domínio próprio ou eu trocar o jeito de login. Não habilite a proteção do endereço inteiro.

---

## Parte B — Teste com o Número de Teste da Meta (cerca de 45 min)

### B1. Juntar as informações na Meta
Em **developers.facebook.com → seu app → WhatsApp → API Setup** (ou *Configuração da API*):
- [ ] Anote o **ID do número de telefone** do **Test Number** e, separadamente, o do **(21) 96469-9441**. *(Não é o número em si, é um código; não confunda com o ID da conta do WhatsApp Business.)*
- [ ] **Token permanente**: Meta Business Suite → **Configurações → Usuários → Usuários do sistema → Adicionar** (permissão de administrador) → **Atribuir ativos** (seu app e a conta do WhatsApp) → **Gerar token** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`. Copie o token e coloque em `WHATSAPP_API_TOKEN` (A6 e GitHub). *(O token temporário da tela API Setup vale só 24 horas: não use.)*
- [ ] **Escolha de qual token vai para onde**: o ClassLink continua usando o que já tem; o da Lia pode ser este novo.

### B2. Apontar **só o Test Number** para a Lia
- [ ] No GitHub: **Actions → Run workflow → ação `definir-webhook`**, com `phone_number_id` = ID do Test Number e `url_do_worker` = `https://lia.SEU-SUBDOMINIO.workers.dev/webhook`. Deve terminar verde (a resposta mostra `"success": true`).
- [ ] No app da Meta, confira que o campo **messages** está assinado (WhatsApp → Configuration → Webhook fields). **Não altere o endereço principal do webhook do app**: ele é do ClassLink.
- [ ] `WHATSAPP_PHONE_NUMBER_ID` (A6) = ID do **Test Number**.

### B3. Roteiro de testes (do seu celular, para o Test Number)
Só quem está na lista de destinatários do Test Number consegue conversar com ele (você tem 1 de 5; adicione o seu número se ainda não estiver). Inicie a conversa pelo painel *API Setup* enviando a mensagem de teste, e depois responda como se fosse uma mãe. Marque cada item:

- [ ] "Qual o endereço da escola?" → responde o endereço (Rua Professor Carlos Nelson…, 658, Camboinhas).
- [ ] "Qual o horário de funcionamento?" → segunda a sexta, 7h às 19h.
- [ ] "Quero agendar uma visita" → oferece dias à tarde (13h–17h), sem inventar hora exata.
- [ ] "Qual o valor da mensalidade?" → diz que a secretaria apresenta os valores; **não inventa preço**.
- [ ] "Estou com a mensalidade atrasada" → **só** o acolhimento ("já avisei a equipe") e abre um **chamado** no painel, com rascunho.
- [ ] "Meu filho está com febre" → acolhimento + chamado de **prioridade alta**.
- [ ] Mande um **áudio** → pede para escrever.
- [ ] No painel (`/painel/`): você vê as conversas, os chamados e o contador "mensagens do mês". Teste a chave **"Lia ligada/desligada"**.

Se algo responder errado, **anote a mensagem exata e o que a Lia respondeu** e me envie. É assim que eu ajusto.

---

## Parte C — Número público (só depois de A e B aprovados)

### C1. Resolver a coexistência (decisão registrada em `agente-whatsapp/CANAL.md`)
O número público roda hoje no aplicativo, espelhado no seu computador. Para a **equipe continuar respondendo pelo aplicativo** e a Lia atender ao mesmo tempo, é preciso o modo **coexistência**. Pelo que li em fontes de terceiros (nada ainda da Meta):
- exige o app **WhatsApp Business** atualizado e abrir o app ao menos a cada 13 dias;
- é ativado por um fluxo próprio da Meta (conexão por QR code), e **ainda não sei se uma empresa pode fazê-lo sozinha ou se precisa de um parceiro oficial** (possível custo);
- os aparelhos "vinculados" costumam ser desconectados e o **WhatsApp para Windows pode não ser suportado**: use o celular ou o WhatsApp Web.

- [ ] **Não faça nada nessa etapa ainda.** Mande-me o que descobrir na Parte 0 e eu pesquiso a documentação oficial da Meta com você. Se a coexistência não for possível, decidimos entre: (B) o número fica só na API e a equipe responde por uma página no celular da escola; ou (C) a Lia usa outro número.

### C2. Virada (somente após C1 resolvido)
- [ ] Combine comigo um horário de **baixo movimento** e avise a equipe.
- [ ] `WHATSAPP_PHONE_NUMBER_ID` (A6) = ID do **número público**.
- [ ] GitHub: **Run workflow → `definir-webhook`** com o ID do número público.
- [ ] Na Meta, assine também o campo **`smb_message_echoes`** (coexistência), se disponível.
- [ ] **Teste final**: de um número seu que **não** seja da escola, escreva para (21) 96469-9441. Depois, **responda você mesma pelo aplicativo** e veja no painel a conversa mudar para "Equipe atendendo" e a Lia ficar em silêncio por 12 horas.
- [ ] Acompanhe o painel nas primeiras 48 horas.

### C3. Voltar atrás (se algo der errado)
1. No painel, desligue **"Lia ligada"** (ela para de responder na hora).
2. GitHub: Run workflow → **`remover-webhook`** com o ID do número (a Meta volta ao comportamento anterior).
3. Me avise.

---

## Custos para acompanhar
- **WhatsApp:** fontes de terceiros indicam que, desde 1/10/2026, as respostas passam a ser cobradas após 1.000 por mês (cerca de R$ 0,035 cada). **Confirme os valores na Meta** (WhatsApp Manager → *Insights* e *Cobranças aproximadas*, que você já vê). A Lia para de enviar ao atingir o limite configurado (`LIMITE_MENSAGENS_MES`, padrão 900).
- **Cloudflare:** plano gratuito. Confira em **Workers & Pages → Uso** se as requisições e a IA diária ficam dentro da cota.
- **Qualidade do português:** o modelo gratuito do Workers AI pode errar mais que o Claude. Se isso aparecer nos testes, a troca para o Claude Haiku 5.5 custa centavos por mês (cerca de US$ 0,50 para 1.000 respostas, estimativa) e é só configurar `PROVEDOR=claude`, `MODELO=claude-haiku-5-5` e `ANTHROPIC_API_KEY`. Eu aviso você antes.

## Opcional, depois: avisos no celular
O painel pode mandar um aviso quando a Lia passar um caso para a equipe. Exige gerar um par de chaves; faço com você numa próxima sessão, sem expor a chave privada.

## O que me enviar quando terminar cada parte
Capturas de tela (nunca tokens), as mensagens que a Lia errou no roteiro B3 e a resposta da etapa 0.1.

## Fontes consultadas
[Cloudflare — Access e One-time PIN](https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin), [Cloudflare — validar o JWT do Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Meta — override de webhook por número](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override/), [Meta — preços](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), [Meta — onboarding de usuários do app Business](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/) e guias de terceiros sobre webhook ([Webhook Relay](https://webhookrelay.com/blog/whatsapp-cloud-api-webhooks/)) e coexistência ([Kapso](https://kapso.ai/blog/whatsapp-business-app-coexistence-cloud-api)). Várias dessas páginas não puderam ser abertas diretamente nesta sessão; os detalhes de menus são o ponto mais sujeito a mudança.
