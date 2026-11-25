'use strict';
/* Ritmo — planejador visual pessoal. Dados 100% locais (localStorage). */
const KEY = 'ritmo.v1';
const COLORS = ['#c9b8ff','#ffc9d6','#ffd9a8','#fff0a6','#bdeccb','#b5e3f5','#f3c1f0','#d4d4d8'];
const EMOJIS = ['📌','☀️','🍳','🚿','🎒','📚','💼','💻','🏃','🧘','🍽️','🧹','🛒','📞','💊','🛏️','🎨','🎵','🚗','👨‍👩‍👧'];
const PPM = 1.6, MINH = 44;

const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let S = load();
let cur = new Date(); cur.setHours(0, 0, 0, 0);
let editing = null, selEmoji = EMOJIS[0], selColor = COLORS[0], focusMode = 'foco';

function load() {
  const def = { events: [], tasks: [], routines: [
    { id: uid(), name: 'Manhã tranquila', items: [
      { title: 'Acordar e se arrumar', emoji: '☀️', color: COLORS[3], start: 420, dur: 30 },
      { title: 'Café da manhã', emoji: '🍳', color: COLORS[2], start: 450, dur: 20 },
      { title: 'Revisar o dia', emoji: '📌', color: COLORS[0], start: 480, dur: 10 } ] } ],
    settings: { focus: 25, brk: 5 }, timer: null };
  try { const r = JSON.parse(localStorage.getItem(KEY)); return r ? Object.assign(def, r) : def; } catch { return def; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Não foi possível salvar'); } }
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 2200); }

/* ---------- Hoje ---------- */
function dayEvents() { return S.events.filter(e => e.date === ymd(cur)).sort((a, b) => a.start - b.start); }

function renderDay() {
  const today = ymd(new Date()), isToday = ymd(cur) === today;
  const diff = Math.round((cur - new Date(new Date().setHours(0,0,0,0))) / 864e5);
  $('#dateTitle').textContent = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : diff === -1 ? 'Ontem' : cur.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, c => c.toUpperCase());
  { const t = cur.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); $('#dateSub').textContent = t[0].toUpperCase() + t.slice(1); }
  const evs = dayEvents();
  const done = evs.filter(e => e.done).length;
  $('#progBar').style.width = evs.length ? (done / evs.length * 100) + '%' : '0';
  $('#progTxt').textContent = evs.length ? `${done} de ${evs.length} blocos concluídos` : '';
  $('#emptyDay').hidden = evs.length > 0;

  const tl = $('#timeline');
  let s0 = 6 * 60, e0 = 22 * 60;
  evs.forEach(e => { s0 = Math.min(s0, Math.floor(e.start / 60) * 60); e0 = Math.max(e0, Math.ceil((e.start + e.dur) / 60) * 60); });
  if (!evs.length) { tl.style.height = '0'; tl.innerHTML = ''; return; }
  tl.style.height = ((e0 - s0) * PPM) + 'px';
  let html = '';
  for (let m = s0; m <= e0; m += 60) html += `<div class="hour" style="top:${(m - s0) * PPM}px"><span>${pad(m / 60 % 24)}h</span></div>`;
  // lanes para sobreposição
  const lanes = []; evs.forEach(e => {
    let l = lanes.findIndex(end => end <= e.start); if (l < 0) { l = lanes.length; lanes.push(0); }
    lanes[l] = e.start + Math.max(e.dur, MINH / PPM); e._l = l; });
  const nl = Math.max(1, lanes.length);
  evs.forEach(e => {
    const h = Math.max(MINH - 3, e.dur * PPM - 3), w = `calc((100% - 46px) / ${nl})`;
    html += `<div class="block ${e.done ? "done" : ""} ${e.dur < 20 ? "tiny" : ""}" data-id="${e.id}" style="top:${(e.start - s0) * PPM}px;height:${h}px;width:${w};left:calc(46px + ${e._l} * (100% - 46px) / ${nl});background:${e.color}">
      <span class="em">${esc(e.emoji)}</span><div><div class="tt">${esc(e.title)}</div><div class="tm">${hm(e.start)} – ${hm(e.start + e.dur)} · ${e.dur} min</div></div>
      <button class="chk" data-chk="${e.id}" aria-label="Concluir">${e.done ? '✓' : ''}</button></div>`;
  });
  if (isToday) { const n = new Date(), nm = n.getHours() * 60 + n.getMinutes();
    if (nm >= s0 && nm <= e0) html += `<div class="now" style="top:${(nm - s0) * PPM}px"></div>`; }
  tl.innerHTML = html;
}
$('#timeline').addEventListener('click', ev => {
  const chk = ev.target.closest('[data-chk]');
  if (chk) { const e = S.events.find(x => x.id === chk.dataset.chk); e.done = !e.done; save(); renderDay(); return; }
  const b = ev.target.closest('.block'); if (b) openDetail(b.dataset.id);
});
$('#prevDay').onclick = () => { cur.setDate(cur.getDate() - 1); renderDay(); };
$('#nextDay').onclick = () => { cur.setDate(cur.getDate() + 1); renderDay(); };
$('#dateTitle').onclick = () => { cur = new Date(); cur.setHours(0,0,0,0); renderDay(); };

