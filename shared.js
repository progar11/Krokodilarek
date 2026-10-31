// shared.js — общая часть для всех страниц: Firebase, вход, профиль и монеты, магазин, утилиты
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, runTransaction, deleteField, collection, addDoc, getDocs, writeBatch, query, orderBy, limitToLast, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
export { signInWithPopup, GoogleAuthProvider, signOut, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, runTransaction, deleteField, collection, addDoc, getDocs, writeBatch, query, orderBy, limitToLast, Timestamp };

const firebaseConfig = {
  apiKey: "AIzaSyA1yt8qsvTZ2dYajtWXShhutaGBouCMP5w",
  authDomain: "poputka-2ab91.firebaseapp.com",
  projectId: "poputka-2ab91",
  storageBucket: "poputka-2ab91.firebasestorage.app",
  messagingSenderId: "261108566922",
  appId: "1:261108566922:web:ba7649d9dba2b709e91673",
  measurementId: "G-W3TQ8ZW128"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);   // ОДНА база на весь сайт: users (монеты, титулы) + отдельная коллекция комнат на каждую игру

export const MAX_PLAYERS = 10;
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const DECOR = {
  bomzh: { title: 'бомж', price: 15, cls: 'ttl-bomzh', desc: 'Коричневый титул — показывается рядом с твоим ником в профиле, комнате и чате.' },
  peerless: { title: 'Бесподобный', price: 100, cls: '', desc: 'Золотой титул — показывается рядом с твоим ником в профиле, комнате и чате.' },
  rich: { title: 'rich', price: 1000, cls: 'ttl-rich', desc: 'Зелёный титул — показывается рядом с твоим ником в профиле, комнате и чате.' }
};
export const titleOf = (id) => (id && DECOR[id]) ? DECOR[id].title : '';
export const nameHtml = (p) => esc(p.name) + (titleOf(p.title) ? ` <span class="ttl ${DECOR[p.title].cls || ''}">${esc(titleOf(p.title))}</span>` : '');

