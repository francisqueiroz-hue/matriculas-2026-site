# Passo a passo — app Meta para publicar no Instagram da escola

Conta: @espacokidseinstitutofokus. Caminho recomendado: **API do Instagram com Login do Instagram** (não exige Página do Facebook; host `graph.instagram.com`). Alternativa: Login do Facebook (host `graph.facebook.com`, exige Página vinculada).

> **Aviso de fonte:** não consegui abrir a documentação da Meta diretamente nesta sessão (falha de DNS). Os itens abaixo vêm de resultados de busca que citam a documentação oficial. Os nomes das telas mudam com frequência: onde houver **[conferir]**, valide na tela e na documentação em <https://developers.facebook.com/docs/instagram-platform/>.

## Fase 1 — Preparar a conta
1. No Instagram, converta a conta da escola para **Profissional (Comercial)**: Configurações > Tipo de conta e ferramentas. Se já for, pule.
2. Ative a **verificação em duas etapas** na conta do Instagram e na conta do Facebook que será dona do app.
3. Defina **quem é o dono**: use uma conta de Facebook da escola/gestor (não a de um funcionário que pode sair). Anote o responsável e um substituto.

## Fase 2 — Criar o app
4. Acesse <https://developers.facebook.com/>, entre com a conta dona e conclua o cadastro de desenvolvedor (telefone e e-mail verificados).
5. **Meus apps > Criar app**. Tipo **Business** (a documentação indica app do tipo Business) [conferir o fluxo atual de "casos de uso"]. Nome sugerido: "Fokus Publicador". E-mail de contato da escola.
6. No painel do app, adicione o produto **Instagram** e escolha **API setup with Instagram login** (Configuração da API com login do Instagram).

## Fase 3 — Conectar a conta e gerar o token
7. Na mesma tela, em **Generate access tokens**, clique em **Add account** e autorize a conta @espacokidseinstitutofokus. Permissões necessárias: `instagram_business_basic` e `instagram_business_content_publish` (os nomes antigos foram descontinuados em 27/01/2025).
8. Clique em **Generate token** ao lado da conta. Esse token vale **60 dias**.
9. Para contas que **você mesmo possui ou gerencia e adicionou ao app**, o acesso padrão (Standard Access) basta; **App Review e Business Verification só entram** se o app for atender contas de terceiros (Advanced Access) [conferir na tela]. Para a escola, não deveriam ser necessários.

## Fase 4 — Guardar credenciais com segurança
10. O token equivale a uma **senha da conta**. Nunca coloque em arquivo, planilha, repositório, e-mail ou chat. Guarde em gerenciador de segredos (ou variáveis de ambiente do servidor).
11. Defina as variáveis: `IG_ACCESS_TOKEN`, `IG_USER_ID`, `IG_GRAPH_VERSION`, `IG_GRAPH_HOST=graph.instagram.com`.
12. Descubra o `IG_USER_ID` com uma consulta `GET https://graph.instagram.com/<versão>/me?fields=user_id,username&access_token=<token>` [conferir o campo na documentação]. Use a versão da API que aparece na documentação vigente.
13. **Renovação:** o token longo pode ser renovado antes de vencer pelo endpoint `refresh_access_token` do host `graph.instagram.com` (mais 60 dias) [conferir parâmetros e a idade mínima do token]. Crie um lembrete de calendário **a cada 45 dias**. Token vencido = publicações falham.

## Fase 5 — Mídia
14. O Instagram busca a mídia em uma **URL pública https** na hora de publicar. Hospede em armazenamento próprio (por exemplo, Cloud Storage/Firebase do ClassLink ou outro bucket) com link público ou assinado de validade longa o bastante.
15. Especificações (confirmar na documentação): imagens JPEG; Reels e Stories em vídeo MP4/MOV (H.264 com áudio AAC), proporção 9:16 para Reels/Stories, 4:5 a 1,91:1 para feed [conferir limites de tamanho e duração].

## Fase 6 — Testar antes de ligar
16. Faça o **primeiro teste em conta profissional de homologação** (perfil de teste, de preferência privado), não na da escola.
17. Rode `python3 publish.py fila.json --dry-run` com a fila de exemplo: confirma leitura e regras de aprovação.
18. Aprove **um** item de texto simples e rode `python3 publish.py fila.json --max 1`. Confira o post no Instagram, depois apague.
19. Teste Reels e Story, que têm processamento de vídeo e exigências próprias. Teste carrossel.
20. Só então aponte para a conta da escola e repita com **um** item.

## Fase 7 — Agendar a execução
21. Rode `publish.py` a cada 15 minutos em um servidor/cron seu (ou um agendador do seu provedor). A fila (`fila.json`) deve ficar em local acessível a quem **aprova** e ao script. O script grava `publicado` ou `erro` no arquivo.
22. O Claude pode **gerar a fila do dia** (skill `escola-instagram-studio`) e a equipe aprova; o agendamento de rotinas do Claude **não publica sozinho**.

## Fase 8 — Governança (checklist antes de ligar)
- [ ] Dono do app e substituto definidos; 2FA ativo.
- [ ] Token só em segredo/variável de ambiente; revisado que não está no Git (`.gitleaks.toml` do projeto ajuda).
- [ ] Lembrete de renovação a cada 45 dias.
- [ ] Aprovação humana obrigatória (status `aprovado` + `aprovado_por`).
- [ ] Checklist de risco da skill aplicado (criança, promessa, dado pessoal, trend).
- [ ] Teste de homologação documentado; primeiro dia com `--max 1`.
- [ ] Plano de parada: como pausar (desligar o agendador) e revogar o token (remover a conta do app).

## Problemas comuns [conferir códigos na documentação]
| Sintoma | Causa provável | Ação |
|---|---|---|
| Erro de token inválido (código 190) | Token vencido/revogado | Gerar ou renovar o token |
| Mídia não disponível ao publicar | Vídeo ainda em processamento | O script espera o status `FINISHED`; aumente a espera |
| Falha ao baixar a mídia | URL não pública ou expirada | Corrigir o link |
| Limite de publicações | Cota diária da conta | Conferir `content_publishing_limit`; o script para sozinho |
| Formato rejeitado | Proporção/codec | Reexportar conforme especificação |

## Integrações com o que já existe
O publicador **não toca** em Gmail, no Vigia Processual nem no Painel. Ele só lê `fila.json`. A rotina "Fokus Captação" continua responsável por métricas, briefing e plano; a skill `escola-instagram-studio` transforma isso em peças e fila.
