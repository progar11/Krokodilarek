// room.js — всё, что общее у «Крокодила» и «Бункера»: комнаты, чат, список игроков, скример, смена хода.
// Каждая игра подключает свою логику через initGame({...}).
import { $, esc, P, db, hooks, MAX_PLAYERS, nameHtml, normCode, placeLabel, initial, avStyle, toast, ask, errMsg, confetti,
  doc, updateDoc, deleteDoc, deleteField, onSnapshot, runTransaction, collection, addDoc, getDocs, writeBatch, query, orderBy, limitToLast, Timestamp,
  startSession, onProfile, paintCoins, registerActions, renderShop, closeShop } from './shared.js';

export const R = {
  cfg: null, code: null, room: null,
  ref: () => doc(db, R.cfg.collection, R.code),
  render: () => { if (R.room) render(); }
};
export const playersSorted = (r) => Object.entries(r.players).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.joinedAt - b.joinedAt);
const REACTIONS = ['👍', '🔥', '❤️', '💩', '👎'];
const SCREEN_IDS = ['gameMenu', 'createScreen', 'joinScreen', 'roomScreen'];
const LS = () => R.cfg.key + '_room';
const roomDoc = (code) => doc(db, R.cfg.collection, code);

const HTML = `<section id="gameMenu" class="container hidden">
  <div class="card">
    <div class="hello">
      <div class="avatar" id="gmAvatar"></div>
      <div style="flex:1;min-width:0"><h3 id="gmName"></h3><span class="muted" style="font-size:13px" id="gmSub"></span></div>
      <div class="coins" data-coins>🪙 0</div>
    </div>
  </div>
  <button class="btn" data-a="toCreate">🎲 Создать комнату</button>
  <button class="btn btn-blue" data-a="toJoin">🔑 Войти по коду</button>
  <button class="btn btn-orange" data-a="openShop">🛒 Магазин</button>
  <button class="btn btn-soft" data-a="backToHub" style="margin-top:18px">← В главное меню</button>
</section>

<!-- Создание -->
<section id="createScreen" class="container hidden">
  <div class="card">
    <h2 id="createTitle">Новая комната</h2>
    <label>Код команды (по нему зайдут друзья)</label>
    <input id="cCode" maxlength="20" placeholder="Например: друзья2026" autocomplete="off">
    <div id="themeWrap"><label>Общая тема игры</label>
    <input id="cTheme" maxlength="60" placeholder="Например: животные, фильмы, еда" autocomplete="off"></div>
    <p class="muted" style="font-size:13px" id="createHint"></p>
    <button class="btn" id="createBtn">Создать</button>
    <button class="btn btn-soft" data-a="toMenu">Назад</button>
  </div>
</section>

<!-- Вход по коду -->
<section id="joinScreen" class="container hidden">
  <div class="card">
    <h2>Вход в комнату</h2>
    <label>Код команды</label>
    <input id="jCode" maxlength="20" placeholder="Введи код" autocomplete="off">
    <button class="btn btn-blue" id="joinBtn">Войти</button>
    <button class="btn btn-soft" data-a="toMenu">Назад</button>
  </div>
</section>

<!-- Комната -->
<section id="roomScreen" class="container hidden">
  <div class="room-head">
    <div class="code-chip" data-a="copyCode" title="Нажми, чтобы скопировать">🔑 <span id="roomCode"></span></div>
    <div class="rh-r"><span class="badge" id="roomCount"></span><button class="shop-chip" data-a="openShop" title="Магазин">🛒</button></div>
  </div>
  <div class="theme"><b>Тема</b><span id="roomTheme"></span></div>
  <div id="roomBody"></div>
</section>
<!-- кнопка списка игроков (слева) -->
<button class="side-fab hidden" id="playersFab" data-a="openPlayers" title="Игроки и слова">👥</button>
<div class="drawer hidden" id="playersPanel">
  <div class="scrim" data-a="closePlayers"></div>
  <div class="sheet">
    <div class="sheet-top"><h3 id="plTitle">👥 Игроки и слова</h3><button class="chat-close" data-a="closePlayers">✕</button></div>
    <div id="playersList"></div>
  </div>
</div>

<button class="chat-fab hidden" id="chatFab" data-a="openChat">💬<span class="dot hidden" id="chatDot"></span></button>
<div class="chat hidden" id="chatPanel">
  <div class="chat-top"><h3>💬 Чат комнаты</h3><button class="chat-close" data-a="closeChat">✕</button></div>
  <div class="chat-hint">Нажми на сообщение, чтобы поставить реакцию</div>
  <div class="chat-msgs" id="chatMsgs"></div>
  <div class="chat-input"><input id="chatInput" maxlength="300" placeholder="Сообщение…" autocomplete="off"><button class="btn" data-a="sendChat">➤</button></div>
</div>
<!-- экран смены хода -->
<div class="turn-ov hidden" id="turnOv" data-a="closeTurn"><div class="turn-card" id="turnCard"></div></div>
<div class="scream hidden" id="screamOv"><img src="scream.jpg" alt=""><div id="screamTxt"></div></div>`;