/* ---------- Editor de bloco ---------- */
function chips(box, items, sel, fn, color) {
  box.innerHTML = items.map(i => `<button type="button" class="${i === sel ? 'sel' : ''}" data-v="${esc(i)}" ${color ? `style="background:${i}"` : ''}>${color ? '' : esc(i)}</button>`).join('');
  box.onclick = e => { const b = e.target.closest('button'); if (!b) return; fn(b.dataset.v); chips(box, items, b.dataset.v, fn, color); };
}
function openEditor(id, preset) {
  editing = id ? S.events.find(e => e.id === id) : null;
  const e = editing || preset || {};
  $('#evDlgTitle').textContent = editing ? 'Editar bloco' : 'Novo bloco';
  $('#evTitle').value = e.title || '';
  const nowM = Math.ceil((new Date().getHours() * 60 + new Date().getMinutes()) / 5) * 5;
  $('#evStart').value = hm(e.start ?? Math.min(nowM, 1435));
  $('#evDur').value = e.dur || 30;
  $('#evSteps').value = (e.steps || []).map(s => s.t).join('\n');
  selEmoji = e.emoji || EMOJIS[0]; selColor = e.color || COLORS[0];
  chips($('#evEmoji'), EMOJIS, selEmoji, v => selEmoji = v);
  chips($('#evColor'), COLORS, selColor, v => selColor = v, true);
  $('#evDelete').hidden = !editing;
  $('#evDlg').showModal();
}
$('#fab').onclick = () => { if ($('#view-tarefas').classList.contains('active')) $('#taskInput').focus(); else openEditor(); };
$('#evCancel').onclick = () => $('#evDlg').close();
$('#evForm').addEventListener('submit', ev => {
  if (ev.submitter?.id !== 'evSave') return;
  const old = editing ? new Map((editing.steps || []).map(s => [s.t, s.done])) : new Map();
  const steps = $('#evSteps').value.split('\n').map(s => s.trim()).filter(Boolean).map(t => ({ t, done: old.get(t) || false }));
  const data = { title: $('#evTitle').value.trim(), start: toMin($('#evStart').value), dur: Math.max(5, +$('#evDur').value || 30), emoji: selEmoji, color: selColor, steps };
  if (editing) Object.assign(editing, data); else S.events.push({ id: uid(), date: ymd(cur), done: false, ...data });
  save(); renderDay();
});
$('#evDelete').onclick = () => { if (editing && confirm('Excluir este bloco?')) { S.events = S.events.filter(e => e !== editing); save(); $('#evDlg').close(); renderDay(); } };

