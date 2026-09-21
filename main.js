const {
  app, BrowserWindow, Tray, Menu, Notification, ipcMain,
  screen, globalShortcut, nativeImage, safeStorage,
} = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Poquito');
app.setAppUserModelId('com.poquito.app');

// Conservar los datos de la versión anterior (Pastillas)
{
  const fsx = require('fs');
  const pathx = require('path');
  const appData = app.getPath('appData');
  const newDir = pathx.join(appData, 'Poquito');
  const oldDir = pathx.join(appData, 'pastillas');
  app.setPath('userData', newDir);
  try {
    if (!fsx.existsSync(pathx.join(newDir, 'poquito.json')) &&
        fsx.existsSync(pathx.join(oldDir, 'pastillas.json'))) {
      fsx.mkdirSync(newDir, { recursive: true });
      fsx.copyFileSync(pathx.join(oldDir, 'pastillas.json'), pathx.join(newDir, 'poquito.json'));
    }
  } catch { /* si falla, empezamos limpio */ }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

/* ---------- Constantes ---------- */
const MARGIN = 12;                    // espacio transparente para la sombra
const PANEL_W = 380 + MARGIN * 2;
const PANEL_H = 600 + MARGIN * 2;
const STICKER_W = 320 + MARGIN * 2;
const STICKER_MIN_H = 170;
const STICKER_MAX_H = 560;
const BAR_DEFAULT_RIGHT = 330;       // distancia del chip al borde derecho (junto a la bandeja)
const BAR_MIN_W = 150;
const BAR_MAX_W = 330;
const NUDGE_FROM_HOUR = 8;            // no molestar antes de las 08:00
const NUDGE_UNTIL_HOUR = 21;          // ni después de las 21:00

/* ---------- Diagnóstico (solo eventos del chip, sin datos de tareas) ---------- */
function dlog(msg) {
  try {
    const f = path.join(app.getPath('userData'), 'poquito-debug.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 40000) fs.writeFileSync(f, '');
    fs.appendFileSync(f, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* nada */ }
}

/* ---------- Estado ---------- */
const DEFAULT_STATE = () => ({
  tasks: [],
  routines: [],
  energy: {},
  energyAt: {},
  tomb: {},
  jar: [],
  settings: {
    morningEnabled: true,
    morningTime: '09:00',
    nudgeMinutes: 60,
    silent: true,
    autostart: false,
    mode: 'panel',
    showInTaskbar: true,
    capacityOn: true,
    reward: 'soft',
    lastEnergy: 'mid',
    lastSize: 'M',
  },
  meta: { lastMorning: '', stickerBounds: null, barRight: null },
});

let state = DEFAULT_STATE();
let win = null;
let barWin = null;
let barW = 220;
let barDrag = null;
let tray = null;
let lastBlurHide = 0;
let lastNudge = Date.now();
let doingSignature = '';
let writeTimer = null;
let quitting = false;

const dataFile = () => path.join(app.getPath('userData'), 'poquito.json');

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    const base = DEFAULT_STATE();
    state = {
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      routines: Array.isArray(raw.routines) ? raw.routines : [],
      energy: raw.energy && typeof raw.energy === 'object' ? raw.energy : {},
      energyAt: raw.energyAt && typeof raw.energyAt === 'object' ? raw.energyAt : {},
      tomb: raw.tomb && typeof raw.tomb === 'object' ? raw.tomb : {},
      jar: Array.isArray(raw.jar) ? raw.jar : [],
      settings: { ...base.settings, ...(raw.settings || {}) },
      meta: { ...base.meta, ...(raw.meta || {}) },
    };
  } catch {
    state = DEFAULT_STATE();
  }
}

function writeNow() {
  clearTimeout(writeTimer);
  writeTimer = null;
  try {
    fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, dataFile());
  } catch (err) {
    console.error('No se pudo guardar:', err);
  }
}

function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeNow, 300);
}

