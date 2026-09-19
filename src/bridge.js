// Puente entre la interfaz (app.js) y Android: guardado, avisos, botón atrás y vibración.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();
const KEY = 'poquito-state-v1';

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clip = (s, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const defaultState = () => ({
  tasks: [],
  routines: [],
  settings: {
    morningEnabled: true,
    morningTime: '09:00',
    nudgeMinutes: 60,
    silent: true,
    mode: 'panel',
  },
  meta: {},
});

/* ---------- Guardado local ---------- */
async function readRaw() {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) return value;
  } catch { /* seguimos con localStorage */ }
  try { return localStorage.getItem(KEY); } catch { return null; }
}

let writeTimer = null;
function persist(state) {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    const value = JSON.stringify(state);
    try { await Preferences.set({ key: KEY, value }); }
    catch { try { localStorage.setItem(KEY, value); } catch { /* nada */ } }
  }, 200);
}

/* ---------- Avisos ---------- */
const CH_QUIET = 'poquito-quiet';
const CH_SOUND = 'poquito-sound';

async function ensureChannels() {
  if (!native) return;
  try {
    await LocalNotifications.createChannel({
      id: CH_QUIET, name: 'Avisos silenciosos',
      description: 'Recordatorios sin sonido ni vibración', importance: 2, vibration: false,
    });
    await LocalNotifications.createChannel({
      id: CH_SOUND, name: 'Avisos con sonido',
      description: 'Recordatorios con sonido', importance: 4, vibration: true,
    });
  } catch { /* nada */ }
}

async function hasPermission() {
  if (!native) return false;
  try { return (await LocalNotifications.checkPermissions()).display === 'granted'; } catch { return false; }
}

async function requestNotifications() {
  if (!native) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch { return false; }
}

async function testNotification(state) {
  if (!(await hasPermission())) return false;
  const channelId = state && state.settings && state.settings.silent === false ? CH_SOUND : CH_QUIET;
  await LocalNotifications.schedule({
    notifications: [{
      id: 9999, title: 'Así se ven los avisos', body: 'Suaves, sin prisa y sin culpa.',
      channelId, schedule: { at: new Date(Date.now() + 4000), allowWhileIdle: true },
    }],
  });
  return true;
}

// Los avisos se programan en el teléfono: funcionan sin internet y con la app cerrada.
let scheduling = false, again = null;
async function reschedule(state) {
  if (!native) return;
  if (scheduling) { again = state; return; }
  scheduling = true;
  try {
    if (!(await hasPermission())) return;
    const pending = await LocalNotifications.getPending();
    const mine = pending.notifications.filter((n) => n.id !== 9999);
    if (mine.length) await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) });

    const s = state.settings || {};
    const channelId = s.silent === false ? CH_SOUND : CH_QUIET;
    const now = new Date();
    const list = [];

    // Aviso de la mañana: los próximos 14 días (solo los días que tengan algo)
    if (s.morningEnabled && s.morningTime) {
      const [hh, mm] = s.morningTime.split(':').map(Number);
      for (let i = 0; i < 14; i++) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh, mm, 0);
        if (at <= now) continue;
        const key = dateKey(at);
        const open = state.tasks.filter((t) => t.status !== 'done' && t.date <= key);
        const routines = (state.routines || []).filter((r) =>
          key >= r.start && !(r.skip || []).includes(key) &&
          !state.tasks.some((t) => t.routineId === r.id && t.date === key)).length;
        const n = open.length + routines;
        if (n === 0) continue;
        list.push({
          id: 1000 + i,
          title: 'Tu día, poquito a poquito',
          body: n === 1 && open[0] ? `Hoy solo tienes una cosa: ${clip(open[0].text)}` : `Hoy tienes ${n} cosas pequeñas. Elige una, solo una.`,
          channelId, schedule: { at, allowWhileIdle: true },
        });
      }
    }

    // Recordatorio suave de lo que está en proceso (próximas 24 h, entre las 08:00 y las 21:00)
    const today = dateKey(now);
    const doing = state.tasks.filter((t) => t.status === 'doing' && t.date <= today);
    const every = Number(s.nudgeMinutes) || 0;
    if (every > 0 && doing.length) {
      let count = 0;
      for (let k = 1; k <= 96 && count < 10; k++) {
        const at = new Date(now.getTime() + k * every * 60000);
        if (at - now > 24 * 3600 * 1000) break;
        if (at.getHours() < 8 || at.getHours() >= 21) continue;
        list.push({
          id: 2000 + count,
          title: doing.length === 1 ? '¿Sigues con esto?' : `Tienes ${doing.length} en proceso`,
          body: doing.length === 1
            ? `${clip(doing[0].text)}\nMárcala como hecha cuando termines, o déjala para después.`
            : clip(doing.map((t) => t.text).join(' · '), 100),
          channelId, schedule: { at, allowWhileIdle: true },
        });
        count++;
      }
    }
    if (list.length) await LocalNotifications.schedule({ notifications: list });
  } catch (err) {
    console.warn('No se pudieron programar los avisos', err);
  } finally {
    scheduling = false;
    if (again) { const s = again; again = null; reschedule(s); }
  }
}

/* ---------- API para la interfaz ---------- */
let backCb = null, resumeCb = null;
let debounce = null;
let currentState = null;

window.api = {
  async load() {
    let state = defaultState();
    try {
      const raw = await readRaw();
      if (raw) {
        const p = JSON.parse(raw);
        const base = defaultState();
        state = {
          tasks: Array.isArray(p.tasks) ? p.tasks : [],
          routines: Array.isArray(p.routines) ? p.routines : [],
          settings: { ...base.settings, ...(p.settings || {}) },
          meta: { ...base.meta, ...(p.meta || {}) },
        };
      }
    } catch { /* datos ilegibles: empezamos limpio */ }
    currentState = state;
    await ensureChannels();
    reschedule(state);
    return { state, isPackaged: true };
  },

  save(state) {
    currentState = state;
    persist(state);
    // la primera vez que hay una tarea, pedimos permiso para los avisos
    if (native && state.tasks.length > 0 && !state.meta.notifAsked) {
      state.meta.notifAsked = true;
      persist(state);
      requestNotifications().then(() => reschedule(state));
    }
    clearTimeout(debounce);
    debounce = setTimeout(() => reschedule(state), 800);
  },

  requestNotifications,
  testNotification() { return testNotification(currentState); },
  haptic() { if (native) { Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); } else if (navigator.vibrate) navigator.vibrate(12); },
  onBack(cb) { backCb = cb; },
  onResume(cb) { resumeCb = cb; },
};

if (native) {
  App.addListener('backButton', () => {
    const handled = backCb ? backCb() : false;
    if (!handled) App.minimizeApp();
  });
  App.addListener('appStateChange', ({ isActive }) => { if (isActive && resumeCb) resumeCb(); });
}