/* ---------- Detalhe ---------- */
function openDetail(id) {
  const e = S.events.find(x => x.id === id); if (!e) return;
  const box = $('#detBody');
  const draw = () => {
    box.innerHTML = `<div class="det-head"><span class="em">${esc(e.emoji)}</span><div><h3>${esc(e.title)}</h3><div class="muted">${hm(e.start)} – ${hm(e.start + e.dur)} · ${e.dur} min</div></div></div>
      ${e.steps?.length ? `<ul class="steplist">${e.steps.map((s, i) => `<li class="${s.done ? 'done' : ''}"><input type="checkbox" data-s="${i}" ${s.done ? 'checked' : ''}><span>${esc(s.t)}</span></li>`).join('')}</ul>` : ''}
      <div class="dlg-actions"><button class="btn ghost" data-a="edit">Editar</button><button class="btn ghost" data-a="done">${e.done ? 'Reabrir' : 'Concluir'}</button><button class="btn" data-a="timer">▶ Timer visual</button><button class="btn ghost" data-a="close">Fechar</button></div>`;
  };
  draw();
  box.onclick = ev => {
    const cb = ev.target.closest('[data-s]'); if (cb) { e.steps[+cb.dataset.s].done = cb.checked; save(); draw(); return; }
    const a = ev.target.dataset.a; if (!a) return;
    if (a === 'close') $('#detDlg').close();
    if (a === 'edit') { $('#detDlg').close(); openEditor(id); }
    if (a === 'done') { e.done = !e.done; save(); $('#detDlg').close(); renderDay(); }
    if (a === 'timer') { $('#detDlg').close(); startTimer({ label: `${e.emoji} ${e.title}`, mins: e.dur, color: e.color, evId: e.id }); }
  };
  $('#detDlg').showModal();
}

/* ---------- Tarefas ---------- */
function renderTasks() {
  $('#taskList').innerHTML = S.tasks.length ? S.tasks.map(t => `<li class="card ${t.done ? 'done' : ''}" data-id="${t.id}">
    <div class="head"><input type="checkbox" data-tk="${t.id}" ${t.done ? 'checked' : ''}><span class="t">${esc(t.title)}</span></div>
    ${t.steps?.length ? `<ul class="steps">${t.steps.map((s, i) => `<li><label style="margin:0;color:inherit"><input type="checkbox" data-ts="${t.id}:${i}" ${s.done ? 'checked' : ''}> ${esc(s.t)}</label></li>`).join('')}</ul>` : ''}
    <div class="acts"><button class="btn ghost sm" data-act="steps">Dividir em passos</button><button class="btn ghost sm" data-act="plan">Agendar no dia</button><button class="btn ghost sm" data-act="del">Excluir</button></div></li>`).join('')
    : '<li class="empty">Nenhuma tarefa. Despeje aqui o que estiver na cabeça. 🧠</li>';
}
$('#taskForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#taskInput').value.trim(); if (!v) return; S.tasks.unshift({ id: uid(), title: v, done: false, steps: [] }); $('#taskInput').value = ''; save(); renderTasks(); });
$('#taskList').addEventListener('click', e => {
  const li = e.target.closest('.card'); if (!li) return; const t = S.tasks.find(x => x.id === li.dataset.id);
  if (e.target.dataset.tk) { t.done = e.target.checked; save(); renderTasks(); return; }
  if (e.target.dataset.ts) { const [, i] = e.target.dataset.ts.split(':'); t.steps[+i].done = e.target.checked; save(); return; }
  const a = e.target.dataset.act;
  if (a === 'del') { S.tasks = S.tasks.filter(x => x !== t); save(); renderTasks(); }
  if (a === 'steps') { const r = prompt('Passos pequenos, separados por ponto e vírgula:\nEx.: abrir o documento; escrever o título; escrever 1 parágrafo', (t.steps || []).map(s => s.t).join('; ')); if (r !== null) { t.steps = r.split(';').map(s => s.trim()).filter(Boolean).map(x => ({ t: x, done: false })); save(); renderTasks(); } }
  if (a === 'plan') { switchView('hoje'); openEditor(null, { title: t.title, steps: t.steps, dur: 30 }); }
});