let unsub = null, lastSig = '', lastStatus = null;
let screamSeen = null, screamInit = false, screamTimer = null, scrTarget = null, scrText = '';

/* ===== Экраны ===== */
export function setPlayingUI(on) {
  $('playersFab').classList.toggle('hidden', !on);
  if (!on) { $('playersPanel').classList.add('hidden'); $('playersPanel').classList.remove('closing'); }
}
export function show(id) {
  SCREEN_IDS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  if (id !== 'roomScreen') { R.cfg.resetRoomUI && R.cfg.resetRoomUI(); setPlayingUI(false); }
  $('chatFab').classList.toggle('hidden', id !== 'roomScreen');
  window.scrollTo(0, 0);
}
export function showMenu() { paintGameMenu(); paintCoins(); show('gameMenu'); }
function paintGameMenu() {
  $('gmName').innerHTML = nameHtml({ name: P.name, title: P.title });
  $('gmAvatar').textContent = initial(P.name); $('gmAvatar').style.cssText = avStyle(P.name);
}
function openCreate() {
  const c = R.cfg;
  $('createTitle').textContent = 'Новая комната — ' + c.title;
  $('themeWrap').classList.toggle('hidden', !c.needTheme);
  $('createHint').textContent = `До ${MAX_PLAYERS} игроков. Начать можно, когда зашли минимум ${c.minPlayers}.`;
  show('createScreen');
}

/* ===== Экран смены хода ===== */
let ovTimer = null;
export function openTurnOv(html, ms, vibrate) {
  $('turnCard').innerHTML = html;
  $('turnOv').classList.remove('hidden', 'out');
  clearTimeout(ovTimer); ovTimer = setTimeout(closeTurn, ms);
  if (vibrate) { try { navigator.vibrate && navigator.vibrate([80, 40, 80]); } catch (e) {} }
}
export function closeTurn() {
  clearTimeout(ovTimer);
  const ov = $('turnOv'); if (ov.classList.contains('hidden')) return;
  ov.classList.add('out');
  setTimeout(() => { if (ov.classList.contains('out')) { ov.classList.add('hidden'); ov.classList.remove('out'); } }, 400);
}