/* ===== Утилиты ===== */
export function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .25s, transform .25s'; el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; setTimeout(() => el.remove(), 260); }, 3200);
}
export function ask(text) {
  return new Promise(res => {
    $('modalText').textContent = text; $('modal').classList.remove('hidden');
    const done = (v) => { $('modal').classList.add('hidden'); $('modalYes').onclick = $('modalNo').onclick = null; res(v); };
    $('modalYes').onclick = () => done(true); $('modalNo').onclick = () => done(false);
  });
}
export const normCode = (s) => s.trim().toLowerCase().replace(/[\s\/\\.#?]+/g, '');
export const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const placeLabel = (n) => ['🥇', '🥈', '🥉'][n - 1] || `${n} место`;
export const initial = (n) => (n || '?').trim().charAt(0).toUpperCase();
export function avStyle(name) {
  let h = 0; for (const c of (name || '?')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `background:hsl(${h} 60% 80%);color:hsl(${h} 55% 25%)`;
}
export function errMsg(e) { return (e && e.message && !String(e.message).startsWith('Firebase')) ? e.message : 'Ошибка связи. Попробуй ещё раз.'; }
export function confetti() {
  const c = document.createElement('div'); c.className = 'confetti';
  const cols = ['#F29B2C', '#1F8A5B', '#2B6CB0', '#6A3FC8', '#DC4545', '#F7D046'];
  for (let i = 0; i < 48; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.background = cols[i % cols.length];
    s.style.animationDelay = (Math.random() * .6) + 's';
    s.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
    s.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    c.appendChild(s);
  }
  document.body.appendChild(c); setTimeout(() => c.remove(), 4200);
}


/* ===== Общая разметка: уведомления, окно «Да/Нет», магазин ===== */
document.body.insertAdjacentHTML('beforeend', `<div id="toasts"></div>
<div class="shop hidden" id="shopOv"><div class="shop-sheet" id="shopSheet">
  <div class="shop-top"><h3>🛒 Магазин</h3><div class="coins" id="shopCoins">🪙 0</div><button class="chat-close" style="background:#CBDACD;color:var(--text)" data-a="closeShop">✕</button></div>
  <div class="shop-tabs"><button data-a="shopTab" data-t="decor" id="tabDecor">✨ Украшения</button><button data-a="shopTab" data-t="scream" id="tabScream">😱 Скример</button></div>
  <div id="shopBody"></div>
</div></div>
<div class="modal hidden" id="modal"><div class="box"><p id="modalText"></p>
  <div class="btn-row"><button class="btn btn-slate" id="modalNo">Нет</button><button class="btn" id="modalYes">Да</button></div></div></div>`);

/* ===== Профиль игрока (users/{uid}) — монеты общие для всех игр ===== */
export const P = { user: null, name: '', coins: 0, owned: [], title: null, lastSpin: 0, spinning: false };
export const hooks = { scream: null, onTitle: null };   // игровые страницы подключают сюда вкладку «Скример» и синхронизацию титула
const profileHooks = [];
export const onProfile = (fn) => profileHooks.push(fn);
export const emitProfile = () => profileHooks.forEach(f => f());
export function paintCoins() {
  if (P.spinning) return;
  document.querySelectorAll('[data-coins]').forEach(el => { el.textContent = '🪙 ' + P.coins; });
}
function applyProfile(d) {
  P.name = d.name || P.name; P.coins = d.coins || 0; P.owned = d.owned || []; P.title = d.title || null; P.lastSpin = d.lastSpin || 0;
}
let userUnsub = null;
export function subscribeProfile() {
  if (userUnsub) userUnsub();
  userUnsub = onSnapshot(doc(db, 'users', P.user.uid), (us) => {
    if (!us.exists()) return;
    applyProfile(us.data()); paintCoins(); emitProfile();
    if (!$('shopOv').classList.contains('hidden')) renderShop();
  });
}
export function startSession({ onLoggedOut, onNoName, onReady, onError }) {
  onAuthStateChanged(auth, async (u) => {
    P.user = u;
    if (!u) {
      if (userUnsub) { userUnsub(); userUnsub = null; }
      Object.assign(P, { name: '', coins: 0, owned: [], title: null, lastSpin: 0 });
      closeShop(); onLoggedOut && onLoggedOut(); return;
    }
    try {
      const s = await getDoc(doc(db, 'users', u.uid));
      if (s.exists() && s.data().name) {
        applyProfile(s.data());
        if (s.data().coins === undefined) { try { await updateDoc(doc(db, 'users', u.uid), { coins: 0 }); } catch (e) {} }
        subscribeProfile();
      } else { onNoName && onNoName(); return; }
    } catch (e) { toast('Не удалось загрузить профиль. Проверь правила Firestore.', 'error'); onError && onError(); return; }
    onReady && onReady();
  });
}

/* ===== Клики (data-a) ===== */
const actions = {};
export const registerActions = (o) => Object.assign(actions, o);
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (el && actions[el.dataset.a]) actions[el.dataset.a](el);
});

/* ===== МАГАЗИН (украшения; вкладка «Скример» появляется только на игровых страницах) ===== */
let shopTab = 'decor';
export function openShop() { shopTab = 'decor'; $('tabScream').classList.toggle('hidden', !hooks.scream); $('shopOv').classList.remove('hidden'); renderShop(); }
export function closeShop() { $('shopOv').classList.add('hidden'); }
export function renderShop() {
  $('tabDecor').classList.toggle('on', shopTab === 'decor');
  $('tabScream').classList.toggle('on', shopTab === 'scream');
  paintCoins();
  const body = $('shopBody');
  if (shopTab === 'scream' && hooks.scream) { hooks.scream(body); return; }
  if (shopTab === 'decor') {
    body.innerHTML = Object.entries(DECOR).map(([id, it]) => {
      const owned = P.owned.includes(id), on = P.title === id;
      return `<div class="sitem"><div class="row"><div><span class="ttl ${it.cls || ''}" style="margin:0">${esc(it.title)}</span><small>${esc(it.desc)}</small></div>
        ${owned ? '' : `<span class="price">🪙 ${it.price}</span>`}</div>
        ${owned ? `<button class="btn ${on ? 'btn-soft' : 'btn-teal'} btn-sm" data-a="equipDecor" data-id="${id}">${on ? 'Снять' : 'Надеть'}</button>`
                : `<button class="btn btn-orange btn-sm" data-a="buyDecor" data-id="${id}" ${P.coins < it.price ? 'disabled' : ''}>${P.coins < it.price ? 'Не хватает монет' : 'Купить'}</button>`}
      </div>`;
    }).join('');
    return;
  }
}
async function buyDecor(el) {
  const id = el.dataset.id, it = DECOR[id]; if (!it) return;
  try {
    const uref = doc(db, 'users', P.user.uid);
    await runTransaction(db, async (tx) => {
      const d = (await tx.get(uref)).data() || {}, owned = d.owned || [], coins = d.coins || 0;
      if (owned.includes(id)) throw new Error('Это украшение уже куплено');
      if (coins < it.price) throw new Error('Не хватает монет');
      tx.update(uref, { coins: coins - it.price, owned: [...owned, id], title: id });
    });
    P.title = id; hooks.onTitle && hooks.onTitle(id); emitProfile();
    toast(`Куплено: «${it.title}» — титул надет`, 'success'); confetti();
  } catch (e) { toast(errMsg(e), 'error'); }
}
async function equipDecor(el) {
  const id = el.dataset.id, next = P.title === id ? null : id;
  try {
    await updateDoc(doc(db, 'users', P.user.uid), { title: next });
    P.title = next; hooks.onTitle && hooks.onTitle(next); emitProfile(); renderShop();
  } catch (e) { toast('Не удалось сохранить', 'error'); }
}
registerActions({
  openShop, closeShop, buyDecor, equipDecor,
  shopTab: (el) => { shopTab = el.dataset.t; renderShop(); }
});
$('shopOv').addEventListener('click', (e) => { if (e.target === $('shopOv')) closeShop(); });
