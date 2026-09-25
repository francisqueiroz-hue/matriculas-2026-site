// Testes do motor do Tutor. Rodar com: node --test estudante/tests
const test = require('node:test');
const assert = require('node:assert');
const { solve } = require('../js/tutor.js');

const ans = (q) => { const r = solve(q); assert.ok(r && r.ok, q + ' → ' + JSON.stringify(r)); return r.resposta; };

test('expressões numéricas', () => {
  assert.strictEqual(ans('2 + 3 * 4'), '14');
  assert.strictEqual(ans('(2 + 3) * 4'), '20');
  assert.strictEqual(ans('2^3 + 4²'), '24');
  assert.strictEqual(ans('10 ÷ 4'), '5/2 = 2,5');
  assert.strictEqual(ans('1/2 + 1/3'), '5/6 ≈ 0,833333');
  assert.strictEqual(ans('-3^2'), '-9');
  assert.strictEqual(ans('(-3)^2'), '9');
  assert.strictEqual(ans('2^-1'), '1/2 = 0,5');
  assert.strictEqual(ans('√144'), '12');
  assert.strictEqual(ans('raiz quadrada de 81'), '9');
  assert.strictEqual(ans('√2'), '≈ 1,414214');
  assert.strictEqual(ans('2,5 × 4'), '10');
  assert.strictEqual(ans('0,1 + 0,2'), '3/10 = 0,3');
  assert.strictEqual(ans('Quanto é 7 x 8?'.replace('x', '×')), '56');
  assert.strictEqual(ans('2(3+4)'), '14');
  assert.strictEqual(ans('50%'), '1/2 = 0,5');
});

test('porcentagem', () => {
  assert.strictEqual(ans('25% de 80'), '25% de 80 = 20');
  assert.strictEqual(ans('12,5% de 200'), '25/2% de 200 = 25');
  assert.strictEqual(ans('15% de 30'), '15% de 30 = 9/2 = 4,5');
});

test('equação 1º grau', () => {
  assert.strictEqual(ans('3x - 7 = 11'), 'x = 6');
  assert.strictEqual(ans('3x + 5 = 2x + 9'), 'x = 4');
  assert.strictEqual(ans('2(x + 1) = 3x - 4'), 'x = 6');
  assert.strictEqual(ans('x/2 + 1 = 4'), 'x = 6');
  assert.strictEqual(ans('3x = 2'), 'x = 2/3 ≈ 0,666667');
  assert.strictEqual(ans('resolva 5x + 10 = 0'), 'x = -2');
  assert.match(ans('x + 1 = x + 1'), /infinitas/);
  assert.match(ans('x + 1 = x + 2'), /sem solução/);
});

test('equação 2º grau', () => {
  assert.strictEqual(ans('x² - 5x + 6 = 0'), 'x₁ = 3  e  x₂ = 2');
  assert.strictEqual(ans('x^2 = 9'), 'x₁ = 3  e  x₂ = -3');
  assert.strictEqual(ans('x² - 4x + 4 = 0'), 'x = 2');
  assert.match(ans('x² + 1 = 0'), /Não há solução real/);
  assert.strictEqual(ans('2x² - 3x + 1 = 0'), 'x₁ = 1  e  x₂ = 1/2 = 0,5');
  assert.strictEqual(ans('(x+1)(x-1) = 0'), 'x₁ = 1  e  x₂ = -1');
  assert.strictEqual(ans('x² - 2 = 0'), 'x₁ ≈ 1,414214  e  x₂ ≈ -1,414214');
});

test('expressão algébrica', () => {
  assert.strictEqual(ans('2x + 3x'), '5x');
  assert.strictEqual(ans('(x+1)^2'), 'x² + 2x + 1');
});

test('MMC, MDC, fatoração e primos', () => {
  assert.strictEqual(ans('mmc 12 18'), 'MMC(12, 18) = 36');
  assert.strictEqual(ans('mmc(6,8)'), 'MMC(6, 8) = 24');
  assert.strictEqual(ans('mdc de 12 e 18'), 'MDC(12, 18) = 6');
  assert.strictEqual(ans('mdc 8 15'), 'MDC(8, 15) = 1');
  assert.strictEqual(ans('mmc 4, 6 e 10'), 'MMC(4, 6, 10) = 60');
  assert.strictEqual(ans('fatorar 360'), '360 = 2³ × 3² × 5');
  assert.strictEqual(ans('97 é primo?'), '97 é primo.');
  assert.strictEqual(ans('91 é primo'), '91 não é primo: é divisível por 7.');
});

test('erros amigáveis e texto comum', () => {
  assert.strictEqual(solve('O que é fotossíntese?'), null);
  assert.strictEqual(solve('xadrez'), null);
  assert.strictEqual(solve('olá'), null);
  assert.match(solve('1/0').erro, /zero/);
  assert.match(solve('(2+3').erro, /parêntese/);
  assert.match(solve('√-4').erro, /negativo/);
  assert.match(solve('x^3 = 8').erro, /2º grau/);
  assert.match(solve('1/x = 2').erro, /denominador/);
});