/* ===== Создание и вход в комнату ===== */
async function createRoom() {
  const c = R.cfg;
  const code = normCode($('cCode').value), theme = c.needTheme ? $('cTheme').value.trim() : c.title;
  if (code.length < 3) return toast('Код: минимум 3 символа (без пробелов)', 'error');
  if (c.needTheme && theme.length < 2) return toast('Укажи общую тему игры', 'error');
  $('createBtn').disabled = true;
  try {
    const ref = roomDoc(code);
    await runTransaction(db, async (tx) => {
      const s = await tx.get(ref);
      if (s.exists()) throw new Error('Такой код уже занят, придумай другой');
      tx.set(ref, {
        code, theme, game: c.key, hostId: P.user.uid, status: 'lobby', createdAt: Date.now(),
        players: { [P.user.uid]: { name: P.name, joinedAt: Date.now(), word: null, place: null, title: P.title || null } },
        words: {}, order: [], turn: null, placeCount: 0, lastEvent: '',
        expireAt: Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000)
      });
    });
    $('cCode').value = ''; $('cTheme').value = '';
    enterRoom(code);
  } catch (e) { toast(errMsg(e), 'error'); }
  $('createBtn').disabled = false;
}
async function joinRoom() {
  const code = normCode($('jCode').value);
  if (!code) return toast('Введи код', 'error');
  $('joinBtn').disabled = true;
  try {
    const ref = roomDoc(code);
    await runTransaction(db, async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists()) throw new Error('Комната с таким кодом не найдена');
      const d = s.data();
      if (d.players[P.user.uid]) return;
      if (d.status !== 'lobby') throw new Error('Игра уже началась');
      if (Object.keys(d.players).length >= MAX_PLAYERS) throw new Error('Комната заполнена (10/10)');
      tx.update(ref, { ['players.' + P.user.uid]: { name: P.name, joinedAt: Date.now(), word: null, place: null, title: P.title || null } });
    });
    $('jCode').value = '';
    enterRoom(code);
  } catch (e) { toast(errMsg(e), 'error'); }
  $('joinBtn').disabled = false;
}

function enterRoom(code, silent) {
  if (unsub) unsub();
  R.code = code; R.room = null; lastSig = ''; lastStatus = null; screamInit = false; screamSeen = null; scrTarget = null;
  R.cfg.onReset && R.cfg.onReset();
  try { const im = new Image(); im.src = 'scream.jpg'; if (screamAudio) screamAudio.load(); } catch (e) {}
  try { localStorage.setItem(LS(), code); } catch (e) {}
  startChat(code);
  let first = true;
  unsub = onSnapshot(roomDoc(code), (snap) => {
    if (!snap.exists()) { leaveLocal(); showMenu(); if (!(first && silent)) toast('Комната закрыта или не найдена'); first = false; return; }
    const d = snap.data();
    if (!d.players[P.user.uid]) { leaveLocal(); showMenu(); toast('Тебя нет в этой комнате'); first = false; return; }
    first = false; R.room = d; render();
  }, () => { leaveLocal(); showMenu(); toast('Нет доступа к комнате', 'error'); });
}
function leaveLocal() {
  if (unsub) { unsub(); unsub = null; }
  stopChat();
  R.room = null; R.code = null; lastSig = ''; lastStatus = null; screamInit = false; screamSeen = null; scrTarget = null;
  R.cfg.onReset && R.cfg.onReset();
  try { localStorage.removeItem(LS()); } catch (e) {}
  R.cfg.resetRoomUI && R.cfg.resetRoomUI(); setPlayingUI(false);
  clearTimeout(ovTimer); $('turnOv').classList.add('hidden'); $('turnOv').classList.remove('out');
  $('roomScreen').classList.remove('playing');
  if (P.user && !$('roomScreen').classList.contains('hidden')) showMenu();
}

