/*
 * Conteúdo pedagógico (Ensino Fundamental — anos finais).
 * Para acrescentar questões, basta seguir o mesmo formato:
 *   { p: 'pergunta', o: ['A', 'B', 'C', 'D'], c: índice da correta (0 a 3), e: 'explicação' }
 */
(function (root) {
  'use strict';

  const MATERIAS = {
    matematica: { nome: 'Matemática', icone: '➗', cor: '#6b2a86' },
    portugues: { nome: 'Português', icone: '📖', cor: '#c2410c' },
    ciencias: { nome: 'Ciências', icone: '🔬', cor: '#15803d' },
    historia: { nome: 'História', icone: '🏛️', cor: '#a16207' },
    geografia: { nome: 'Geografia', icone: '🌎', cor: '#0369a1' },
    ingles: { nome: 'Inglês', icone: '🇬🇧', cor: '#be123c' },
  };

  const QUESTOES = {
    matematica: [
      { p: 'Qual é o valor de 2³ + 4²?', o: ['24', '14', '20', '28'], c: 0, e: '2³ = 8 e 4² = 16. Logo, 8 + 16 = 24.' },
      { p: 'Qual é a solução de 3x − 7 = 11?', o: ['x = 6', 'x = 4', 'x = 18', 'x = 1,33'], c: 0, e: '3x = 11 + 7 = 18, então x = 18 ÷ 3 = 6.' },
      { p: 'Quanto é 25% de 80?', o: ['20', '25', '32', '40'], c: 0, e: '25% = 1/4. Um quarto de 80 é 20.' },
      { p: 'Um retângulo mede 7 cm por 4 cm. Qual é a sua área?', o: ['28 cm²', '22 cm²', '11 cm²', '56 cm²'], c: 0, e: 'Área do retângulo = base × altura = 7 × 4 = 28 cm². (22 cm seria o perímetro.)' },
      { p: 'Qual é o MMC de 6 e 8?', o: ['24', '48', '2', '14'], c: 0, e: '6 = 2 × 3 e 8 = 2³. MMC = 2³ × 3 = 24.' },
      { p: 'Quanto vale a soma dos ângulos internos de qualquer triângulo?', o: ['180°', '90°', '360°', '270°'], c: 0, e: 'Em todo triângulo, os três ângulos internos somam 180°.' },
      { p: 'Qual fração é equivalente a 3/4?', o: ['9/12', '6/9', '4/3', '3/8'], c: 0, e: 'Multiplicando numerador e denominador por 3: 3/4 = 9/12.' },
      { p: 'Os catetos de um triângulo retângulo medem 6 e 8. Quanto mede a hipotenusa?', o: ['10', '14', '12', '48'], c: 0, e: 'Pitágoras: h² = 6² + 8² = 36 + 64 = 100, então h = 10.' },
      { p: 'Qual é a raiz quadrada de 144?', o: ['12', '14', '72', '11'], c: 0, e: '12 × 12 = 144.' },
      { p: 'Qual é o resultado de (−3) × (−5)?', o: ['15', '−15', '−8', '8'], c: 0, e: 'Sinais iguais na multiplicação dão resultado positivo: (−3) × (−5) = 15.' },
    ],
    portugues: [
      { p: 'Qual destas palavras é um substantivo próprio?', o: ['Brasília', 'cidade', 'alegria', 'livro'], c: 0, e: 'Substantivo próprio nomeia um ser específico e é escrito com inicial maiúscula.' },
      { p: 'Em “O menino correu rapidamente”, a palavra “rapidamente” é:', o: ['advérbio', 'adjetivo', 'verbo', 'substantivo'], c: 0, e: 'Indica o modo como a ação aconteceu, por isso é advérbio de modo.' },
      { p: 'Qual é o plural de “cidadão”?', o: ['cidadãos', 'cidadões', 'cidadães', 'cidadãs'], c: 0, e: 'O plural correto é “cidadãos”.' },
      { p: 'Em qual frase o sujeito está oculto (desinencial)?', o: ['Fomos ao cinema ontem.', 'Choveu muito ontem.', 'Os alunos chegaram cedo.', 'Ana e Pedro estudam juntos.'], c: 0, e: 'Em “Fomos”, a terminação do verbo indica o sujeito “nós”, que não aparece escrito. “Choveu” é oração sem sujeito.' },
      { p: 'Qual destas palavras é oxítona?', o: ['café', 'mesa', 'lâmpada', 'caderno'], c: 0, e: 'Oxítona tem a sílaba tônica na última sílaba: ca-FÉ.' },
      { p: 'Em “Seus olhos são duas estrelas”, há qual figura de linguagem?', o: ['Metáfora', 'Hipérbole', 'Onomatopeia', 'Pleonasmo'], c: 0, e: 'É uma comparação implícita, sem “como”: metáfora.' },
      { p: 'Qual é um sinônimo de “efêmero”?', o: ['passageiro', 'eterno', 'enorme', 'antigo'], c: 0, e: 'Efêmero é aquilo que dura pouco, passageiro.' },
      { p: 'Qual palavra está escrita corretamente?', o: ['exceção', 'excessão', 'esceção', 'exeção'], c: 0, e: 'A grafia correta é “exceção”.' },
      { p: 'Em “A menina estudiosa passou na prova”, “estudiosa” é:', o: ['adjetivo', 'advérbio', 'pronome', 'verbo'], c: 0, e: 'Atribui uma característica ao substantivo “menina”, então é adjetivo.' },
    ],
    ciencias: [
      { p: 'Qual organela é responsável pela respiração celular?', o: ['Mitocôndria', 'Ribossomo', 'Núcleo', 'Vacúolo'], c: 0, e: 'A mitocôndria transforma a energia da glicose em energia utilizável pela célula.' },
      { p: 'Na fotossíntese, as plantas produzem:', o: ['glicose e oxigênio', 'gás carbônico e água', 'apenas água', 'nitrogênio'], c: 0, e: 'Com luz, água e gás carbônico, a planta produz glicose e libera oxigênio.' },
      { p: 'A passagem do estado sólido para o líquido chama-se:', o: ['fusão', 'solidificação', 'condensação', 'sublimação'], c: 0, e: 'Fusão: sólido → líquido (ex.: gelo derretendo).' },
      { p: 'Qual é o maior órgão do corpo humano?', o: ['Pele', 'Fígado', 'Coração', 'Pulmão'], c: 0, e: 'A pele é o maior órgão, protegendo todo o corpo.' },
      { p: 'Qual é o planeta mais próximo do Sol?', o: ['Mercúrio', 'Vênus', 'Terra', 'Marte'], c: 0, e: 'A ordem a partir do Sol começa por Mercúrio, Vênus, Terra e Marte.' },
      { p: 'Qual é o símbolo químico do sódio?', o: ['Na', 'So', 'S', 'Sd'], c: 0, e: 'Na vem do latim “natrium”.' },
      { p: 'Qual destas é uma fonte de energia renovável?', o: ['Solar', 'Petróleo', 'Carvão mineral', 'Gás natural'], c: 0, e: 'A energia do Sol se renova continuamente; os combustíveis fósseis não.' },
      { p: 'Qual é a unidade básica dos seres vivos?', o: ['Célula', 'Átomo', 'Tecido', 'Órgão'], c: 0, e: 'Todos os seres vivos são formados por uma ou mais células.' },
      { p: 'Qual sistema do corpo humano transporta o sangue?', o: ['Cardiovascular', 'Digestório', 'Respiratório', 'Nervoso'], c: 0, e: 'Coração e vasos sanguíneos formam o sistema cardiovascular (circulatório).' },
    ],
    historia: [
      { p: 'Em que ano foi proclamada a Independência do Brasil?', o: ['1822', '1500', '1889', '1888'], c: 0, e: 'Em 7 de setembro de 1822, por D. Pedro I.' },
      { p: 'Qual lei aboliu a escravidão no Brasil em 1888?', o: ['Lei Áurea', 'Lei do Ventre Livre', 'Lei Eusébio de Queirós', 'Lei dos Sexagenários'], c: 0, e: 'A Lei Áurea foi assinada pela princesa Isabel em 13 de maio de 1888.' },
      { p: 'Qual foi a primeira capital do Brasil?', o: ['Salvador', 'Rio de Janeiro', 'Brasília', 'São Paulo'], c: 0, e: 'Salvador foi a capital de 1549 até 1763.' },
      { p: 'Em que ano começou a Revolução Francesa?', o: ['1789', '1822', '1914', '1500'], c: 0, e: 'Começou em 1789, com a Queda da Bastilha.' },
      { p: 'Quem foi o primeiro presidente do Brasil?', o: ['Deodoro da Fonseca', 'Getúlio Vargas', 'Floriano Peixoto', 'D. Pedro II'], c: 0, e: 'Marechal Deodoro da Fonseca, após a Proclamação da República.' },
      { p: 'Qual civilização construiu as pirâmides de Gizé?', o: ['Egípcia', 'Romana', 'Grega', 'Asteca'], c: 0, e: 'Foram construídas pelos antigos egípcios, às margens do rio Nilo.' },
      { p: 'Entre 1964 e 1985, o Brasil viveu qual período?', o: ['Ditadura militar', 'Império', 'República Velha', 'Período colonial'], c: 0, e: 'Foi o período do regime militar, encerrado com a redemocratização.' },
      { p: 'Em que ano foi proclamada a República no Brasil?', o: ['1889', '1822', '1930', '1888'], c: 0, e: 'Em 15 de novembro de 1889.' },
    ],
    geografia: [
      { p: 'Qual é o maior país da América do Sul em área?', o: ['Brasil', 'Argentina', 'Peru', 'Colômbia'], c: 0, e: 'O Brasil ocupa quase metade do território sul-americano.' },
      { p: 'Qual linha imaginária divide a Terra em hemisférios Norte e Sul?', o: ['Equador', 'Meridiano de Greenwich', 'Trópico de Capricórnio', 'Círculo Polar Ártico'], c: 0, e: 'A Linha do Equador separa os hemisférios Norte e Sul.' },
      { p: 'Qual bioma predomina no semiárido nordestino?', o: ['Caatinga', 'Pampa', 'Mata Atlântica', 'Pantanal'], c: 0, e: 'A Caatinga é exclusiva do Brasil e adaptada ao clima seco.' },
      { p: 'Qual é a capital da Argentina?', o: ['Buenos Aires', 'Santiago', 'Montevidéu', 'Lima'], c: 0, e: 'Buenos Aires é a capital argentina.' },
      { p: 'Qual é o maior oceano do planeta?', o: ['Pacífico', 'Atlântico', 'Índico', 'Ártico'], c: 0, e: 'O Pacífico é o maior e mais profundo.' },
      { p: 'Em quantas grandes regiões o IBGE divide o Brasil?', o: ['5', '4', '6', '7'], c: 0, e: 'Norte, Nordeste, Centro-Oeste, Sudeste e Sul.' },
      { p: 'Qual movimento da Terra causa a sucessão dos dias e das noites?', o: ['Rotação', 'Translação', 'Precessão', 'Revolução'], c: 0, e: 'Rotação é o giro da Terra em torno de si mesma, em cerca de 24 horas.' },
      { p: 'Qual é o rio com maior volume de água do mundo?', o: ['Amazonas', 'Nilo', 'São Francisco', 'Mississippi'], c: 0, e: 'O Amazonas é o rio mais volumoso do planeta.' },
    ],
    ingles: [
      { p: 'Complete: “She ___ a student.”', o: ['is', 'are', 'am', 'be'], c: 0, e: 'Com he/she/it, o verbo to be no presente é “is”.' },
      { p: 'O que significa “library”?', o: ['biblioteca', 'livraria', 'laboratório', 'liberdade'], c: 0, e: 'É um “falso cognato”: library = biblioteca; livraria = bookstore.' },
      { p: 'Qual é o passado de “go”?', o: ['went', 'goed', 'gone', 'goes'], c: 0, e: '“Go” é irregular: go → went → gone.' },
      { p: 'Qual é o oposto de “cold”?', o: ['hot', 'cool', 'cloud', 'old'], c: 0, e: 'Cold = frio; hot = quente.' },
      { p: 'O que significa “What time is it?”', o: ['Que horas são?', 'Que dia é hoje?', 'Quanto tempo falta?', 'Qual é o seu nome?'], c: 0, e: 'É a forma de perguntar as horas.' },
      { p: 'Que dia vem depois de “Monday”?', o: ['Tuesday', 'Sunday', 'Thursday', 'Friday'], c: 0, e: 'Monday (segunda) → Tuesday (terça).' },
      { p: 'Complete: “I have ___ apple.”', o: ['an', 'a', 'the', 'some'], c: 0, e: 'Usa-se “an” antes de palavras que começam com som de vogal: an apple.' },
      { p: 'Qual é o plural de “child”?', o: ['children', 'childs', 'childes', 'childrens'], c: 0, e: '“Child” tem plural irregular: children.' },
    ],
  };

  // Base de conceitos para perguntas em texto. "termos" sem acento e em minúsculas.
  const CONCEITOS = [
    { m: 'matematica', t: 'Fração', termos: ['fracao', 'fracoes', 'numerador', 'denominador'], x: 'Fração representa partes de um todo dividido em partes iguais. O denominador (embaixo) diz em quantas partes o todo foi dividido; o numerador (em cima), quantas partes foram tomadas.', ex: 'Em 3/4, o todo foi dividido em 4 partes e tomamos 3. Experimente: 1/2 + 1/3' },
    { m: 'matematica', t: 'Porcentagem', termos: ['porcentagem', 'percentual', 'por cento', 'desconto'], x: 'Porcentagem é uma fração com denominador 100. Para calcular x% de um valor, multiplique o valor por x e divida por 100.', ex: '20% de 150 = 150 × 20 ÷ 100 = 30. Experimente: 20% de 150' },
    { m: 'matematica', t: 'Equação do 1º grau', termos: ['equacao', 'primeiro grau', '1 grau', 'incognita'], x: 'É uma igualdade com uma incógnita (normalmente x) de expoente 1. Para resolver, isolamos o x: termos com x de um lado, números do outro, e quem muda de lado troca a operação.', ex: '2x + 3 = 11 → 2x = 8 → x = 4. Experimente: 2x + 3 = 11' },
    { m: 'matematica', t: 'Equação do 2º grau e Bhaskara', termos: ['segundo grau', '2 grau', 'bhaskara', 'delta', 'quadratica'], x: 'Tem a forma ax² + bx + c = 0 (com a ≠ 0). Calculamos Δ = b² − 4ac. Se Δ > 0 há duas raízes reais; se Δ = 0, uma raiz dupla; se Δ < 0, nenhuma raiz real. As raízes são x = (−b ± √Δ) ÷ 2a.', ex: 'Experimente: x² − 5x + 6 = 0' },
    { m: 'matematica', t: 'Teorema de Pitágoras', termos: ['pitagoras', 'hipotenusa', 'cateto', 'triangulo retangulo'], x: 'Em todo triângulo retângulo, o quadrado da hipotenusa (lado oposto ao ângulo reto) é igual à soma dos quadrados dos catetos: a² = b² + c².', ex: 'Catetos 3 e 4: a² = 9 + 16 = 25 → a = 5. Experimente: √(3² + 4²)' },
    { m: 'matematica', t: 'MMC — mínimo múltiplo comum', termos: ['mmc', 'minimo multiplo', 'multiplo comum'], x: 'É o menor número (diferente de zero) que é múltiplo de todos os números dados. Muito usado para somar frações com denominadores diferentes.', ex: 'Experimente: mmc 12 18' },
    { m: 'matematica', t: 'MDC — máximo divisor comum', termos: ['mdc', 'maximo divisor', 'divisor comum'], x: 'É o maior número que divide todos os números dados sem deixar resto. Muito usado para simplificar frações.', ex: 'Experimente: mdc 24 36' },
    { m: 'matematica', t: 'Área e perímetro', termos: ['area', 'perimetro'], x: 'Perímetro é a soma das medidas dos lados (o contorno). Área é a medida da superfície. Retângulo: área = base × altura. Triângulo: área = base × altura ÷ 2. Círculo: área = π × r².', ex: 'Quadrado de lado 5: perímetro 20, área 25.' },
    { m: 'matematica', t: 'Números primos', termos: ['primo', 'primos', 'numero primo'], x: 'Um número primo é maior que 1 e tem exatamente dois divisores: 1 e ele mesmo. Os primeiros são 2, 3, 5, 7, 11, 13...', ex: 'Experimente: 97 é primo?' },
    { m: 'ciencias', t: 'Fotossíntese', termos: ['fotossintese', 'clorofila', 'cloroplasto'], x: 'Processo em que plantas, algas e algumas bactérias usam a energia da luz para transformar gás carbônico e água em glicose (alimento), liberando oxigênio. Acontece nos cloroplastos, que contêm clorofila.', ex: 'gás carbônico + água + luz → glicose + oxigênio' },
    { m: 'ciencias', t: 'Célula', termos: ['celula', 'celulas', 'procarionte', 'eucarionte'], x: 'Unidade básica dos seres vivos. Células procariontes não têm núcleo organizado (bactérias); eucariontes têm núcleo (animais, plantas, fungos). Partes principais: membrana, citoplasma e material genético.', ex: 'A célula vegetal tem parede celular e cloroplastos; a animal, não.' },
    { m: 'ciencias', t: 'Mitocôndria', termos: ['mitocondria', 'respiracao celular'], x: 'Organela que realiza a respiração celular: usa glicose e oxigênio para liberar a energia de que a célula precisa, produzindo gás carbônico e água.', ex: 'Células musculares têm muitas mitocôndrias.' },
    { m: 'ciencias', t: 'Sistema Solar', termos: ['sistema solar', 'planetas', 'planeta'], x: 'É formado pelo Sol e pelos corpos que giram ao seu redor. Os oito planetas, em ordem: Mercúrio, Vênus, Terra, Marte, Júpiter, Saturno, Urano e Netuno.', ex: 'Júpiter é o maior planeta; Mercúrio, o menor.' },
    { m: 'ciencias', t: 'Ciclo da água', termos: ['ciclo da agua', 'evaporacao', 'condensacao', 'precipitacao'], x: 'A água circula no planeta: evapora com o calor do Sol, condensa formando nuvens, precipita como chuva e escoa ou infiltra no solo, voltando a rios e mares.', ex: 'Evaporação → condensação → precipitação → escoamento/infiltração.' },
    { m: 'ciencias', t: 'Estados físicos da matéria', termos: ['estados fisicos', 'fusao', 'solidificacao', 'sublimacao', 'vaporizacao'], x: 'Os principais estados são sólido, líquido e gasoso. Mudanças: fusão (sólido→líquido), solidificação (líquido→sólido), vaporização (líquido→gasoso), condensação (gasoso→líquido) e sublimação (sólido→gasoso).', ex: 'Gelo derretendo é fusão.' },
    { m: 'portugues', t: 'Substantivo', termos: ['substantivo', 'substantivos'], x: 'Palavra que dá nome a seres, objetos, lugares, sentimentos e ideias. Pode ser comum (casa) ou próprio (Brasil), concreto (mesa) ou abstrato (saudade).', ex: '“A alegria tomou conta da escola.” — alegria e escola são substantivos.' },
    { m: 'portugues', t: 'Verbo', termos: ['verbo', 'verbos', 'conjugacao'], x: 'Palavra que indica ação, estado ou fenômeno da natureza e varia em pessoa, número, tempo e modo.', ex: 'correr (ação), estar (estado), chover (fenômeno).' },
    { m: 'portugues', t: 'Adjetivo', termos: ['adjetivo', 'adjetivos'], x: 'Palavra que caracteriza o substantivo, indicando qualidade, estado ou aspecto.', ex: '“Livro interessante”, “dia ensolarado”.' },
    { m: 'portugues', t: 'Advérbio', termos: ['adverbio', 'adverbios'], x: 'Palavra que modifica o verbo, o adjetivo ou outro advérbio, indicando circunstâncias como tempo, lugar, modo, intensidade, negação e dúvida.', ex: '“Ela chegou cedo.” (tempo) — “Falou calmamente.” (modo)' },
    { m: 'portugues', t: 'Sujeito e predicado', termos: ['sujeito', 'predicado', 'oracao'], x: 'Sujeito é o termo sobre o qual se declara algo; predicado é o que se declara sobre o sujeito. O sujeito pode ser simples, composto, oculto (desinencial) ou indeterminado, e há orações sem sujeito.', ex: '“Os alunos | estudaram para a prova.” — sujeito | predicado.' },
    { m: 'portugues', t: 'Figuras de linguagem', termos: ['figura de linguagem', 'figuras de linguagem', 'metafora', 'comparacao', 'hiperbole', 'personificacao'], x: 'Recursos que dão mais expressividade ao texto. Comparação usa “como”; metáfora compara sem conectivo; hipérbole exagera; personificação dá características humanas a seres não humanos.', ex: 'Metáfora: “Você é o sol da minha vida.” Hipérbole: “Chorei rios de lágrimas.”' },
    { m: 'portugues', t: 'Acentuação: oxítonas, paroxítonas e proparoxítonas', termos: ['oxitona', 'paroxitona', 'proparoxitona', 'silaba tonica', 'acentuacao'], x: 'Classificam as palavras pela posição da sílaba tônica: última (oxítona: café), penúltima (paroxítona: mesa) e antepenúltima (proparoxítona: lâmpada). Todas as proparoxítonas são acentuadas.', ex: 'sa-BÃO (oxítona), ca-DER-no (paroxítona), MÉ-di-co (proparoxítona).' },
    { m: 'historia', t: 'Independência do Brasil', termos: ['independencia', 'dom pedro', '1822'], x: 'Proclamada em 7 de setembro de 1822 por D. Pedro I, rompendo os laços políticos com Portugal. O Brasil tornou-se um império.', ex: 'O episódio é conhecido como “Grito do Ipiranga”.' },
    { m: 'historia', t: 'Revolução Francesa', termos: ['revolucao francesa', 'bastilha', '1789'], x: 'Iniciada em 1789, derrubou a monarquia absolutista na França e difundiu os ideais de “liberdade, igualdade e fraternidade”, influenciando o mundo ocidental.', ex: 'Marco inicial: Queda da Bastilha, 14 de julho de 1789.' },
    { m: 'historia', t: 'Abolição da escravidão', termos: ['abolicao', 'escravidao', 'lei aurea'], x: 'A escravidão foi abolida no Brasil pela Lei Áurea, em 13 de maio de 1888. Foi o último país das Américas a abolir, e os libertos não receberam apoio para se integrar à sociedade.', ex: 'Leis anteriores: Eusébio de Queirós (1850), Ventre Livre (1871) e Sexagenários (1885).' },
    { m: 'geografia', t: 'Biomas brasileiros', termos: ['bioma', 'biomas', 'caatinga', 'cerrado', 'pantanal', 'amazonia', 'mata atlantica', 'pampa'], x: 'O Brasil tem seis biomas: Amazônia, Cerrado, Mata Atlântica, Caatinga, Pantanal e Pampa. Cada um tem clima, vegetação e fauna característicos.', ex: 'A Caatinga só existe no Brasil.' },
    { m: 'geografia', t: 'Rotação e translação', termos: ['rotacao', 'translacao', 'estacoes do ano', 'dia e noite'], x: 'Rotação é o giro da Terra em torno do próprio eixo (cerca de 24 horas) e causa os dias e as noites. Translação é a volta da Terra ao redor do Sol (cerca de 365 dias) e, com a inclinação do eixo, causa as estações do ano.', ex: 'A cada 4 anos o ano tem 366 dias (bissexto).' },
    { m: 'geografia', t: 'Regiões do Brasil', termos: ['regioes', 'regiao', 'ibge'], x: 'O IBGE divide o Brasil em cinco regiões: Norte, Nordeste, Centro-Oeste, Sudeste e Sul.', ex: 'A região Norte é a maior em área; a Sudeste, a mais populosa.' },
    { m: 'ingles', t: 'Verb to be', termos: ['verb to be', 'to be', 'verbo to be'], x: 'Significa “ser” ou “estar”. No presente: I am; you/we/they are; he/she/it is.', ex: 'I am a student. She is happy. They are at school.' },
    { m: 'ingles', t: 'Simple present', termos: ['simple present', 'presente simples'], x: 'Usado para hábitos e verdades gerais. Com he/she/it, o verbo ganha -s ou -es. Negativa e pergunta usam do/does.', ex: 'She plays soccer. Does he like pizza? I do not (don’t) eat meat.' },
    { m: 'ingles', t: 'Simple past', termos: ['simple past', 'passado simples', 'verbos irregulares'], x: 'Usado para ações concluídas no passado. Verbos regulares ganham -ed (play → played); os irregulares têm forma própria (go → went, see → saw).', ex: 'I visited my grandmother yesterday. We went to the beach.' },
  ];

  // Cartões de exemplo criados no primeiro acesso
  const FLASH_INICIAIS = [
    { m: 'matematica', f: 'Fórmula de Bhaskara', v: 'x = (−b ± √Δ) ÷ 2a, com Δ = b² − 4ac' },
    { m: 'matematica', f: 'Área do triângulo', v: 'base × altura ÷ 2' },
    { m: 'ciencias', f: 'O que a mitocôndria faz?', v: 'Respiração celular: libera energia da glicose.' },
    { m: 'historia', f: 'Proclamação da República', v: '15 de novembro de 1889' },
    { m: 'ingles', f: 'library', v: 'biblioteca (livraria = bookstore)' },
    { m: 'portugues', f: 'Proparoxítona', v: 'Sílaba tônica na antepenúltima; sempre acentuada (ex.: lâmpada).' },
  ];

  const api = { MATERIAS: MATERIAS, QUESTOES: QUESTOES, CONCEITOS: CONCEITOS, FLASH_INICIAIS: FLASH_INICIAIS };
  root.Dados = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
