/*
 * Motor do Tutor — resolve contas passo a passo, sem internet.
 * Suporta: expressões numéricas (com frações exatas), porcentagem,
 * equações de 1º e 2º grau em x, simplificação de expressões com x,
 * MMC, MDC, fatoração em primos e teste de número primo.
 *
 * API: Tutor.solve(texto) →
 *   null                                  (não é uma pergunta de matemática)
 *   { ok: true, tipo, passos: [], resposta }
 *   { ok: false, erro }
 */
(function (root) {
  'use strict';

  // ---------- Números: frações exatas quando possível ----------
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }
  function R(v) {
    if (!isFinite(v)) throw new Error('O resultado não é um número definido.');
    return { exact: false, v: v };
  }
  function F(n, d) {
    if (d === undefined) d = 1;
    if (d === 0) throw new Error('Divisão por zero não é definida.');
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1;
    n = n / g; d = d / g;
    if (n === 0) n = 0; // remove -0
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || Math.abs(n) > 1e12 || d > 1e12) return R(n / d);
    return { exact: true, n: n, d: d };
  }
  function fromDecimal(s) {
    if (s.indexOf('.') === -1) {
      const n = Number(s);
      return Number.isSafeInteger(n) ? F(n) : R(n);
    }
    const parts = s.split('.');
    const k = parts[1].length;
    if (k > 9) return R(Number(s));
    return F(Number((parts[0] || '0') + parts[1]), Math.pow(10, k));
  }
  const val = (x) => (x.exact ? x.n / x.d : x.v);
  const isZero = (x) => (x.exact ? x.n === 0 : Math.abs(x.v) < 1e-12);
  const isOne = (x) => (x.exact ? x.n === 1 && x.d === 1 : Math.abs(x.v - 1) < 1e-12);
  const both = (a, b) => a.exact && b.exact;

  function add(a, b) { return both(a, b) ? F(a.n * b.d + b.n * a.d, a.d * b.d) : R(val(a) + val(b)); }
  function sub(a, b) { return both(a, b) ? F(a.n * b.d - b.n * a.d, a.d * b.d) : R(val(a) - val(b)); }
  function mul(a, b) { return both(a, b) ? F(a.n * b.n, a.d * b.d) : R(val(a) * val(b)); }
  function div(a, b) {
    if (isZero(b)) throw new Error('Divisão por zero não é definida.');
    return both(a, b) ? F(a.n * b.d, a.d * b.n) : R(val(a) / val(b));
  }
  function neg(a) { return a.exact ? F(-a.n, a.d) : R(-a.v); }
  function pow(a, b) {
    if (a.exact && b.exact && b.d === 1 && Math.abs(b.n) <= 30) {
      if (b.n < 0 && isZero(a)) throw new Error('Divisão por zero não é definida.');
      let r = F(1);
      for (let i = 0; i < Math.abs(b.n); i++) r = mul(r, a);
      return b.n < 0 ? div(F(1), r) : r;
    }
    const v = Math.pow(val(a), val(b));
    if (isNaN(v)) throw new Error('Essa potência não tem resultado real.');
    return R(v);
  }
  function isqrt(n) {
    if (n < 0) return -1;
    const r = Math.round(Math.sqrt(n));
    return r * r === n ? r : -1;
  }
  function sqrt(a) {
    if (val(a) < 0) throw new Error('Não existe raiz quadrada real de número negativo.');
    if (a.exact) {
      const rn = isqrt(a.n), rd = isqrt(a.d);
      if (rn >= 0 && rd >= 0) return F(rn, rd);
    }
    return R(Math.sqrt(val(a)));
  }

  function fmtNumber(v) {
    const r = Math.round(v * 1e6) / 1e6;
    return String(r === 0 ? 0 : r).replace('.', ',');
  }
  function fmt(x) {
    if (x.exact) return x.d === 1 ? String(x.n) : x.n + '/' + x.d;
    return fmtNumber(x.v);
  }
  // Resultado final: fração + decimal aproximado quando fizer sentido
  function fmtFinal(x) {
    if (x.exact && x.d !== 1) {
      const dec = fmtNumber(x.n / x.d);
      const exato = (x.n / x.d).toString().replace('.', ',') === dec;
      return fmt(x) + (exato ? ' = ' : ' ≈ ') + dec;
    }
    return x.exact ? fmt(x) : '≈ ' + fmt(x);
  }
  // "x = 2/3 ≈ 0,67" ou "x ≈ 1,41" quando o valor não é exato
  function igual(nome, x) {
    return nome + (x.exact ? ' = ' + fmtFinal(x) : ' ≈ ' + fmt(x));
  }
  // Parênteses em operandos negativos e em frações dentro de ×, ÷ e ^
  function p(x, op) {
    const s = fmt(x);
    if (val(x) < 0) return '(' + s + ')';
    if (x.exact && x.d !== 1 && (op === '*' || op === '/' || op === '^')) return '(' + s + ')';
    return s;
  }
  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' };
  const OPS = { '+': add, '-': sub, '*': mul, '/': div, '^': pow };

  // ---------- Leitura do texto ----------
  function normalize(s) {
    return s.toLowerCase()
      .replace(/[×·∙]/g, '*').replace(/[÷:]/g, '/').replace(/[−–—]/g, '-')
      .replace(/²/g, '^2').replace(/³/g, '^3')
      .replace(/raiz\s+quadrada(\s+de)?/g, '√').replace(/raiz(\s+de)?|sqrt/g, '√')
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/\s+/g, ' ').trim();
  }

  function tokenize(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if (/[\d.]/.test(c)) {
        const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
        if (!m) throw new Error('Número mal escrito perto de "' + s.slice(i, i + 5) + '".');
        let num = m[0];
        if (num.endsWith('.')) num = num.slice(0, -1);
        out.push({ k: 'num', s: num });
        i += m[0].length;
        continue;
      }
      if (c === 'x') { out.push({ k: 'x' }); i++; continue; }
      if ('+-*/^()=%√'.indexOf(c) !== -1) { out.push({ k: 'op', s: c }); i++; continue; }
      throw new Error('Não entendi o símbolo "' + c + '". Use só números, x e + − × ÷ ^ ( ) = %.');
    }
    return out;
  }

  function parse(tokens) {
    let i = 0;
    const peek = () => tokens[i];
    const isOp = (s) => tokens[i] && tokens[i].k === 'op' && tokens[i].s === s;
    const startsPrimary = (t) => t && (t.k === 'num' || t.k === 'x' || (t.k === 'op' && (t.s === '(' || t.s === '√')));

    function expr() {
      let n = term();
      while (isOp('+') || isOp('-')) {
        const op = tokens[i++].s;
        n = { t: 'bin', op: op, l: n, r: term() };
      }
      return n;
    }
    function term() {
      let n = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) {
          const op = tokens[i++].s;
          n = { t: 'bin', op: op, l: n, r: unary() };
        } else if (startsPrimary(peek())) {
          n = { t: 'bin', op: '*', l: n, r: power() }; // multiplicação implícita: 2x, 3(x+1)
        } else break;
      }
      return n;
    }
    function unary() {
      if (isOp('-')) { i++; return { t: 'neg', e: unary() }; }
      if (isOp('+')) { i++; return unary(); }
      return power();
    }
    function power() {
      const b = postfix();
      if (isOp('^')) { i++; return { t: 'bin', op: '^', l: b, r: unary() }; }
      return b;
    }
    function postfix() {
      let n = primary();
      while (isOp('%')) { i++; n = { t: 'pct', e: n }; }
      return n;
    }
    function primary() {
      const t = tokens[i];
      if (!t) throw new Error('A conta parece incompleta. Confira o final.');
      if (t.k === 'num') { i++; return { t: 'num', v: fromDecimal(t.s) }; }
      if (t.k === 'x') { i++; return { t: 'x' }; }
      if (isOp('(')) {
        i++;
        const e = expr();
        if (!isOp(')')) throw new Error('Falta fechar um parêntese ")".');
        i++;
        return e;
      }
      if (isOp('√')) { i++; return { t: 'sqrt', e: isOp('-') ? unary() : primary() }; }
      throw new Error('Não entendi a conta perto de "' + (t.s || t.k) + '".');
    }

    const tree = expr();
    if (i < tokens.length) {
      const t = tokens[i];
      throw new Error(t.s === ')' ? 'Há um parêntese ")" sobrando.' : 'Não entendi a conta perto de "' + (t.s || t.k) + '".');
    }
    return tree;
  }

  function hasX(n) {
    if (!n) return false;
    if (n.t === 'x') return true;
    return hasX(n.e) || hasX(n.l) || hasX(n.r);
  }

  // ---------- Cálculo numérico com passos ----------
  function evalNum(n, steps) {
    switch (n.t) {
      case 'num': return n.v;
      case 'neg': return neg(evalNum(n.e, steps));
      case 'pct': {
        const a = evalNum(n.e, steps);
        const r = div(a, F(100));
        steps.push(fmt(a) + '% = ' + fmt(a) + ' ÷ 100 = ' + fmt(r));
        return r;
      }
      case 'sqrt': {
        const a = evalNum(n.e, steps);
        const r = sqrt(a);
        steps.push('√' + p(a) + ' = ' + fmt(r) + (r.exact ? '' : ' (aproximado)'));
        return r;
      }
      case 'bin': {
        const a = evalNum(n.l, steps), b = evalNum(n.r, steps);
        const r = OPS[n.op](a, b);
        steps.push(p(a, n.op) + ' ' + SYM[n.op] + ' ' + p(b, n.op) + ' = ' + fmt(r));
        return r;
      }
    }
    throw new Error('Expressão inválida.');
  }

  // ---------- Polinômios em x (coeficientes do grau 0 para cima) ----------
  function trim(P) {
    const c = P.slice();
    while (c.length > 1 && isZero(c[c.length - 1])) c.pop();
    return c;
  }
  const coef = (P, k) => P[k] || F(0);
  function padd(A, B) { const n = Math.max(A.length, B.length), r = []; for (let k = 0; k < n; k++) r.push(add(coef(A, k), coef(B, k))); return trim(r); }
  function psub(A, B) { const n = Math.max(A.length, B.length), r = []; for (let k = 0; k < n; k++) r.push(sub(coef(A, k), coef(B, k))); return trim(r); }
  function pmul(A, B) {
    const r = [];
    for (let k = 0; k < A.length + B.length - 1; k++) r.push(F(0));
    for (let a = 0; a < A.length; a++) for (let b = 0; b < B.length; b++) r[a + b] = add(r[a + b], mul(A[a], B[b]));
    return trim(r);
  }
  const deg = (P) => (P.length === 1 && isZero(P[0]) ? -1 : P.length - 1);

  function poly(n) {
    switch (n.t) {
      case 'num': return [n.v];
      case 'x': return [F(0), F(1)];
      case 'neg': return poly(n.e).map(neg);
      case 'pct': return poly(n.e).map((c) => div(c, F(100)));
      case 'sqrt': {
        const P = poly(n.e);
        if (P.length > 1) throw new Error('Por enquanto não resolvo equações com x dentro da raiz.');
        return [sqrt(P[0])];
      }
      case 'bin': {
        const A = poly(n.l), B = poly(n.r);
        if (n.op === '+') return padd(A, B);
        if (n.op === '-') return psub(A, B);
        if (n.op === '*') return pmul(A, B);
        if (n.op === '/') {
          if (B.length > 1) throw new Error('Por enquanto não resolvo equações com x no denominador.');
          return trim(A.map((c) => div(c, B[0])));
        }
        if (n.op === '^') {
          if (B.length > 1) throw new Error('Por enquanto não resolvo equações com x no expoente.');
          const e = B[0];
          if (!e.exact || e.d !== 1 || e.n < 0 || e.n > 6) {
            if (A.length === 1) return [pow(A[0], e)];
            throw new Error('Com x, uso apenas expoentes inteiros de 0 a 6.');
          }
          let r = [F(1)];
          for (let k = 0; k < e.n; k++) r = pmul(r, A);
          return r;
        }
      }
    }
    throw new Error('Expressão inválida.');
  }
  function peval(P, x) {
    let r = F(0);
    for (let k = P.length - 1; k >= 0; k--) r = add(mul(r, x), P[k]);
    return r;
  }
  const SUP = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' };
  function polyStr(P) {
    const parts = [];
    for (let k = P.length - 1; k >= 0; k--) {
      const c = P[k];
      if (isZero(c)) continue;
      const negative = val(c) < 0;
      const a = negative ? neg(c) : c;
      const v = k === 0 ? '' : k === 1 ? 'x' : 'x' + (SUP[k] || '^' + k);
      let cs = k > 0 && isOne(a) ? '' : fmt(a);
      if (k > 0 && a.exact && a.d !== 1) cs = '(' + cs + ')';
      parts.push({ negative: negative, s: cs + v });
    }
    if (!parts.length) return '0';
    return parts.map((t, i) => (i === 0 ? (t.negative ? '−' : '') + t.s : (t.negative ? ' − ' : ' + ') + t.s)).join('');
  }

  // ---------- Equações ----------
  function solveEquation(Ln, Rn) {
    const passos = [];
    const L = poly(Ln), Rp = poly(Rn);
    passos.push('Simplificando cada lado: ' + polyStr(L) + ' = ' + polyStr(Rp));
    const D = psub(L, Rp);
    const g = deg(D);

    if (g <= 0) {
      if (g === -1) {
        passos.push('Os dois lados são sempre iguais.');
        return { ok: true, tipo: 'Equação', passos: passos, resposta: hasX(Ln) || hasX(Rn) ? 'Qualquer valor de x serve (infinitas soluções).' : 'A igualdade é verdadeira.' };
      }
      passos.push('Os dois lados nunca ficam iguais: sobra ' + fmt(D[0]) + ' ≠ 0.');
      return { ok: true, tipo: 'Equação', passos: passos, resposta: hasX(Ln) || hasX(Rn) ? 'Não existe valor de x que resolva (sem solução).' : 'A igualdade é falsa.' };
    }

    if (g === 1) {
      const a = sub(coef(L, 1), coef(Rp, 1));
      const b = sub(coef(Rp, 0), coef(L, 0));
      passos.push('Termos com x de um lado, números do outro (quem muda de lado troca o sinal): ' + polyStr([F(0), a]) + ' = ' + fmt(b));
      const x = div(b, a);
      if (!isOne(a)) passos.push('Dividindo os dois lados por ' + p(a) + ': x = ' + fmt(b) + ' ÷ ' + p(a, '/') + ' = ' + fmt(x));
      passos.push('Verificação: substituindo x = ' + fmt(x) + ', o lado esquerdo dá ' + fmt(peval(L, x)) + ' e o direito dá ' + fmt(peval(Rp, x)) + ' ✔');
      return { ok: true, tipo: 'Equação do 1º grau', passos: passos, resposta: igual('x', x) };
    }

    if (g === 2) {
      const a = D[2], b = coef(D, 1), c = coef(D, 0);
      passos.push('Passando tudo para o lado esquerdo: ' + polyStr(D) + ' = 0');
      passos.push('Coeficientes: a = ' + fmt(a) + ', b = ' + fmt(b) + ', c = ' + fmt(c));
      const delta = sub(mul(b, b), mul(F(4), mul(a, c)));
      passos.push('Δ = b² − 4·a·c = ' + p(b) + '² − 4·' + p(a, '*') + '·' + p(c, '*') + ' = ' + fmt(delta));
      if (val(delta) < 0 && !(delta.exact === false && Math.abs(delta.v) < 1e-12)) {
        passos.push('Como Δ < 0, a equação não tem raízes reais.');
        return { ok: true, tipo: 'Equação do 2º grau', passos: passos, resposta: 'Não há solução real (Δ = ' + fmt(delta) + ' < 0).' };
      }
      const twoA = mul(F(2), a);
      if (isZero(delta)) {
        const x = div(neg(b), twoA);
        passos.push('Como Δ = 0, há uma raiz dupla: x = −b ÷ (2a) = ' + p(neg(b)) + ' ÷ ' + p(twoA, '/') + ' = ' + fmt(x));
        return { ok: true, tipo: 'Equação do 2º grau', passos: passos, resposta: igual('x', x) };
      }
      const s = sqrt(delta);
      passos.push('√Δ = ' + fmt(s) + (s.exact ? '' : ' (aproximado)'));
      passos.push('Fórmula de Bhaskara: x = (−b ± √Δ) ÷ (2a) = (' + fmt(neg(b)) + ' ± ' + fmt(s) + ') ÷ ' + p(twoA, '/'));
      const x1 = div(add(neg(b), s), twoA);
      const x2 = div(sub(neg(b), s), twoA);
      passos.push('x₁ = (' + fmt(neg(b)) + ' + ' + fmt(s) + ') ÷ ' + p(twoA, '/') + ' = ' + fmt(x1));
      passos.push('x₂ = (' + fmt(neg(b)) + ' − ' + fmt(s) + ') ÷ ' + p(twoA, '/') + ' = ' + fmt(x2));
      return { ok: true, tipo: 'Equação do 2º grau', passos: passos, resposta: igual('x₁', x1) + '  e  ' + igual('x₂', x2) };
    }

    throw new Error('Por enquanto resolvo equações de até 2º grau (esta é de grau ' + g + ').');
  }

  // ---------- Teoria dos números ----------
  function factor(n) {
    const f = [];
    let d = 2;
    while (d * d <= n) {
      let e = 0;
      while (n % d === 0) { n /= d; e++; }
      if (e) f.push([d, e]);
      d += d === 2 ? 1 : 2;
    }
    if (n > 1) f.push([n, 1]);
    return f;
  }
  const supNum = (e) => String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('');
  function factorStr(f) {
    return f.length ? f.map(([b, e]) => b + (e > 1 ? supNum(e) : '')).join(' × ') : '1';
  }
  function parseInts(s) {
    const nums = (s.match(/\d+/g) || []).map(Number);
    if (nums.some((n) => n < 1 || n > 1e9)) throw new Error('Use números inteiros entre 1 e 1.000.000.000.');
    return nums;
  }

  function mmcMdc(kind, nums) {
    if (nums.length < 2) throw new Error('Informe pelo menos dois números. Ex.: ' + kind + ' 12 18');
    const passos = ['Fatorando cada número em primos:'];
    const fs = nums.map((n) => {
      const f = factor(n);
      passos.push(n + ' = ' + factorStr(f));
      return new Map(f);
    });
    const primes = new Set();
    fs.forEach((m) => m.forEach((_, b) => primes.add(b)));
    const res = [];
    Array.from(primes).sort((a, b) => a - b).forEach((b) => {
      const exps = fs.map((m) => m.get(b) || 0);
      const e = kind === 'mmc' ? Math.max.apply(null, exps) : Math.min.apply(null, exps);
      if (e > 0) res.push([b, e]);
    });
    const value = res.reduce((acc, [b, e]) => acc * Math.pow(b, e), 1);
    const lista = nums.join(', ');
    if (kind === 'mmc') {
      passos.push('MMC: multiplicamos todos os fatores primos, cada um com o MAIOR expoente que aparece.');
    } else {
      passos.push('MDC: multiplicamos só os fatores primos COMUNS a todos, com o MENOR expoente.');
      if (!res.length) passos.push('Não há fator primo comum, então o MDC é 1 (os números são primos entre si).');
    }
    passos.push(kind.toUpperCase() + '(' + lista + ') = ' + factorStr(res) + ' = ' + value);
    return { ok: true, tipo: kind === 'mmc' ? 'Mínimo múltiplo comum' : 'Máximo divisor comum', passos: passos, resposta: kind.toUpperCase() + '(' + lista + ') = ' + value };
  }

  function primo(n) {
    const passos = [];
    if (n < 2) return { ok: true, tipo: 'Número primo', passos: ['Primos são maiores que 1 e têm exatamente dois divisores.'], resposta: n + ' não é primo.' };
    const lim = Math.floor(Math.sqrt(n));
    passos.push('Basta testar divisores de 2 até √' + n + ' ≈ ' + lim + '.');
    for (let d = 2; d <= lim; d++) {
      if (n % d === 0) {
        passos.push(n + ' ÷ ' + d + ' = ' + n / d + ' (divisão exata)');
        return { ok: true, tipo: 'Número primo', passos: passos, resposta: n + ' não é primo: é divisível por ' + d + '.' };
      }
    }
    passos.push('Nenhum número de 2 até ' + lim + ' divide ' + n + ' exatamente.');
    return { ok: true, tipo: 'Número primo', passos: passos, resposta: n + ' é primo.' };
  }

  // ---------- Entrada principal ----------
  const PREFIX = /^(quanto\s+(é|e|vale|da|dá)|calcule|calcular|calcula|resolva|resolver|resolve|simplifique|simplificar|determine|encontre|qual\s+(é|e)\s+o\s+valor\s+de)\s*(a\s+equação|a\s+expressão|o\s+valor\s+de)?\s*:?\s*/;

  function solve(texto) {
    if (typeof texto !== 'string') return null;
    let raw = texto.toLowerCase().trim().replace(/[?!]+$/, '').replace(/\.$/, '').trim();
    raw = raw.replace(PREFIX, '').trim();
    if (!raw) return null;

    try {
      const tn = /^(m\.?m\.?c\.?|m\.?d\.?c\.?)\s*(\(|de|entre)?/.exec(raw);
      if (tn && /\d/.test(raw)) {
        const kind = tn[1].replace(/\./g, '');
        return mmcMdc(kind, parseInts(raw.slice(tn[0].length)));
      }
      if (/^(fatore|fatorar|fatoração( de)?|decomponha|decompor)\b/.test(raw)) {
        const nums = parseInts(raw);
        if (nums.length !== 1) throw new Error('Informe um número. Ex.: fatorar 360');
        const f = factor(nums[0]);
        return { ok: true, tipo: 'Fatoração em primos', passos: ['Dividimos sucessivamente pelos menores primos possíveis.', nums[0] + ' = ' + factorStr(f)], resposta: nums[0] + ' = ' + factorStr(f) };
      }
      if (/\bprimo\b/.test(raw) && /^[\d\s]*(é|e)?\s*(um\s+(número\s+)?)?primo|^primo/.test(raw)) {
        const nums = parseInts(raw);
        if (nums.length === 1) return primo(nums[0]);
      }

      const s = normalize(raw);
      const pct = /^(-?[\d.]+)\s*%\s*de\s+(.+)$/.exec(s);
      if (pct) {
        const passos = [];
        const pv = fromDecimal(pct[1]);
        const base = evalNum(parse(tokenize(pct[2])), passos);
        const taxa = div(pv, F(100));
        const r = mul(taxa, base);
        passos.push(fmt(pv) + '% = ' + fmt(pv) + ' ÷ 100 = ' + fmt(taxa));
        passos.push(p(taxa, '*') + ' × ' + p(base, '*') + ' = ' + fmt(r));
        return { ok: true, tipo: 'Porcentagem', passos: passos, resposta: igual(fmt(pv) + '% de ' + fmt(base), r) };
      }

      if (!/^[\dx+\-*/^().%=√ ]+$/.test(s) || !/[\dx]/.test(s)) return null;
      // Texto comum com a letra x (ex.: "xadrez") não chega aqui, pois tem outras letras.

      const sides = s.split('=');
      if (sides.length > 2) throw new Error('Use apenas um sinal de igual (=).');
      if (sides.length === 2) {
        if (!sides[0].trim() || !sides[1].trim()) throw new Error('Falta um dos lados da igualdade.');
        return solveEquation(parse(tokenize(sides[0])), parse(tokenize(sides[1])));
      }

      const tree = parse(tokenize(s));
      if (hasX(tree)) {
        const P = poly(tree);
        return { ok: true, tipo: 'Expressão algébrica', passos: ['Juntando os termos semelhantes (mesma potência de x).', 'Resultado: ' + polyStr(P), 'Dica: para descobrir o valor de x, escreva uma equação com "=".'], resposta: polyStr(P) };
      }
      const passos = [];
      const r = evalNum(tree, passos);
      if (!passos.length) passos.push('O número já está na forma mais simples.');
      else passos.unshift('Ordem: parênteses → potências e raízes → × e ÷ → + e −.');
      return { ok: true, tipo: 'Expressão numérica', passos: passos, resposta: fmtFinal(r) };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  }

  const api = { solve: solve, _internal: { F: F, fmt: fmt, factor: factor } };
  root.Tutor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