/* ===== Общие действия комнаты ===== */
async function toLobby() {
  try {
    await runTransaction(db, async (tx) => {
      const ref = R.ref(), s = await tx.get(ref), d = s.data();
      const players = {};
      Object.entries(d.players).forEach(([id, p]) => { players[id] = { name: p.name, joinedAt: p.joinedAt, word: null, place: null, title: p.title || null }; });
      tx.update(ref, { players, status: 'lobby', words: {}, order: [], turn: null, placeCount: 0, lastEvent: '', bunker: null, phase: null, round: 0, revealed: [], votes: {} });
    });
  } catch (e) { toast(errMsg(e), 'error'); }
}
async function finishGame() {
  if (!(await ask('Завершить игру для всех?'))) return;
  try { await updateDoc(R.ref(), { status: 'finished', turn: null, lastEvent: 'Игра завершена ведущим' }); }
  catch (e) { toast('Ошибка', 'error'); }
}
async function wipeRoom(code) {
  // сначала сообщения, потом сама комната — в базе не остаётся ничего
  const snap = await getDocs(collection(db, R.cfg.collection, code, 'messages'));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const b = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach(d => b.delete(d.ref));
    await b.commit();
  }
  await deleteDoc(roomDoc(code));
}
async function leaveRoom() {
  const code = R.code, r = R.room;
  const alone = r && Object.keys(r.players).length === 1 && r.hostId === P.user.uid;
  const lobbyGuest = r && r.status === 'lobby' && r.hostId !== P.user.uid;
  if (lobbyGuest) { try { await updateDoc(roomDoc(code), { ['players.' + P.user.uid]: deleteField() }); } catch (e) {} }
  leaveLocal(); showMenu();
  if (alone) { try { await wipeRoom(code); } catch (e) {} }   // последний игрок ушёл — комната удаляется
}
async function closeRoom() {
  if (!(await ask('Закрыть комнату? Комната и весь чат будут удалены.'))) return;
  try { await wipeRoom(R.code); } catch (e) { toast('Не удалось закрыть комнату', 'error'); }
}

/* ===== Чат и реакции ===== */
let chatUnsub = null, chatOpen = false, chatInit = false, unread = 0, msgs = {};
function updateDot() { const d = $('chatDot'); d.textContent = unread > 9 ? '9+' : unread; d.classList.toggle('hidden', unread === 0); }
function chatBottom() { const b = $('chatMsgs'); b.scrollTop = b.scrollHeight; }

function paintRx(id) {
  const o = msgs[id]; if (!o) return;
  const rx = o.data.reactions || {}, counts = {};
  Object.values(rx).forEach(e => { counts[e] = (counts[e] || 0) + 1; });
  const mine = rx[P.user.uid];
  o.el.querySelector('.rxs').innerHTML = REACTIONS.filter(e => counts[e])
    .map(e => `<button class="rx ${mine === e ? 'mine' : ''}" data-a="react" data-id="${id}" data-e="${e}">${e}<span>${counts[e]}</span></button>`).join('');
  o.el.querySelector('.picker').innerHTML = REACTIONS
    .map(e => `<button class="pk ${mine === e ? 'on' : ''}" data-a="react" data-id="${id}" data-e="${e}">${e}</button>`).join('');
}
function appendMsg(id, m) {
  const box = $('chatMsgs');
  const empty = box.querySelector('.chat-empty'); if (empty) empty.remove();
  const el = document.createElement('div');
  const mine = m.uid === P.user.uid;
  el.className = 'msg' + (mine ? ' mine' : ''); el.dataset.a = 'togglePick';
  el.innerHTML = (mine ? '' : `<div class="who">${nameHtml({ name: m.name, title: m.title })}</div>`) + `<div class="txt">${esc(m.text)}</div><div class="rxs"></div><div class="picker"></div>`;
  box.appendChild(el);
  msgs[id] = { el, data: m }; paintRx(id);
  while (box.children.length > 150) box.removeChild(box.firstChild);
}
function startChat(code) {
  stopChat(); chatInit = false; unread = 0; msgs = {}; updateDot();
  $('chatMsgs').innerHTML = '<div class="chat-empty">Сообщений пока нет.<br>Напиши первым 👋</div>';
  const q = query(collection(db, R.cfg.collection, code, 'messages'), orderBy('t'), limitToLast(100));
  chatUnsub = onSnapshot(q, (snap) => {
    let added = false;
    snap.docChanges().forEach(ch => {
      const id = ch.doc.id;
      if (ch.type === 'added') {
        const m = ch.doc.data(); appendMsg(id, m); added = true;
        if (chatInit && !chatOpen && m.uid !== P.user.uid) unread++;
      } else if (ch.type === 'modified') {
        if (msgs[id]) { msgs[id].data = ch.doc.data(); paintRx(id); }
      } else if (ch.type === 'removed') {
        if (msgs[id]) { msgs[id].el.remove(); delete msgs[id]; }
      }
    });
    chatInit = true; updateDot(); if (chatOpen && added) chatBottom();
  }, () => {});
}
function stopChat() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  chatOpen = false; unread = 0; $('chatPanel').classList.add('hidden');
}
async function sendChat() {
  const inp = $('chatInput'), text = inp.value.trim();
  if (!text || !R.code) return;
  inp.value = ''; inp.focus();
  try {
    await addDoc(collection(db, R.cfg.collection, R.code, 'messages'), {
      uid: P.user.uid, name: P.name, title: P.title || null, text: text.slice(0, 300), t: Date.now(),
      expireAt: Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000)
    });
  } catch (e) { toast('Сообщение не отправлено', 'error'); }
}
function togglePick(el) {
  const was = el.classList.contains('picking');
  document.querySelectorAll('.msg.picking').forEach(x => x.classList.remove('picking'));
  if (!was) { el.classList.add('picking'); setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30); }
}
async function react(el) {
  const id = el.dataset.id, e = el.dataset.e, o = msgs[id];
  if (!o || !R.code) return;
  const cur = (o.data.reactions || {})[P.user.uid];
  o.el.classList.remove('picking');
  try {
    await updateDoc(doc(db, R.cfg.collection, R.code, 'messages', id), { ['reactions.' + P.user.uid]: cur === e ? deleteField() : e });
  } catch (err) { toast('Не удалось поставить реакцию', 'error'); }
}