/* ---------- Utilidades de fecha ---------- */
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function openTasksForToday() {
  const today = dateKey();
  return state.tasks.filter((t) => t.status !== 'done' && t.date <= today);
}
function doingTasks() {
  const today = dateKey();
  return state.tasks.filter((t) => t.status === 'doing' && t.date <= today);
}

/* ---------- Ventana ---------- */
function workAreaNearCursor() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
}

function placePanel() {
  const barShown = barWin && barWin.isVisible();
  const wa = barShown ? screen.getPrimaryDisplay().workArea : workAreaNearCursor();
  let x = wa.x + wa.width - PANEL_W + MARGIN - 8;
  if (barShown) {
    const b = barWin.getBounds();
    x = Math.round(b.x + b.width / 2 - PANEL_W / 2);
    x = Math.min(Math.max(x, wa.x - MARGIN + 8), wa.x + wa.width - PANEL_W + MARGIN - 8);
  }
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.setBounds({
    x,
    y: wa.y + wa.height - PANEL_H + MARGIN - 8,
    width: PANEL_W,
    height: PANEL_H,
  });
}

function placeSticker() {
  const saved = state.meta.stickerBounds;
  const wa = workAreaNearCursor();
  let x = wa.x + wa.width - STICKER_W - 16;
  let y = wa.y + 16;
  if (saved && typeof saved.x === 'number') {
    // Solo reutilizar la posición si sigue dentro de alguna pantalla
    const visible = screen.getAllDisplays().some((d) => {
      const b = d.workArea;
      return saved.x >= b.x - 40 && saved.x < b.x + b.width - 60 &&
             saved.y >= b.y - 10 && saved.y < b.y + b.height - 60;
    });
    if (visible) { x = saved.x; y = saved.y; }
  }
  const h = Math.min(Math.max(win.getBounds().height, STICKER_MIN_H), STICKER_MAX_H);
  win.setAlwaysOnTop(true, 'floating');
  win.setBounds({ x, y, width: STICKER_W, height: h });
}

function applyMode(mode) {
  if (!win) return;
  if (mode === 'sticker') {
    placeSticker();
    win.show();
  } else {
    placePanel();
    win.show();
    win.focus();
  }
  win.webContents.send('focus-input');
}

function showWindow() {
  if (!win) return;
  if (state.settings.mode === 'sticker') {
    win.show();
  } else {
    placePanel();
    win.show();
    win.focus();
  }
  win.webContents.send('focus-input');
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && (state.settings.mode === 'sticker' || win.isFocused())) {
    win.hide();
    return;
  }
  // Si el panel se acaba de ocultar por perder el foco al hacer clic en la
  // bandeja, no lo volvemos a abrir.
  if (Date.now() - lastBlurHide < 250) return;
  showWindow();
}

function createWindow() {
  win = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.on('blur', () => {
    if (state.settings.mode === 'panel' && win.isVisible() &&
        !win.webContents.isDevToolsOpened()) {
      lastBlurHide = Date.now();
      win.hide();
    }
  });

  win.on('moved', () => {
    if (state.settings.mode === 'sticker') {
      const b = win.getBounds();
      state.meta.stickerBounds = { x: b.x, y: b.y };
      scheduleWrite();
    }
  });

  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });

  win.webContents.once('did-finish-load', () => {
    if (state.settings.mode === 'sticker') applyMode('sticker');
  });
}


/* ---------- Chip en la barra de tareas ---------- */
function taskbarGeometry() {
  const d = screen.getPrimaryDisplay();
  const b = d.bounds, wa = d.workArea;
  let h = b.y + b.height - (wa.y + wa.height);      // alto de la barra si está abajo
  if (h < 24) h = 44;                                // oculta o en otro borde: franja de respaldo
  return { left: b.x, right: b.x + b.width, y: b.y + b.height - h, h };
}

function placeBar() {
  if (!barWin) return;
  const g = taskbarGeometry();
  const maxOff = g.right - g.left - barW;
  const off = Math.min(Math.max(state.meta.barRight ?? BAR_DEFAULT_RIGHT, 0), maxOff);
  barWin.setBounds({ x: Math.round(g.right - off - barW), y: g.y, width: barW, height: g.h });
}

