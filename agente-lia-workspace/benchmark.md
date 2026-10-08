# Economia de tokens da skill agente-lia (medição estática; sem A/B com subagentes)

Para poupar custo, **não** rodei o ciclo completo do skill-creator (subagentes com/sem skill). O que foi medido:

| O que uma sessão futura precisa carregar | Palavras |
|---|---|
| Sem skill: especificação + plano (para entender regras e onde mexer) | ≈ 6.700 |
| Com skill: descrição (sempre no contexto) | ≈ 90 |
| Com skill: SKILL.md (ao disparar) | ≈ 470 |
| Com skill: references/arquitetura.md (só se precisar) | ≈ 150 |

Ordem de grandeza: ≈ 10–14× menos contexto inicial para tarefas comuns (adicionar item à base, mudar triagem, rodar testes). É uma **estimativa**, não um ganho medido em execução.

Verificado: os caminhos e comandos citados na skill existem (`npm test`, `npm run typecheck`, `npm run semear`, `npm run gerar:painel`, arquivos em `src/`, `conhecimento/`, `painel/`, `CANAL.md`, `README.md`).

Próximo passo opcional (custa tokens): rodar os 3 prompts de `evals/evals.json` com e sem a skill, comparar acerto e tokens, e otimizar a descrição com o `run_loop` do skill-creator.