/* ===== Карточка игрока ===== */
export function playerCard(p, r, opts = {}) {
  const isTurn = r.status === 'playing' && r.turn === p.id && p.place == null;
  let word = '';
  if (r.status === 'playing' || r.status === 'finished') {
    if (p.word) {
      if (p.id === P.user.uid && p.place == null && r.status === 'playing') word = '<div class="word">🙈 Своё слово не видно</div>';
      else word = `<div class="word">Слово: <b>${esc(p.word)}</b></div>`;
    }
  }
  const badges = [
    r.hostId === p.id ? '<span class="badge">👑 ведущий</span>' : '',
    isTurn ? '<span class="badge turn">ХОД</span>' : '',
    p.place != null ? `<span class="badge place">${placeLabel(p.place)}</span>` : ''
  ].join('');
  const anim = opts.i != null ? `rise" style="--i:${opts.i}` : '';
  return `<div class="player ${isTurn ? 'turn' : ''} ${p.place != null ? 'done' : ''} ${anim}">
    <div class="avatar" style="${avStyle(p.name)}">${esc(initial(p.name))}</div>
    <div class="info"><div class="name">${nameHtml(p)}${p.id === P.user.uid ? ' <span class="muted" style="font-weight:500">(ты)</span>' : ''} ${badges}</div>${word}${opts.extra || ''}</div>
  </div>`;
}