function syncBar() {
  if (!barWin) return;
  if (state.settings.showInTaskbar) {
    placeBar();
    barWin.showInactive();
    barWin.moveTop();
    sendBar();
  } else {
    barWin.hide();
  }
}

function barSummary() {
  const today = dateKey();
  const todayTasks = state.tasks.filter((t) => t.date <= today && (t.status !== 'done' || t.date === today));
  const open = state.tasks
    .filter((t) => t.status !== 'done' && t.date <= today)
    .sort((a, b) => (a.status === 'doing' ? 0 : 1) - (b.status === 'doing' ? 0 : 1) ||
      (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  const cur = open[0];
  return {
    id: cur ? cur.id : null,
    text: cur ? cur.text : '',
    status: cur ? cur.status : null,
    more: Math.max(open.length - 1, 0),
    state: cur ? 'task' : (todayTasks.length ? 'alldone' : 'empty'),
  };
}

function sendBar() {
  if (barWin && !barWin.isDestroyed()) barWin.webContents.send('bar:update', barSummary());
}

function createBarWindow() {
  barWin = new BrowserWindow({
    width: barW,
    height: 44,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  barWin.setAlwaysOnTop(true, 'screen-saver');
  barWin.loadFile(path.join(__dirname, 'src', 'bar.html'));
  barWin.webContents.once('did-finish-load', syncBar);

  // La barra de tareas de Windows se sube al frente al usarla: recuperamos el primer plano.
  setInterval(() => {
    if (barWin && barWin.isVisible()) barWin.moveTop();
  }, 1500);

  screen.on('display-metrics-changed', () => { if (barWin && barWin.isVisible()) placeBar(); });
  screen.on('display-added', () => { if (barWin && barWin.isVisible()) placeBar(); });
  screen.on('display-removed', () => { if (barWin && barWin.isVisible()) placeBar(); });
}

function patchSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  scheduleWrite();
  if (win && !win.isDestroyed()) win.webContents.send('patch-settings', patch);
  syncBar();
}

/* ---------- Bandeja ---------- */
function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico'));
  tray = new Tray(img);
  tray.setToolTip('Poquito');
  tray.on('click', toggleWindow);
  tray.on('right-click', () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir Poquito', click: showWindow },
      {
        label: state.settings.mode === 'sticker' ? 'Volver al panel' : 'Fijar en el escritorio',
        click: () => win.webContents.send('request-mode',
          state.settings.mode === 'sticker' ? 'panel' : 'sticker'),
      },
      {
        label: 'Mostrar en la barra de tareas',
        type: 'checkbox',
        checked: !!state.settings.showInTaskbar,
        click: (item) => patchSettings({ showInTaskbar: item.checked }),
      },
      { type: 'separator' },
      { label: 'Salir', click: () => { quitting = true; app.quit(); } },
    ]));
  });
}

function updateTrayTooltip() {
  if (!tray) return;
  const n = openTasksForToday().length;
  tray.setToolTip(n === 0 ? 'Poquito · nada pendiente hoy'
    : `Poquito · ${n} ${n === 1 ? 'pendiente' : 'pendientes'} hoy`);
}

/* ---------- Avisos ---------- */
function notify(title, body) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title,
    body,
    silent: state.settings.silent,
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });
  n.on('click', showWindow);
  n.show();
}