/* ---------- Rotinas ---------- */
function renderRoutines() {
  $('#routineList').innerHTML = S.routines.length ? S.routines.map(r => `<li class="card" data-id="${r.id}"><div class="head"><span class="t">🔁 ${esc(r.name)}</span><span class="muted">${r.items.length} blocos</span></div>
    <div class="muted" style="margin-top:6px">${r.items.map(i => `${hm(i.start)} ${esc(i.emoji)} ${esc(i.title)}`).join(' · ')}</div>
    <div class="acts"><button class="btn sm" data-r="apply">Aplicar em ${ymd(cur) === ymd(new Date()) ? 'hoje' : cur.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</button><button class="btn ghost sm" data-r="del">Excluir</button></div></li>`).join('')
    : '<li class="empty">Sem rotinas ainda.</li>';
}
$('#routineList').addEventListener('click', e => {
  const li = e.target.closest('.card'); if (!li) return; const r = S.routines.find(x => x.id === li.dataset.id);
  if (e.target.dataset.r === 'del' && confirm('Excluir rotina?')) { S.routines = S.routines.filter(x => x !== r); save(); renderRoutines(); }
  if (e.target.dataset.r === 'apply') { r.items.forEach(i => S.events.push({ id: uid(), date: ymd(cur), done: false, steps: [], ...i })); save(); toast('Rotina aplicada'); renderDay(); switchView('hoje'); }
});
$('#newRoutine').onclick = () => { $('#rtName').value = ''; $('#rtItems').value = ''; $('#rtDlg').showModal(); };
$('#rtCancel').onclick = () => $('#rtDlg').close();
$('#rtForm').addEventListener('submit', () => {
  const items = $('#rtItems').value.split('\n').map(l => l.trim()).filter(Boolean).map((l, k) => {
    const m = l.match(/^(\d{1,2}):(\d{2})\s+(\d+)\s+(\S+)\s+(.+)$/); if (!m) return null;
    return { start: +m[1] * 60 + +m[2], dur: +m[3], emoji: m[4], title: m[5], color: COLORS[k % COLORS.length] }; }).filter(Boolean);
  if (!items.length) { toast('Nenhuma linha válida. Use: 07:00 30 ☀️ Título'); return; }
  S.routines.push({ id: uid(), name: $('#rtName').value.trim(), items }); save(); renderRoutines();
});
$('#exportBtn').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })); a.download = `ritmo-backup-${ymd(new Date())}.json`; a.click(); };
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.events) || !Array.isArray(d.tasks)) throw 0;
    if (!confirm('Substituir seus dados atuais pelo backup?')) return; S = Object.assign(load(), d); save(); renderAll(); toast('Backup importado'); }
  catch { toast('Arquivo inválido'); }
};

