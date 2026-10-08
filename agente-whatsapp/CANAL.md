# Canal do WhatsApp — decisão e pendências (Task 0 do plano)

Estado informado pelo responsável em 2026-10-08:
- **Público** (21) 96469-9441: app WhatsApp Business no celular da escola, espelhado no computador e no celular do dono; listado no WhatsApp Manager (conta "Espaço Kids e Instituto Fokus", que exibe o selo **"IA ativa"**) junto de um *Test Number* (+1 555-669-1138).
- **Interno** (21) 99286-5778: ClassLink, em outra conta de mesmo nome. Aparece na página pública de matrículas como o número do comando "ACESSO" — ou seja, famílias já o conhecem.

## O que NÃO foi confirmado em fonte oficial da Meta (verificar antes de qualquer teste com famílias)
1. O que é o selo **"IA ativa"** e se ele responde clientes automaticamente. Se for IA da própria Meta no número público, ela concorre com a Lia e escapa da triagem: desligar ou decidir adotar.
2. Se o número público já está em coexistência, só no app, ou na Cloud API. Fontes de terceiros dizem que a coexistência exige o app **WhatsApp Business**, onboarding por fluxo próprio (Embedded Signup), app aberto ao menos a cada 13 dias, e que um número já só-API talvez precise ser reintegrado.
3. Se a empresa pode fazer o onboarding de coexistência **sozinha** ou precisa de um Tech Provider/BSP (possível custo).
4. Quais dispositivos vinculados continuam funcionando (fontes citam que o WhatsApp para Windows não é suportado e que os vinculados são desconectados no onboarding) e se respostas digitadas neles geram o evento `smb_message_echoes`.
5. Preço das mensagens de serviço no Brasil após 01/10/2026 (fontes de terceiros: 1.000 grátis/mês e ≈ R$0,035 depois).
6. Nome e formato oficiais do campo de eco, e se o *override* de webhook por número cobre `smb_message_echoes`.

## Decisão (preencher)
- [ ] **A) Coexistência** — equipe e dono respondem pelo app; Lia pausa pelo eco.
- [ ] **B) Plano B** — número só na API; equipe responde por uma página no celular da escola (acrescentar `POST /painel/api/conversas/:telefone/responder` com `enviarTexto` + `assumir` e um segundo acesso no Cloudflare Access). Perde o app nesse número.
- [ ] **C)** Outro número para a Lia.

Registrar aqui a data, a fonte oficial consultada e quem decidiu.