const clip = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function tick() {
  const now = new Date();
  const today = dateKey(now);
  const s = state.settings;

  // Aviso de la mañana (una vez al día)
  if (s.morningEnabled && s.morningTime && state.meta.lastMorning !== today &&
      hhmm(now) >= s.morningTime) {
    state.meta.lastMorning = today;
    scheduleWrite();
    const open = openTasksForToday();
    if (open.length > 0) {
      notify(
        'Tu día, poquito a poquito',
        open.length === 1
          ? `Hoy solo tienes una cosa: ${clip(open[0].text)}`
          : `Hoy tienes ${open.length} cosas pequeñas. Elige una, solo una.`
      );
    }
  }

  // Recordatorio suave de lo que está en proceso
  const doing = doingTasks();
  const sig = doing.map((t) => t.id).sort().join(',');
  if (sig !== doingSignature) { doingSignature = sig; lastNudge = Date.now(); }

  if (s.nudgeMinutes > 0 && doing.length > 0 &&
      now.getHours() >= NUDGE_FROM_HOUR && now.getHours() < NUDGE_UNTIL_HOUR &&
      Date.now() - lastNudge >= s.nudgeMinutes * 60000) {
    lastNudge = Date.now();
    if (doing.length === 1) {
      notify('¿Sigues con esto?', `${clip(doing[0].text)}\nMárcala como hecha cuando termines, o déjala para después.`);
    } else {
      notify(`Tienes ${doing.length} en proceso`, clip(doing.map((t) => t.text).join(' · '), 100));
    }
  }

  updateTrayTooltip();
  sendBar();
}

/* ---------- Inicio con Windows ---------- */
function applyLoginItem() {
  if (!app.isPackaged) return;      // en modo desarrollo no registramos nada
  app.setLoginItemSettings({ openAtLogin: !!state.settings.autostart });
}

/* ---------- IPC ---------- */
ipcMain.handle('state:load', () => ({
  state,
  isPackaged: app.isPackaged,
}));

ipcMain.on('state:save', (_e, incoming) => {
  if (!incoming || !Array.isArray(incoming.tasks)) return;
  const prevAutostart = state.settings.autostart;
  const prevBar = state.settings.showInTaskbar;
  // meta la controla el proceso principal (posición del sticker, último aviso)
  state = {
    tasks: incoming.tasks,
    routines: Array.isArray(incoming.routines) ? incoming.routines : [],
    energy: incoming.energy && typeof incoming.energy === 'object' ? incoming.energy : {},
    energyAt: incoming.energyAt && typeof incoming.energyAt === 'object' ? incoming.energyAt : {},
    tomb: incoming.tomb && typeof incoming.tomb === 'object' ? incoming.tomb : {},
    jar: Array.isArray(incoming.jar) ? incoming.jar : [],
    settings: { ...state.settings, ...(incoming.settings || {}) },
    // meta la controla este proceso, salvo las marcas de sincronización que calcula la interfaz
    meta: {
      ...state.meta,
      h: (incoming.meta && incoming.meta.h) || {},
      known: (incoming.meta && incoming.meta.known) || {},
    },
  };
  scheduleWrite();
  if (prevAutostart !== state.settings.autostart) applyLoginItem();
  if (prevBar !== state.settings.showInTaskbar) syncBar(); else sendBar();
  updateTrayTooltip();
});

ipcMain.on('window:mode', (_e, mode) => {
  state.settings.mode = mode === 'sticker' ? 'sticker' : 'panel';
  scheduleWrite();
  applyMode(state.settings.mode);
});

ipcMain.on('window:resize', (_e, height) => {
  if (!win || state.settings.mode !== 'sticker') return;
  const h = Math.round(Math.min(Math.max(height, STICKER_MIN_H), STICKER_MAX_H));
  const b = win.getBounds();
  if (b.height !== h) win.setBounds({ x: b.x, y: b.y, width: STICKER_W, height: h });
});


