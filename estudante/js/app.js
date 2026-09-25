/* Fokus Estudo — interface. Depende de tutor.js e dados.js. */
(function () {
  'use strict';
  const { MATERIAS, QUESTOES, CONCEITOS, FLASH_INICIAIS } = window.Dados;

  // ---------- Utilidades ----------
  const $ = (sel) => document.querySelector(sel);
  function h(tag, props, ...filhos) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const f of filhos.flat()) {
      if (f == null || f === false) continue;
      el.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return el;
  }
  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function hoje(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function somaDias(dia, n) {
    const [a, m, d] = dia.split('-').map(Number);
    return hoje(new Date(a, m - 1, d + n));
  }
  function embaralhar(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  let toastTimer;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2600);
  }

  // ---------- Estado salvo no navegador (só neste computador) ----------
  const CHAVE = 'fokus-estudo-v1';
  const padrao = () => ({ xp: 0, streak: 0, ultimoDia: null, perguntas: 0, quizzes: 0, quizStats: {}, cards: null, focoMin: 0, focoSessoes: 0, focoCfg: 25, chat: [], tema: null });
  let E = padrao();
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE));
    if (salvo && typeof salvo === 'object') E = Object.assign(padrao(), salvo);
  } catch (e) { /* sem armazenamento: segue com estado em memória */ }
  if (!Array.isArray(E.cards)) {
    E.cards = FLASH_INICIAIS.map((c, i) => ({ id: 'c' + Date.now() + i, m: c.m, f: c.f, v: c.v, caixa: 1, proxima: hoje() }));
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(E)); } catch (e) { /* ignora */ }
    $('#xp-topo').textContent = E.xp;
  }
  function ganharXP(n) {
    E.xp += n;
    const d = hoje();
    if (E.ultimoDia !== d) {
      E.streak = E.ultimoDia === somaDias(d, -1) ? E.streak + 1 : 1;
      E.ultimoDia = d;
    }
    salvar();
  }
  const streakAtual = () => (E.ultimoDia === hoje() || E.ultimoDia === somaDias(hoje(), -1) ? E.streak : 0);

  // ---------- Tema ----------
  function aplicarTema() {
    if (E.tema) document.documentElement.setAttribute('data-theme', E.tema);
    else document.documentElement.removeAttribute('data-theme');
  }
  $('#tema').addEventListener('click', () => {
    const escuroAgora = E.tema ? E.tema === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    E.tema = escuroAgora ? 'light' : 'dark';
    aplicarTema();
    salvar();
  });
  aplicarTema();

  // ---------- Navegação ----------
  const SECOES = ['inicio', 'tutor', 'quiz', 'cards', 'foco', 'progresso'];
  const aoAbrir = {};
  function ir(id, foco) {
    if (SECOES.indexOf(id) === -1) id = 'inicio';
    SECOES.forEach((s) => { $('#' + s).hidden = s !== id; });
    document.querySelectorAll('.menu button').forEach((b) => {
      if (b.dataset.ir === id) {
        b.setAttribute('aria-current', 'page');
        b.parentNode.scrollLeft = b.offsetLeft - (b.parentNode.clientWidth - b.offsetWidth) / 2;
      } else b.removeAttribute('aria-current');
    });
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    if (aoAbrir[id]) aoAbrir[id]();
    window.scrollTo(0, 0);
    if (foco) setTimeout(() => foco.focus(), 50);
  }
  document.addEventListener('click', (ev) => {
    const alvo = ev.target.closest('[data-ir]');
    if (!alvo) return;
    ev.preventDefault();
    ir(alvo.dataset.ir, alvo.dataset.ir === 'tutor' ? $('#chat-input') : null);
  });
  window.addEventListener('hashchange', () => ir(location.hash.slice(1)));

  // ---------- Tira-dúvidas ----------
  const SUGESTOES = ['3x + 5 = 20', 'x² − 5x + 6 = 0', '1/2 + 3/4', '20% de 150', 'mmc 12 18', '√(3² + 4²)', 'O que é fotossíntese?', 'O que é advérbio?', 'Verb to be'];
  const TECLAS = ['x', '²', '^', '√', '×', '÷', '(', ')', '=', '%'];

  function buscarConceito(texto) {
    const q = ' ' + semAcento(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ') + ' ';
    let melhor = null, pontos = 0;
    for (const c of CONCEITOS) {
      let s = 0;
      for (const t of c.termos) if (q.indexOf(' ' + t + ' ') !== -1 || q.indexOf(' ' + t + 's ') !== -1) s += t.length;
      if (s > pontos) { pontos = s; melhor = c; }
    }
    return melhor;
  }

  function responder(texto) {
    const r = window.Tutor.solve(texto);
    if (r && r.ok) return { de: 'tutor', tipo: r.tipo, passos: r.passos, resposta: r.resposta };
    if (r && !r.ok) return { de: 'tutor', erro: true, texto: r.erro + ' Exemplos: 2x + 3 = 11, 1/2 + 1/3, 20% de 150.' };
    if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|hey)\b/.test(semAcento(texto.trim()))) {
      return { de: 'tutor', texto: 'Olá! Mande uma conta (como 3x + 5 = 20) ou pergunte sobre um tema (como “o que é fotossíntese?”).' };
    }
    const c = buscarConceito(texto);
    if (c) return { de: 'tutor', tipo: MATERIAS[c.m].nome + ' · ' + c.t, texto: c.x, ex: c.ex };
    const temas = embaralhar(CONCEITOS).slice(0, 4).map((c) => c.t).join(', ');
    return { de: 'tutor', texto: 'Ainda não sei explicar esse assunto. Posso resolver contas passo a passo e explicar temas como: ' + temas + '. Para outras dúvidas, anote e leve para o seu professor!' };
  }

  function renderMsg(m, animar) {
    if (m.de === 'eu') return h('div', { class: 'msg eu' }, m.texto);
    const box = h('div', { class: 'msg tutor' + (m.erro ? ' erro' : '') });
    if (m.tipo) box.append(h('div', { class: 'tipo' }, m.tipo));
    if (m.texto) box.append(h('div', null, m.texto));
    if (m.ex) box.append(h('div', { class: 'ex' }, 'Exemplo: ' + m.ex));
    if (m.passos) {
      const ol = h('ol');
      const resp = h('div', { class: 'resposta' }, '✔ ' + m.resposta);
      box.append(ol);
      if (!animar || m.passos.length <= 1) {
        m.passos.forEach((p) => ol.append(h('li', null, p)));
        box.append(resp);
      } else {
        let i = 0;
        const acoes = h('div', { class: 'linha-botoes', style: 'justify-content:flex-start' });
        const mostrar = () => {
          ol.append(h('li', null, m.passos[i++]));
          if (i >= m.passos.length) { acoes.remove(); box.append(resp); }
          rolarChat();
        };
        acoes.append(
          h('button', { class: 'btn btn-sec btn-peq btn-revelar', onclick: mostrar }, 'Próximo passo'),
          h('button', { class: 'btn btn-sec btn-peq btn-revelar', onclick: () => { while (i < m.passos.length) mostrar(); } }, 'Mostrar tudo')
        );
        mostrar();
        box.append(acoes);
      }
    }
    return box;
  }
  function rolarChat() { const c = $('#chat'); c.scrollTop = c.scrollHeight; }
  function renderChat() {
    const c = $('#chat');
    c.replaceChildren();
    if (!E.chat.length) {
      c.append(h('div', { class: 'vazio' }, h('p', { style: 'font-size:2rem;margin:0' }, '💡'), h('p', null, 'Escreva uma conta ou dúvida. Vou mostrar um passo de cada vez para você tentar acompanhar.')));
    } else E.chat.forEach((m) => c.append(renderMsg(m, false)));
    rolarChat();
  }
  function perguntar(texto) {
    texto = texto.trim().slice(0, 200);
    if (!texto) return;
    const c = $('#chat');
    if (!E.chat.length) c.replaceChildren();
    const eu = { de: 'eu', texto: texto };
    const tutor = responder(texto);
    E.chat.push(eu, tutor);
    E.chat = E.chat.slice(-40);
    E.perguntas++;
    ganharXP(tutor.erro ? 1 : 5);
    c.append(renderMsg(eu), renderMsg(tutor, true));
    rolarChat();
  }

  $('#chat-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const i = $('#chat-input');
    perguntar(i.value);
    i.value = '';
    i.focus();
  });
  $('#hero-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = $('#hero-input').value;
    $('#hero-input').value = '';
    ir('tutor', $('#chat-input'));
    perguntar(v);
  });
  $('#limpar-chat').addEventListener('click', () => { E.chat = []; salvar(); renderChat(); });
  SUGESTOES.forEach((s) => $('#sugestoes').append(h('button', { class: 'sug', type: 'button', onclick: () => perguntar(s) }, s)));
  TECLAS.forEach((t) => $('#teclado').append(h('button', {
    type: 'button', 'aria-label': 'Inserir ' + t,
    onclick: () => {
      const i = $('#chat-input');
      const a = i.selectionStart ?? i.value.length, b = i.selectionEnd ?? i.value.length;
      i.value = i.value.slice(0, a) + t + i.value.slice(b);
      i.focus();
      i.setSelectionRange(a + t.length, a + t.length);
    },
  }, t)));
  aoAbrir.tutor = renderChat;

  // ---------- Quiz ----------
  const POR_RODADA = 5;
  let Q = null;
  function quizInicio() {
    Q = null;
    const area = $('#quiz-area');
    area.replaceChildren(h('p', { class: 'info' }, 'Escolha uma matéria. Cada rodada tem ' + POR_RODADA + ' questões sorteadas; cada acerto vale 10 XP.'));
    const grade = h('div', { class: 'materias' });
    for (const [id, m] of Object.entries(MATERIAS)) {
      const st = E.quizStats[id];
      grade.append(h('button', { class: 'materia', style: '--cor:' + m.cor, onclick: () => quizComecar(id) },
        h('span', { class: 'ic', 'aria-hidden': 'true' }, m.icone),
        h('h3', null, m.nome),
        h('small', null, st ? 'Seus acertos: ' + Math.round((100 * st.certas) / st.total) + '%' : QUESTOES[id].length + ' questões no banco')));
    }
    area.append(grade);
  }
  function quizComecar(m) {
    Q = {
      m: m, i: 0, certas: 0, erradas: [],
      lista: embaralhar(QUESTOES[m]).slice(0, POR_RODADA).map((q) => {
        const ops = embaralhar(q.o.map((txt, idx) => ({ txt: txt, certa: idx === q.c })));
        return { p: q.p, e: q.e, ops: ops, correta: q.o[q.c] };
      }),
    };
    quizPergunta();
  }
  function quizPergunta() {
    const q = Q.lista[Q.i];
    const area = $('#quiz-area');
    const card = h('div', { class: 'quiz-card' });
    card.append(
      h('div', { class: 'barra-prog', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': Q.lista.length, 'aria-valuenow': Q.i }, h('i', { style: 'width:' + (100 * Q.i) / Q.lista.length + '%' })),
      h('p', { class: 'info' }, MATERIAS[Q.m].icone + ' ' + MATERIAS[Q.m].nome + ' · Questão ' + (Q.i + 1) + ' de ' + Q.lista.length),
      h('h3', null, q.p)
    );
    const ops = h('div', { class: 'opcoes' });
    const letras = 'ABCD';
    q.ops.forEach((o, idx) => ops.append(h('button', { class: 'opcao', onclick: (ev) => quizResponder(ev.currentTarget, o, ops) }, letras[idx] + ') ' + o.txt)));
    card.append(ops);
    area.replaceChildren(card);
    ops.querySelector('button').focus();
  }
  function quizResponder(btn, o, ops) {
    const q = Q.lista[Q.i];
    ops.querySelectorAll('button').forEach((b, idx) => {
      b.disabled = true;
      if (q.ops[idx].certa) b.classList.add('certa');
    });
    if (o.certa) Q.certas++;
    else { btn.classList.add('errada'); Q.erradas.push(q); }
    const fb = h('div', { class: 'feedback ' + (o.certa ? 'ok' : 'no'), role: 'status' },
      h('strong', null, o.certa ? '✔ Correto!' : '✘ Não foi dessa vez. Resposta: ' + q.correta),
      h('p', null, q.e));
    const ultimo = Q.i === Q.lista.length - 1;
    const prox = h('button', { class: 'btn btn-prim', onclick: () => { Q.i++; ultimo ? quizFim() : quizPergunta(); } }, ultimo ? 'Ver resultado' : 'Próxima');
    ops.after(fb, prox);
    prox.focus();
  }
  function quizFim() {
    const st = E.quizStats[Q.m] || { certas: 0, total: 0 };
    st.certas += Q.certas;
    st.total += Q.lista.length;
    E.quizStats[Q.m] = st;
    E.quizzes++;
    ganharXP(Q.certas * 10 + 5);
    const pct = Math.round((100 * Q.certas) / Q.lista.length);
    const msg = pct === 100 ? 'Perfeito! 🏆' : pct >= 60 ? 'Muito bem! Continue assim.' : 'Bom treino! Revise os erros e tente de novo.';
    const erradas = Q.erradas.slice();
    const m = Q.m;
    const botoes = h('div', { class: 'linha-botoes' },
      h('button', { class: 'btn btn-prim', onclick: () => quizComecar(m) }, 'Nova rodada'),
      h('button', { class: 'btn btn-sec', onclick: quizInicio }, 'Outra matéria'));
    if (erradas.length) {
      botoes.append(h('button', {
        class: 'btn btn-sec',
        onclick: (ev) => {
          erradas.forEach((q) => novoCard(m, q.p, q.correta + ' — ' + q.e));
          ev.currentTarget.disabled = true;
          toast(erradas.length + ' flashcard(s) criado(s) para revisar!');
        },
      }, '🃏 Virar flashcards os erros'));
    }
    $('#quiz-area').replaceChildren(h('div', { class: 'quiz-card resultado' },
      h('p', { class: 'info' }, MATERIAS[m].nome),
      h('div', { class: 'grande' }, Q.certas + '/' + Q.lista.length),
      h('p', null, msg + ' Você ganhou ' + (Q.certas * 10 + 5) + ' XP.'),
      botoes));
  }
  aoAbrir.quiz = () => { if (!Q) quizInicio(); };

  // ---------- Flashcards (revisão espaçada, sistema de caixas) ----------
  const INTERVALOS = [1, 2, 4, 7, 15]; // dias até a próxima revisão, por caixa
  let fila = [];
  function novoCard(m, f, v) {
    E.cards.push({ id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6), m: m, f: f, v: v, caixa: 1, proxima: hoje() });
    salvar();
  }
  function montarFila() {
    fila = embaralhar(E.cards.filter((c) => c.proxima <= hoje())).map((c) => c.id);
  }
  function renderCards() {
    const area = $('#cards-area');
    const d = hoje();
    const pendentes = E.cards.filter((c) => c.proxima <= d).length;
    $('#cards-info').textContent = E.cards.length + ' cartões · ' + pendentes + ' para revisar hoje';
    fila = fila.filter((id) => E.cards.some((c) => c.id === id));
    const card = E.cards.find((c) => c.id === fila[0]);
    if (!card) {
      area.replaceChildren(h('div', { class: 'quiz-card resultado', style: 'margin:0 auto' },
        h('p', { style: 'font-size:2rem;margin:0' }, '🎉'),
        h('p', null, E.cards.length ? 'Tudo revisado por hoje! Volte amanhã para a próxima revisão.' : 'Você ainda não tem cartões. Crie o primeiro abaixo.'),
        E.cards.length ? h('button', { class: 'btn btn-sec', onclick: () => { fila = embaralhar(E.cards.map((c) => c.id)); renderCards(); } }, 'Revisar todos mesmo assim') : null));
    } else {
      const m = MATERIAS[card.m] || { nome: '' };
      const flash = h('button', { class: 'flash', 'aria-label': 'Cartão: clique para virar' },
        h('div', { class: 'face frente' }, h('small', null, m.nome + ' · caixa ' + card.caixa), card.f),
        h('div', { class: 'face verso' }, h('small', null, 'Resposta'), card.v));
      const acoes = h('div', { class: 'flash-acoes' }, h('button', { class: 'btn btn-sec', onclick: () => virar() }, 'Virar cartão'));
      const virar = () => {
        flash.classList.toggle('virado');
        if (flash.classList.contains('virado') && !acoes.dataset.pronto) {
          acoes.dataset.pronto = '1';
          acoes.replaceChildren(
            h('button', { class: 'btn btn-errei', onclick: () => avaliar(card, false) }, '✘ Errei'),
            h('button', { class: 'btn btn-acertei', onclick: () => avaliar(card, true) }, '✔ Acertei'));
        }
      };
      flash.addEventListener('click', virar);
      area.replaceChildren(h('div', { class: 'flash-wrap' }, flash, acoes, h('p', { class: 'info', style: 'text-align:center' }, fila.length + ' na fila desta sessão')));
    }
    const lista = h('div', { class: 'lista-cards' });
    E.cards.slice().reverse().forEach((c) => lista.append(h('div', { class: 'item-card' },
      h('span', null, c.f, h('small', null, (MATERIAS[c.m] ? MATERIAS[c.m].nome : '') + ' · próxima revisão: ' + (c.proxima <= d ? 'hoje' : c.proxima.split('-').reverse().join('/')))),
      h('button', { 'aria-label': 'Excluir cartão ' + c.f, onclick: () => { if (confirm('Excluir este cartão?')) { E.cards = E.cards.filter((x) => x.id !== c.id); salvar(); renderCards(); } } }, 'Excluir'))));
    $('#cards-lista').replaceChildren(E.cards.length ? h('h3', null, 'Meus cartões') : '', lista);
  }
  function avaliar(card, acertou) {
    fila.shift();
    if (acertou) {
      card.caixa = Math.min(5, card.caixa + 1);
      card.proxima = somaDias(hoje(), INTERVALOS[card.caixa - 1]);
    } else {
      card.caixa = 1;
      card.proxima = hoje();
      fila.push(card.id); // volta para o fim da fila de hoje
    }
    ganharXP(2);
    renderCards();
  }
  Object.entries(MATERIAS).forEach(([id, m]) => $('#card-materia').append(h('option', { value: id }, m.nome)));
  $('#card-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = $('#card-frente').value.trim(), v = $('#card-verso').value.trim();
    if (!f || !v) return;
    novoCard($('#card-materia').value, f, v);
    fila.push(E.cards[E.cards.length - 1].id);
    ev.target.reset();
    toast('Cartão criado!');
    renderCards();
  });
  aoAbrir.cards = () => { if (!fila.length) montarFila(); renderCards(); };

  // ---------- Modo foco (Pomodoro) ----------
  const CIRC = 2 * Math.PI * 54;
  const F = { modo: 'foco', total: 0, restante: 0, fim: 0, timer: null };
  const minutosModo = (m) => (m === 'foco' ? E.focoCfg : m === 'pausa' ? 5 : 15);
  function focoDefinir(modo) {
    clearInterval(F.timer); F.timer = null;
    F.modo = modo;
    F.total = F.restante = minutosModo(modo) * 60000;
    document.querySelectorAll('.foco-modos button').forEach((b) => b.classList.toggle('ativo', b.dataset.modo === modo));
    $('#foco-iniciar').textContent = 'Iniciar';
    focoDesenhar();
  }
  function focoDesenhar() {
    const s = Math.ceil(F.restante / 1000);
    const txt = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    $('#tempo').textContent = txt;
    $('#arco').style.strokeDasharray = CIRC;
    $('#arco').style.strokeDashoffset = CIRC * (1 - F.restante / F.total);
    document.title = F.timer ? txt + ' · Fokus Estudo' : 'Fokus Estudo — Assistente do Estudante';
    $('#foco-info').textContent = 'Hoje e antes: ' + E.focoSessoes + ' ciclos de foco concluídos · ' + E.focoMin + ' minutos no total.';
  }
  function bip() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.2, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
      });
    } catch (e) { /* sem áudio */ }
  }
  function focoTick() {
    F.restante = Math.max(0, F.fim - Date.now());
    if (F.restante === 0) {
      clearInterval(F.timer); F.timer = null;
      bip();
      if (F.modo === 'foco') {
        E.focoSessoes++;
        E.focoMin += minutosModo('foco');
        ganharXP(15);
        toast('Ciclo concluído! +15 XP. Hora da pausa ☕');
        focoDefinir(E.focoSessoes % 4 === 0 ? 'longa' : 'pausa');
      } else {
        toast('Pausa encerrada. Bora voltar ao foco! 💪');
        focoDefinir('foco');
      }
      return;
    }
    focoDesenhar();
  }
  $('#foco-iniciar').addEventListener('click', () => {
    if (F.timer) {
      clearInterval(F.timer); F.timer = null;
      F.restante = Math.max(0, F.fim - Date.now());
      $('#foco-iniciar').textContent = 'Continuar';
      focoDesenhar();
    } else {
      F.fim = Date.now() + F.restante;
      F.timer = setInterval(focoTick, 250);
      $('#foco-iniciar').textContent = 'Pausar';
      focoTick();
    }
  });
  $('#foco-zerar').addEventListener('click', () => focoDefinir(F.modo));
  document.querySelectorAll('.foco-modos button').forEach((b) => b.addEventListener('click', () => focoDefinir(b.dataset.modo)));
  $('#foco-min').value = E.focoCfg;
  $('#foco-min').addEventListener('change', (ev) => {
    const v = Math.round(Number(ev.target.value));
    E.focoCfg = Math.min(90, Math.max(5, isFinite(v) ? v : 25));
    ev.target.value = E.focoCfg;
    salvar();
    if (F.modo === 'foco' && !F.timer) focoDefinir('foco');
  });
  focoDefinir('foco');

  // ---------- Progresso ----------
  function renderProgresso() {
    const nivel = Math.floor(E.xp / 100) + 1;
    const kpi = (valor, rotulo, extra) => h('div', { class: 'kpi' }, h('b', null, valor), h('span', null, rotulo), extra || null);
    $('#kpis').replaceChildren(
      kpi('Nível ' + nivel, E.xp + ' XP · faltam ' + (100 - (E.xp % 100)) + ' para o próximo', h('div', { class: 'nivel' }, h('i', { style: 'width:' + (E.xp % 100) + '%' }))),
      kpi(streakAtual() + ' 🔥', 'dias seguidos estudando'),
      kpi(E.perguntas, 'dúvidas enviadas'),
      kpi(E.focoMin, 'minutos de foco'),
      kpi(E.quizzes, 'quizzes concluídos'),
      kpi(E.cards.length, 'flashcards criados'));
    const barras = $('#barras');
    barras.replaceChildren();
    for (const [id, m] of Object.entries(MATERIAS)) {
      const st = E.quizStats[id];
      const pct = st ? Math.round((100 * st.certas) / st.total) : 0;
      barras.append(h('div', { class: 'barra', style: '--cor:' + m.cor },
        h('span', null, m.icone + ' ' + m.nome),
        h('div', { class: 'trilho-b', role: 'img', 'aria-label': m.nome + ': ' + (st ? pct + '% de acertos' : 'sem dados') }, h('i', { style: 'width:' + pct + '%' })),
        h('small', null, st ? pct + '% (' + st.certas + '/' + st.total + ')' : '—')));
    }
  }
  $('#zerar-tudo').addEventListener('click', () => {
    if (!confirm('Apagar todo o seu progresso, conversas e flashcards deste computador?')) return;
    E = padrao();
    E.cards = [];
    salvar();
    fila = []; Q = null;
    renderProgresso();
    toast('Dados apagados.');
  });
  aoAbrir.progresso = renderProgresso;

  // ---------- Início ----------
  salvar();
  ir(location.hash.slice(1) || 'inicio');
})();
