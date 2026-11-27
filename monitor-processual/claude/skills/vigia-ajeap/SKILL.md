---
name: vigia-ajeap
description: Executa a análise jurídica AJEAP dos processos do painel Vigia Processual e redige RASCUNHOS de minutas (manifestação, contestação, recurso, embargos, petição simples, parecer) quando há andamento, intimação ou prazo novo. Use SEMPRE que Francis ou uma rotina mencionar "rodar AJEAP", "analisar processo", "processo com novidade", "intimação", "prazo correndo", "fila de análise", "redigir/minutar manifestação, contestação ou recurso", "rascunho de peça" ou "Vigia Processual", mesmo que a skill não seja citada pelo nome. Nunca protocola, assina nem envia nada.
---

# Vigia + AJEAP: análise estratégica e rascunhos

O monitor processual (no computador) coleta andamentos, intimações e calcula prazos. O painel **Vigia Processual** (artefato do claude.ai, coleção `processos`) guarda um documento por processo. Esta skill é o elo que roda **no Claude**: decide o que precisa de análise, executa o protocolo AJEAP, grava o resultado no painel e redige o rascunho da peça que o advogado vai revisar.

## Regras que não mudam (e o porquê)

1. **Nunca protocolar, assinar, enviar e-mail/mensagem ou fazer login em PJe/tribunais.** O sistema prepara; a decisão e o ato são do advogado. Um erro aqui não se desfaz.
2. **Toda minuta é RASCUNHO**: título iniciado por "RASCUNHO", cabeçalho "NÃO PROTOCOLAR — rascunho para revisão" e status `RASCUNHO` no painel. Peça pronta demais convida a protocolar sem conferir os autos.
3. **Sigilo profissional/LGPD.** Dados de processos ficam no painel e em documentos privados do Claude. Nas buscas na web use **só a tese jurídica e o tribunal**, nunca nomes de partes nem número de processo.
4. **Zero invenção.** Fato, data, prazo ou precedente que você não confirmou não entra. Informação essencial ausente → a análise se limita a `perguntasNecessarias` (o protocolo AJEAP proíbe forçar conclusão). Uma citação errada é um ponto fraco do caso, não um detalhe.
5. **Escrita no painel sempre com `if_version`**, nunca apagando processos. Conflito de versão → releia o documento e refaça a alteração sobre a versão nova.

## Passo a passo

### 1. Montar a fila
- Se Francis pediu um processo específico, use só ele.
- Senão: carregue `ArtifactData` (`ToolSearch` com `select:ArtifactData`), liste a coleção `processos` do artefato `https://claude.ai/artifact/CJkkzgBy5nuUwrhsCC3Cd6` e aplique os **gatilhos** de `references/gatilhos.md` (sem análise, prazo em risco, andamento ou intimação posterior à última análise, análise antiga com prazo aberto). Sem motivo concreto, não reanalise: gasta tempo e sobrescreve o que está bom.
- Ordene pelo **prazo mais próximo** e processe no máximo **5 por execução**; o resto fica para a próxima (diga quais ficaram).

### 2. Reunir só o necessário
Use os campos do documento do painel (partes, tribunal, tipo, fase, `eventos`, `ultimaMov*`, `datajud`, `prazo` e seus avisos). Quando o retrato do monitor trouxer textos de intimação, use-os truncados. Não puxe e-mails inteiros nem dados que a análise não use.

### 3. Rodar a AJEAP
Carregue a skill `ajeap` e siga as 8 etapas, na ordem. Pontos que costumam falhar:
- **Prazo correndo (dias, não semanas) → alerta em destaque ANTES do resumo.** Confira se o prazo veio do cálculo do monitor e leia os avisos dele (tribunal sem calendário, dia com ressalva, ano sem ato cadastrado): se o vencimento depende disso, diga.
- **Verifique cada precedente** (existência e tese) com busca; o que não confirmar, diga que não confirmou. PJe/TRT1/TJRJ costumam bloquear acesso automatizado: registre isso, não invente movimentação.
- **Três cenários sempre** (favorável, mais provável, desfavorável), nunca um número isolado.
- **Vetor Temporal Estratégico**: diga se a medida é postergar ou acelerar e por quê.
- Encerre com a ressalva de validação por advogado(a) com registro ativo na OAB.

### 4. Gravar a análise no painel
`ArtifactData` → `update` em `processos/<id>` com `if_version`:

| Campo | Conteúdo |
|---|---|
| `ajeap` | bloco da análise (formato em `references/contrato-painel.md`) |
| `ajeapAtualizadoEm` | data/hora ISO da análise |
| `ajeapGatilho` | lista dos códigos de motivo |
| `ajeapHistorico` | resumo da análise anterior (máx. 5 itens), antes de sobrescrever |
| `urgente` / `urgenteDescricao` | `true` **só** se o prazo for claramente do lado de Francis/cliente; na dúvida `false` e registre a incerteza no texto |

Confira o bloco antes de gravar: `resumoCaso` e ressalva presentes; `baseLegal`, pontos fortes e fracos preenchidos; os três cenários; `planoAcao` com `passo` e `prazo`; `fontes` quando citou precedente. (O mesmo critério está implementado e testado em `core/vigia_analise.py`, função `validar_ajeap`.)

### 5. Decidir se há minuta
Redija rascunho quando o plano de ação da análise exigir **manifestação processual com prazo** (contestar, manifestar-se sobre documentos/laudo, embargos, recurso, petição de cumprimento) e os fatos essenciais estiverem nos dados. Se faltar fato, **não redija**: liste o que falta em `perguntasNecessarias`. Não redija o que não tem prazo nem pedido de Francis.

### 6. Redigir o rascunho
Siga `references/modelo-minuta.md` (estrutura por tipo, marcadores `[CONFIRMAR NOS AUTOS]`, lista de conferência). Crie o documento no Claude Docs (conector `Claude_Docs`; carregue o guia do conector antes) com o título `RASCUNHO — <tipo> — <nº CNJ>`, privado. Depois registre no painel o campo `minutas` com título, tipo, link `https://`, `status: "RASCUNHO"`, `geradoEm` e `prazoRelacionado`. **Plano B** (sem a ferramenta de Docs, comum em rotinas agendadas): grave o texto Markdown no campo `texto` do próprio item de `minutas` (máx. 30.000 caracteres, começando pelo cabeçalho "RASCUNHO — NÃO PROTOCOLAR") com `link` apontando para o painel (`…/CJkkzgBy5nuUwrhsCC3Cd6#minutas`). Nunca descarte o rascunho em silêncio.

### 7. Fechar
Resposta curta (até 6 linhas): 🔴 prazos urgentes primeiro, o que foi analisado (CNJ e motivo), minutas geradas (com link) e o que ficou na fila. Diga sempre o que **não** foi possível confirmar.

## Se algo falhar
- `ArtifactData` indisponível: não improvise outro destino; entregue a análise na resposta e avise.
- Conflito de versão: releia, reaplique só a sua alteração, grave de novo.
- Processo com número inválido ou duplicado: não grave; relate para decisão de Francis.