ipcMain.on('bar:ready', sendBar);
ipcMain.on('bar:click', () => {
  dlog('bar:click');
  // Si el panel acaba de cerrarse por perder el foco (el clic en el chip lo activó), no lo reabrimos.
  if (Date.now() - lastBlurHide < 700) return;
  toggleWindow();
});
ipcMain.on('bar:set-status', (_e, id, status) => {
  dlog(`bar:set-status ${status}`);
  if (win && !win.isDestroyed() && typeof id === 'string' && ['todo', 'doing', 'done'].includes(status)) {
    win.webContents.send('bar-set-status', id, status);
  }
  // devolvemos el foco a lo que estabas haciendo
  setTimeout(() => { if (barWin && !barWin.isDestroyed() && barWin.isFocused()) barWin.blur(); }, 50);
});
ipcMain.on('bar:resize', (_e, w) => {
  const nw = Math.round(Math.min(Math.max(Number(w) || BAR_MIN_W, BAR_MIN_W), BAR_MAX_W));
  if (nw !== barW) { barW = nw; if (barWin && barWin.isVisible()) placeBar(); }
});
ipcMain.on('bar:reset', () => { state.meta.barRight = null; scheduleWrite(); placeBar(); });
ipcMain.on('bar:drag-start', () => {
  clearInterval(barDrag && barDrag.timer);
  const start = screen.getCursorScreenPoint();
  const off0 = state.meta.barRight ?? BAR_DEFAULT_RIGHT;
  barDrag = {
    timer: setInterval(() => {
      const p = screen.getCursorScreenPoint();
      const g = taskbarGeometry();
      state.meta.barRight = Math.min(Math.max(off0 - (p.x - start.x), 0), g.right - g.left - barW);
      placeBar();
    }, 12),
  };
});
ipcMain.on('bar:drag-end', () => {
  if (barDrag) { clearInterval(barDrag.timer); barDrag = null; scheduleWrite(); }
});
ipcMain.on('bar:menu', () => {
  const sum = barSummary();
  const setSt = (st) => win && !win.isDestroyed() && win.webContents.send('bar-set-status', sum.id, st);
  const taskItems = sum.state !== 'task' ? [] : [
    { label: 'Marcar como hecha', click: () => setSt('done') },
    sum.status === 'todo'
      ? { label: 'Empezar (en proceso)', click: () => setSt('doing') }
      : { label: 'Volver a por hacer', click: () => setSt('todo') },
    { type: 'separator' },
  ];
  Menu.buildFromTemplate([
    ...taskItems,
    { label: 'Abrir Poquito', click: showWindow },
    { label: 'Restablecer posición', click: () => { state.meta.barRight = null; scheduleWrite(); placeBar(); } },
    { label: 'Quitar de la barra de tareas', click: () => patchSettings({ showInTaskbar: false }) },
    { type: 'separator' },
    { label: 'Salir', click: () => { quitting = true; app.quit(); } },
  ]).popup({ window: barWin });
});

// Sesión de la cuenta: se guarda cifrada con el sistema (Windows DPAPI) cuando está disponible
const sessionFile = () => path.join(app.getPath('userData'), 'poquito-session.bin');
ipcMain.handle('session:get', () => {
  try {
    const buf = fs.readFileSync(sessionFile());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
  } catch { return null; }
});
ipcMain.handle('session:set', (_e, value) => {
  try {
    if (value == null) { fs.rmSync(sessionFile(), { force: true }); return true; }
    fs.mkdirSync(path.dirname(sessionFile()), { recursive: true });
    const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(String(value)) : Buffer.from(String(value), 'utf8');
    fs.writeFileSync(sessionFile(), buf);
    return true;
  } catch { return false; }
});

ipcMain.on('window:hide', () => win && win.hide());
ipcMain.on('app:quit', () => { quitting = true; app.quit(); });
ipcMain.on('notify:test', () => {
  notify('Así se ven los avisos', 'Suaves, sin prisa y sin culpa.');
});

/* ---------- Arranque ---------- */
app.on('second-instance', showWindow);

app.whenReady().then(() => {
  loadState();
  createWindow();
  createBarWindow();
  createTray();
  applyLoginItem();
  setInterval(tick, 20000);
  setTimeout(tick, 4000);

  try {
    globalShortcut.register('Control+Alt+T', toggleWindow);
  } catch { /* si el atajo está ocupado, seguimos sin él */ }
});

app.on('before-quit', () => { quitting = true; writeNow(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());
