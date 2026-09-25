# Fokus Estudo: assistente do estudante (uso interno)

Site de estudos para alunos do 6º ao 9º ano. Funciona **sem internet e sem instalar nada**.

## Como abrir no computador

1. Baixe ou copie a pasta `estudante/` inteira para o computador (ou pen drive).
2. Dê dois cliques em `index.html`. O site abre no navegador (Chrome, Edge ou Firefox).
3. Para facilitar, crie um atalho do `index.html` na área de trabalho.

> O progresso de cada aluno (XP, flashcards, conversas) fica salvo **só no navegador daquele computador**.
> Em computadores compartilhados, use o botão **Progresso → Apagar meus dados** ao terminar.

## O que tem

| Seção | O que faz |
|---|---|
| **Tira-dúvidas** | Resolve passo a passo: expressões numéricas (com frações exatas), porcentagem, equações do 1º e 2º grau, MMC, MDC, fatoração e números primos. Também explica cerca de 30 conceitos de Matemática, Português, Ciências, História, Geografia e Inglês. |
| **Quiz** | 52 questões de 6 matérias, com correção e explicação na hora. As questões erradas viram flashcards com um clique. |
| **Flashcards** | Revisão espaçada em 5 caixas: 1, 2, 4, 7 e 15 dias. |
| **Foco** | Pomodoro com tempo de foco ajustável, pausa curta e pausa longa a cada 4 ciclos. |
| **Progresso** | XP, nível, dias seguidos, minutos de foco e acertos por matéria. |

## Como adicionar conteúdo

Edite `js/dados.js`:
- **Questões:** `{ p: 'pergunta', o: ['certa', 'errada', 'errada', 'errada'], c: 0, e: 'explicação' }`. As alternativas são embaralhadas automaticamente.
- **Conceitos:** informe os `termos` em minúsculas e sem acento. É por eles que a pergunta do aluno é reconhecida.

## Testes

```bash
node --test estudante/tests/*.test.js
```

## Limitações

- O tira-dúvidas **não usa IA generativa**: resolve os tipos de conta listados acima e explica os conceitos cadastrados. Para outras perguntas, orienta o aluno a procurar o professor.
- Não lê fotos de exercícios.
- Esta pasta **não é publicada** pelo GitHub Pages: o workflow publica apenas `site/`.
