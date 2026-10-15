---
name: juridico-prazos-prescricao
description: "Calcula e confere prazos processuais e materiais: contagem de prazos no CPC (dias úteis), CLT, CPP e juizados, prazo em dobro, feriados, suspensões e recesso, intimação e publicação, prazos recursais, prescrição e decadência (civil, consumidor, trabalhista, tributário, penal), causas de interrupção e suspensão, e agenda de prazos fatais. Use quando o usuário informar data de intimação, publicação, fato ou ato e pedir o prazo final, quando precisar saber se a pretensão prescreveu, ou montar controle de prazos do caso."
---

# Prazos, prescrição e decadência

**Risco máximo: erro de prazo é falha fatal.** Esta skill calcula, mas sempre **mostra o raciocínio** e manda conferir no calendário oficial do tribunal e nos autos. Nunca afirmar prazo "de memória" como definitivo.

## Dados necessários (se faltar, pergunte)
Rito/área (cível, trabalhista, penal, juizado, administrativo), ato (decisão, sentença, acórdão, citação), **data da disponibilização e da publicação/intimação** (ou da juntada do mandado/AR, ou da ciência), tribunal/comarca, parte (Fazenda, Defensoria, MP têm regras próprias), se há prazo comum ou litisconsórcio com advogados diferentes.

## Regras base (conferir vigência e norma local)
- **CPC**: prazos em **dias úteis** (art. 219); exclui o dia do começo e inclui o do vencimento (art. 224); início no primeiro dia útil seguinte à intimação/publicação; comuns recursos em regra 15 dias úteis, embargos de declaração 5 dias úteis; Fazenda Pública e MP em dobro, Defensoria prazo em dobro [conferir arts.]. Suspensão do recesso forense de 20/12 a 20/01 (art. 220).
- **CLT**: dias úteis (art. 775, após a Lei 13.467/2017); recurso ordinário e agravo de petição em regra 8 dias; embargos de declaração 5 dias; verificar contagem local [conferir].
- **CPP**: prazos **contínuos** (não por dias úteis), com regras próprias de início e prorrogação para dia útil quando o vencimento cair em dia sem expediente [conferir].
- **Juizados**: normas próprias (Lei 9.099/1995) e contagem conforme legislação aplicável [conferir].
- **Feriados**: nacionais, estaduais, municipais e do tribunal (ex.: ponto facultativo e suspensões por portaria); validar no calendário oficial do órgão. Feriado local deve ser comprovado quando exigido (STJ).

## Prescrição e decadência
Método: (1) identificar a **pretensão** e o termo inicial (actio nata ou ciência), (2) o **prazo** (CC arts. 205 e 206; CDC arts. 26 e 27; CF art. 7º, XXIX e CLT; CTN arts. 173 e 174; CP art. 109 e seguintes), (3) causas **impeditivas, suspensivas e interruptivas** (CC arts. 197 a 204; citação válida, protesto, reconhecimento do débito), (4) conclusão com data limite. Exemplos de partida (conferir): cobrança de dívida líquida em instrumento, 5 anos (CC, art. 206, §5º, I); reparação civil, 3 anos (CC, art. 206, §3º, V); fato do produto ou serviço (consumo), 5 anos (CDC, art. 27); trabalhista, bienal após extinção e quinquenal retroativa (CF, art. 7º, XXIX). Prescrição **intercorrente** e prazos especiais exigem pesquisa específica.

## Saída
Tabela: ato → data-base → regra aplicada (artigo) → exclusões (feriados, suspensões) → **prazo final** → folga recomendada (protocolar 1–2 dias antes) → quem confere. Para prescrição: linha do tempo com termo inicial, interrupções e **cenários** (prescrita / não prescrita / controvertida) com a razão. Alerta em destaque se faltar menos de 5 dias úteis.

## Limites
Não substitui o controle de prazos do escritório nem o sistema do tribunal. Se o dado de entrada for incerto (data de ciência), calcule o cenário **mais restritivo** como prazo de segurança e explique.