/* ===== Отрисовка комнаты (общая шапка, дальше — render игры) ===== */
function render() {
  const r = R.room, isHost = r.hostId === P.user.uid, me = r.players[P.user.uid];
  checkScream(r);
  const list = playersSorted(r);
  const sig = [r.status, r.turn, list.length, r.placeCount, r.words ? Object.keys(r.words).length : 0].join('|');
  const still = sig === lastSig; lastSig = sig;
  const prevStatus = lastStatus; lastStatus = r.status;
  $('roomCode').textContent = r.code; $('roomTheme').textContent = r.theme;
  $('roomCount').textContent = `👥 ${list.length}/${MAX_PLAYERS}`;
  show('roomScreen');
  $('roomScreen').classList.toggle('playing', r.status === 'playing');
  R.cfg.resetRoomUI && R.cfg.resetRoomUI(); setPlayingUI(r.status === 'playing');
  const body = $('roomBody');
  body.classList.toggle('still', still);
  $('roomScreen').classList.toggle('bunker', R.cfg.key === 'bunker');
  $('plTitle').textContent = R.cfg.playersTitle;
  R.cfg.render({ r, list, me, isHost, still, prevStatus, body });
}

/* ===== Скример (покупается в магазине, работает в обеих играх) ===== */
const SCREAM_PRICE = 10;
const screamAudio = (() => { try { const a = new Audio('scream.mp3'); a.preload = 'auto'; return a; } catch (e) { return null; } })();
// браузеры разрешают звук только после касания — «разблокируем» его при первом нажатии
document.addEventListener('pointerdown', () => {
  if (!screamAudio) return;
  try { screamAudio.muted = true; const p = screamAudio.play(); (p || Promise.resolve()).then(() => { screamAudio.pause(); screamAudio.currentTime = 0; screamAudio.muted = false; }).catch(() => { screamAudio.muted = false; }); } catch (e) {}
}, { once: true });
function showScream(sc) {
  $('screamTxt').textContent = sc.text || '';
  $('screamOv').classList.remove('hidden');
  try { navigator.vibrate && navigator.vibrate([200, 80, 200]); } catch (e) {}
  if (screamAudio) { try { screamAudio.muted = false; screamAudio.currentTime = 0; screamAudio.volume = 1; const p = screamAudio.play(); p && p.catch(() => {}); } catch (e) {} }
  clearTimeout(screamTimer);
  screamTimer = setTimeout(() => { $('screamOv').classList.add('hidden'); if (screamAudio) { try { screamAudio.pause(); } catch (e) {} } }, 3000);
}
function checkScream(r) {
  const sc = r.scream;
  if (!screamInit) { screamInit = true; screamSeen = sc ? sc.id : null; return; }   // старый скример при входе не показываем
  if (!sc || sc.id === screamSeen) return;
  screamSeen = sc.id;
  if (sc.to === P.user.uid && r.status === 'playing') showScream(sc);
}
function renderScreamTab(body) {
  const r = R.room;
  if (!r || r.status !== 'playing') {
    body.innerHTML = `<div class="sitem"><b>😱 Скример</b><small>Доступен только во время игры. Зайди в комнату, когда игра начнётся.</small></div>`;
    return;
  }
  const others = playersSorted(r).filter(p => p.id !== P.user.uid);
  if (scrTarget && !others.some(p => p.id === scrTarget)) scrTarget = null;
  body.innerHTML = `<div class="sitem"><div class="row"><b>😱 Скример</b><span class="price">🪙 ${SCREAM_PRICE}</span></div>
    <small>Выбери игрока и текст — у него на весь экран появится страшная картинка на 3 секунды.</small>
    <div class="tgt">${others.map(p => `<button class="${scrTarget === p.id ? 'on' : ''}" data-a="scrTarget" data-id="${p.id}">${esc(p.name)}</button>`).join('') || '<span class="muted">Других игроков нет</span>'}</div>
    <input id="scrText" maxlength="60" placeholder="Текст вместе со скримером" autocomplete="off" value="${esc(scrText)}">
    <button class="btn btn-orange btn-sm" data-a="buyScream" ${P.coins < SCREAM_PRICE ? 'disabled' : ''}>${P.coins < SCREAM_PRICE ? 'Не хватает монет' : 'Отправить скример'}</button></div>`;
}
async function buyScream() {
  const text = ($('scrText') ? $('scrText').value : scrText).trim().replace(/\s+/g, ' ');
  if (!scrTarget) return toast('Выбери игрока', 'error');
  if (!text) return toast('Напиши текст для скримера', 'error');
  const target = scrTarget;
  try {
    const uref = doc(db, 'users', P.user.uid), rref = R.ref();
    await runTransaction(db, async (tx) => {
      const us = await tx.get(uref), rs = await tx.get(rref);
      if (!rs.exists()) throw new Error('Комната не найдена');
      const d = rs.data();
      if (d.status !== 'playing') throw new Error('Скример можно отправить только во время игры');
      if (!d.players[target]) throw new Error('Игрок уже вышел');
      const coins = (us.data() || {}).coins || 0;
      if (coins < SCREAM_PRICE) throw new Error('Не хватает монет');
      tx.update(uref, { coins: coins - SCREAM_PRICE });
      tx.update(rref, { scream: { id: Date.now() + '-' + P.user.uid.slice(0, 5), to: target, from: P.user.uid, fromName: P.name, text: text.slice(0, 60), t: Date.now() } });
    });
    scrText = ''; toast('😱 Скример отправлен!', 'success'); renderShop();
  } catch (e) { toast(errMsg(e), 'error'); }
}
async function syncTitleToRoom(id) {
  if (!R.code || !R.room || !R.room.players[P.user.uid]) return;
  try { await updateDoc(R.ref(), { ['players.' + P.user.uid + '.title']: id || null }); } catch (e) {}
}
document.addEventListener('input', (e) => { if (e.target.id === 'scrText') scrText = e.target.value; });

