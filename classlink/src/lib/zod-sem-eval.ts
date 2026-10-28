import { z } from "zod";


/**
 * O Zod testa `new Function("")` para decidir se usa o modo compilado (mais rápido). Com a CSP
 * sem 'unsafe-eval', o teste é barrado — ele trata o erro e segue no modo normal, mas o
 * navegador registra uma violação de CSP a cada tela que valida dados. `jitless` pula o teste.
 * Importe este módulo (efeito colateral) em quem usa Zod no navegador.
 */
z.config({ jitless: true });