/* ---------- Timer visual ---------- */
let tick = null;
function startTimer({ label, mins, color, evId }) {
  S.timer = { label, color, evId: evId || null, total: mins * 60, end: Date.now() + mins * 60000, paused: false, left: 0 };
  save(); notifyPerm(); showTimer();
}
function notifyPerm() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {} }
function left() { const t = S.timer; return t.paused ? t.left : Math.max(0, Math.round((t.end - Date.now()) / 1000)); }
function showTimer() {
  const t = S.timer; if (!t) { $('#timerOv').hidden = true; clearInterval(tick); return; }
  $('#timerOv').hidden = false; $('#tLabel').textContent = t.label; $('#tDial').style.setProperty('--c', t.color);
  $('#tPause').textContent = t.paused ? 'Retomar' : 'Pausar';
  clearInterval(tick); tick = setInterval(paint, 250); paint();
}
function paint() {
  const t = S.timer; if (!t) return; const l = left();
  $('#tTime').textContent = `${pad(Math.floor(l / 60))}:${pad(l % 60)}`;
  $('#tDial').style.setProperty('--p', l / t.total);
  document.title = `${$('#tTime').textContent} · Ritmo`;
  if (l <= 0 && !t.paused) finishTimer();
}
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); [0, .35, .7].forEach(d => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 660; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(.2, c.currentTime + d); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + d + .3); o.start(c.currentTime + d); o.stop(c.currentTime + d + .3); }); navigator.vibrate?.([200, 100, 200]); } catch {} }
function finishTimer() {
  const t = S.timer; beep(); document.title = 'Ritmo';
  try { if (Notification.permission === 'granted') new Notification('Tempo!', { body: t.label }); } catch {}
  if (t.evId) { const e = S.events.find(x => x.id === t.evId); if (e) e.done = true; }
  if (t.kind === 'foco') toast('Foco concluído! Hora da pausa 🌿'); else toast('Tempo concluído ✓');
  S.timer = null; save(); showTimer(); renderDay();
}
$('#tPause').onclick = () => { const t = S.timer; if (t.paused) { t.end = Date.now() + t.left * 1000; t.paused = false; } else { t.left = left(); t.paused = true; } save(); showTimer(); };
const adj = s => { const t = S.timer; if (t.paused) t.left = Math.max(1, t.left + s); else t.end += s * 1000; t.total = Math.max(60, t.total + s); save(); paint(); };
$('#tPlus').onclick = () => adj(300); $('#tMinus').onclick = () => adj(-300);
$('#tDone').onclick = () => { if (S.timer?.evId) { const e = S.events.find(x => x.id === S.timer.evId); if (e) e.done = true; } S.timer = null; document.title = 'Ritmo'; save(); showTimer(); renderDay(); };
$('#tStop').onclick = () => { S.timer = null; document.title = 'Ritmo'; save(); showTimer(); };

/* ---------- Foco ---------- */
function renderFocus() {
  $('#setFocus').value = S.settings.focus; $('#setBreak').value = S.settings.brk;
  $('#focusSeg').innerHTML = ['foco', 'pausa'].map(m => `<button data-m="${m}" class="${focusMode === m ? 'on' : ''}">${m === 'foco' ? 'Foco' : 'Pausa'}</button>`).join('');
  const mins = focusMode === 'foco' ? S.settings.focus : S.settings.brk;
  $('#focusTime').textContent = `${pad(mins)}:00`; $('#focusDial').style.setProperty('--c', focusMode === 'foco' ? '#7a5af0' : '#3fb985');
}
$('#focusSeg').onclick = e => { if (e.target.dataset.m) { focusMode = e.target.dataset.m; renderFocus(); } };
$('#setFocus').onchange = e => { S.settings.focus = Math.min(180, Math.max(1, +e.target.value || 25)); save(); renderFocus(); };
$('#setBreak').onchange = e => { S.settings.brk = Math.min(60, Math.max(1, +e.target.value || 5)); save(); renderFocus(); };
$('#focusStart').onclick = () => { const mins = focusMode === 'foco' ? S.settings.focus : S.settings.brk;
  startTimer({ label: focusMode === 'foco' ? '🎯 Foco' : '🌿 Pausa', mins, color: focusMode === 'foco' ? '#7a5af0' : '#3fb985' }); S.timer.kind = focusMode; save(); };

/* ---------- Navegação ---------- */
function switchView(v) {
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  $('.top').style.display = v === 'hoje' ? '' : 'none';
  $('#fab').style.display = v === 'hoje' || v === 'tarefas' ? '' : 'none';
  if (v === 'rotinas') renderRoutines(); if (v === 'tarefas') renderTasks(); if (v === 'foco') renderFocus();
}
document.querySelector('.tabs').onclick = e => { const b = e.target.closest('button'); if (b) switchView(b.dataset.v); };
function renderAll() { renderDay(); renderTasks(); renderRoutines(); renderFocus(); showTimer(); }
renderAll();
setInterval(() => { if ($('#view-hoje').classList.contains('active') && !$('#evDlg').open) renderDay(); }, 60000);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