/* ===== Запуск страницы игры ===== */
function closePlayers() {
  const p = $('playersPanel'); if (p.classList.contains('hidden')) return;
  p.classList.add('closing');
  setTimeout(() => { if (p.classList.contains('closing')) { p.classList.add('hidden'); p.classList.remove('closing'); } }, 230);
}
export function initGame(cfg) {
  R.cfg = cfg;
  document.body.insertAdjacentHTML('beforeend', HTML);
  $('gmSub').textContent = cfg.icon + ' ' + cfg.title;
  document.title = cfg.title + ' — Крокодил Арек';
  hooks.scream = renderScreamTab; hooks.onTitle = syncTitleToRoom;
  onProfile(() => { if (!$('gameMenu').classList.contains('hidden')) paintGameMenu(); });
  $('createBtn').onclick = createRoom; $('joinBtn').onclick = joinRoom;
  registerActions(Object.assign({
    toCreate: openCreate, toJoin: () => show('joinScreen'), toMenu: () => showMenu(),
    backToHub: () => { location.href = 'index.html'; },
    copyCode: async () => { try { await navigator.clipboard.writeText(R.code); toast('Код скопирован', 'success'); } catch (e) { toast('Код: ' + R.code); } },
    start: () => cfg.start(),
    openChat: () => { chatOpen = true; unread = 0; updateDot(); $('chatPanel').classList.remove('hidden'); chatBottom(); },
    closeChat: () => { chatOpen = false; $('chatPanel').classList.add('hidden'); },
    openPlayers: () => { $('playersPanel').classList.remove('hidden', 'closing'); },
    closePlayers, closeTurn, togglePick, react, sendChat,
    toLobby: () => toLobby(), finish: finishGame, leave: leaveRoom, closeRoom,
    scrTarget: (el) => { scrTarget = scrTarget === el.dataset.id ? null : el.dataset.id; renderShop(); },
    buyScream
  }, cfg.actions || {}));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'jCode') $('joinBtn').click();
    if (e.target.id === 'chatInput') sendChat();
  });
  startSession({
    onLoggedOut: () => location.replace('index.html'),
    onNoName: () => location.replace('index.html'),
    onError: () => showMenu(),
    onReady: () => {
      showMenu();
      let saved = null; try { saved = localStorage.getItem(LS()); } catch (e) {}
      if (saved) enterRoom(saved, true);
    }
  });
}
