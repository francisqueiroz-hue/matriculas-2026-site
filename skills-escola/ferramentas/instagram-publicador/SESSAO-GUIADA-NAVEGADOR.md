# Sessão guiada: o Claude opera o console da Meta no seu computador

Objetivo: o Claude conduzir, na sua tela, as partes mecânicas da criação do app Meta (developers.facebook.com), enquanto **você** faz o que é pessoal e sensível. É opcional: o passo a passo manual (`PASSO-A-PASSO-APP-META.md`) continua válido.

> **Aviso de fonte:** estas instruções vêm das regras internas das ferramentas de navegador e de uso do computador do Claude, que li nesta sessão. Os caminhos de menu do aplicativo podem mudar com atualizações; confirme na tela do seu Claude. Não testei esta sessão no seu computador.

## 1. Escolha a ferramenta

| Opção | O que é | Quando usar |
|---|---|---|
| **A. Navegador embutido do aplicativo Claude (recomendada)** | Painel de navegador dentro do aplicativo Claude para computador. Você vê tudo e pode assumir a qualquer momento. Mantém seus logins entre sessões | Console da Meta, passo a passo à vista |
| **B. Claude no Chrome (extensão)** | Extensão que age no seu Chrome real, em abas novas, com os seus logins | Se você já está logado na Meta no Chrome e prefere usá-lo |
| **C. Controle do computador** | Capturas de tela e cliques no desktop | Só para aplicativos nativos. **Não use para sites**; navegadores ficam em modo somente leitura nesse modo |

## 2. Preparar (uma vez)
1. Tenha o **aplicativo Claude para computador (Windows)** instalado e com a sua conta logada. A sua conta já tem um computador vinculado ("Claude Desktop (Windows)").
2. Opção B: instale e conecte a extensão **Claude no Chrome** e mantenha o Chrome aberto.
3. Para uma sessão na nuvem (por exemplo, o claude.ai no navegador): na tela de conversa, o menu **+** deve oferecer **Dispositivos**; escolha o seu computador **antes de enviar a primeira mensagem**. O aplicativo precisa estar **aberto e online**.
4. Opção A: o painel do navegador abre com **Ctrl+Shift+B** (ou pelo ícone de globo/Navegador no painel lateral). Ele precisa estar **visível**, para você acompanhar.
5. Se o Claude pedir, **aprove os sites** (developers.facebook.com e facebook.com). Você pode recusar qualquer site.

## 3. Quem faz o quê

| Etapa | Quem | Observação |
|---|---|---|
| Fazer login no Facebook/Meta, senha, 2FA, captcha | **Você** | O Claude não digita senha nem códigos |
| Aceitar termos de desenvolvedor e verificações de identidade | **Você** | Ato pessoal |
| Criar o app, escolher tipo Business, nome, e-mail de contato | Claude, com sua conferência | Você confirma antes de "Criar" |
| Adicionar produto Instagram e abrir "API setup with Instagram login" | Claude | |
| Autorizar a conta @espacokidseinstitutofokus (tela de consentimento do Instagram) | **Você** | Exige o login da conta |
| **Gerar e copiar o token** | **Você, com o painel do Claude fechado ou em outra aba que o Claude não veja** | **O token aparece na tela. Se o Claude fizer captura, ele o enxerga. Trate como senha** |
| Guardar o token em segredo/variável de ambiente | **Você** | Nunca no chat, em arquivo ou repositório |
| Anotar nomes de telas, permissões e erros | Claude | Sem copiar token |

Regras que o Claude segue: avisar antes de ações que abrem caixas de confirmação; parar e perguntar após 2 ou 3 falhas seguidas; não sair do assunto; não clicar em links suspeitos; não mexer em dinheiro (nenhuma cobrança ou anúncio nesta sessão).

## 4. Roteiro da sessão
1. Abra o painel do navegador (Opção A) com a conta Meta já logada **por você**.
2. Cole o pedido da seção 5 na conversa.
3. O Claude pede acesso ao navegador/site; **você aprova**.
4. Ele navega, descreve o que vê e executa as etapas dele; nas suas etapas, ele **para e avisa**.
5. Quando for gerar o token: **feche ou oculte o painel**, gere e copie o token, guarde no segredo, e só então volte e diga "token guardado". Não cole o token na conversa.
6. O Claude resume o que foi feito (nome do app, permissões, telas) e atualiza o guia com as diferenças encontradas.
7. Ao terminar, ele **fecha as abas que abriu**.

## 5. Pedido para colar no Claude
> Vamos configurar o app Meta para o publicador de Instagram da escola, seguindo o `PASSO-A-PASSO-APP-META.md`. Use o navegador embutido (ou Claude no Chrome). Eu já estou logado. Você cuida de criar o app (tipo Business, nome "Fokus Publicador"), adicionar o produto Instagram com "API setup with Instagram login" e conferir as permissões `instagram_business_basic` e `instagram_business_content_publish`. **Pare antes de autorizar a conta e antes de gerar o token: essas etapas são minhas.** Nunca peça, leia, digite ou repita senhas, códigos 2FA ou o token. Não clique em nada que gere cobrança ou anúncio. Descreva o que vê em cada tela e anote as diferenças em relação ao guia.

## 6. Segurança e privacidade
- Tela compartilhada = tela vista. Qualquer informação visível pode ser capturada pelo Claude; por isso o token e a senha são sempre etapas suas, fora da visão.
- A sessão usa **os seus logins**; o Claude não deve sair de contas nem alterar credenciais.
- Depois de terminar, revise a lista de aplicativos conectados da conta Meta e remova o que não reconhecer.
- Em caso de dúvida, interrompa a sessão, feche o painel e continue manualmente pelo guia.

## 7. Se não funcionar
| Sintoma | Provável causa | O que fazer |
|---|---|---|
| Claude diz que o navegador está offline | Aplicativo fechado ou sem internet | Abra o aplicativo Claude e tente de novo |
| Painel do navegador não aparece | Outro conteúdo ocupa o painel lateral | Ctrl+Shift+B ou feche o que estiver aberto |
| Site "não permitido" | Falta aprovação | Aprove o site quando o pedido aparecer |
| Janela de confirmação trava o navegador | Caixa modal do site | Feche-a manualmente |
| Sem opção **Dispositivos** | Recurso indisponível na sua conta/versão | Use o passo a passo manual |
