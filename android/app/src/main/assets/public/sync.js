/* Poquito · sincronización
 *
 * Cada dispositivo guarda todo localmente y, si hay sesión iniciada, lo fusiona con una copia
 * en la nube (una fila por usuario en Supabase). La fusión es por elemento: gana el cambio más
 * reciente de cada tarea, y las tareas borradas dejan una "lápida" para que no reaparezcan.
 *
 * Este archivo es idéntico en la app de escritorio y en la de Android.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PoquitoSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Ajustes que viajan entre dispositivos. El resto (inicio con Windows, chip, modo…) es de cada equipo.
  const SHARED = ['morningEnabled', 'morningTime', 'nudgeMinutes', 'silent', 'capacityOn',
    'reward', 'motion', 'lastEnergy', 'lastSize'];
  const TOMB_DAYS = 90;

  /* ---------- utilidades ---------- */
  function stable(v) {
    return JSON.stringify(v, (k, val) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return Object.keys(val).sort().reduce((o, key) => { o[key] = val[key]; return o; }, {});
      }
      return val;
    });
  }

  function cyrb53(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  const hashItem = (x) => { const c = Object.assign({}, x); delete c.updatedAt; return cyrb53(stable(c)); };
  const pickShared = (s) => { const o = {}; SHARED.forEach((k) => { if (s && k in s) o[k] = s[k]; }); return o; };

  function ensureShape(state) {
    state.meta = state.meta || {};
    state.meta.h = state.meta.h || {};
    state.meta.known = state.meta.known || {};
    state.tasks = state.tasks || [];
    state.routines = state.routines || [];
    state.jar = state.jar || [];
    state.energy = state.energy || {};
    state.energyAt = state.energyAt || {};
    state.tomb = state.tomb || {};
    state.settings = state.settings || {};
    return state;
  }

  /* ---------- marcas de tiempo por elemento ---------- */
  // Se llama antes de guardar: detecta qué cambió desde la última vez y le pone la hora,
  // y deja una lápida por cada elemento que ya no está.
  function stamp(state, now) {
    now = now || Date.now();
    ensureShape(state);
    const meta = state.meta;
    const cols = { T: state.tasks, R: state.routines, J: state.jar };
    Object.keys(cols).forEach((p) => {
      const seen = new Set();
      cols[p].forEach((x) => {
        if (!x || !x.id) return;
        seen.add(x.id);
        const h = hashItem(x);
        if (meta.h[p + x.id] !== h) { x.updatedAt = now; meta.h[p + x.id] = h; }
      });
      (meta.known[p] || []).forEach((id) => {
        if (!seen.has(id)) { state.tomb[p + id] = now; delete meta.h[p + id]; }
      });
      meta.known[p] = Array.from(seen);
    });

    const hs = hashItem(pickShared(state.settings));
    if (meta.h.S !== hs) { state.settings.updatedAt = now; meta.h.S = hs; }

    Object.keys(state.energy).forEach((day) => {
      if (meta.h['E' + day] !== state.energy[day]) { state.energyAt[day] = now; meta.h['E' + day] = state.energy[day]; }
    });
    return state;
  }

  // Tras una fusión se recalculan las marcas para que lo traído de la nube no cuente como edición propia
  function rehash(state) {
    ensureShape(state);
    const meta = state.meta;
    meta.h = {};
    meta.known = {};
    const cols = { T: state.tasks, R: state.routines, J: state.jar };
    Object.keys(cols).forEach((p) => {
      meta.known[p] = [];
      cols[p].forEach((x) => {
        if (!x || !x.id) return;
        meta.h[p + x.id] = hashItem(x);
        meta.known[p].push(x.id);
      });
    });
    meta.h.S = hashItem(pickShared(state.settings));
    Object.keys(state.energy).forEach((day) => { meta.h['E' + day] = state.energy[day]; });
  }

  /* ---------- lo que se sube ---------- */
  function payload(state) {
    ensureShape(state);
    const settings = pickShared(state.settings);
    if (state.settings.updatedAt) settings.updatedAt = state.settings.updatedAt;
    return {
      v: 1,
      tasks: state.tasks,
      routines: state.routines,
      jar: state.jar,
      energy: state.energy,
      energyAt: state.energyAt,
      tomb: state.tomb,
      settings,
    };
  }

  /* ---------- fusión ---------- */
  function mergeInto(state, remote) {
    ensureShape(state);
    const r = remote && typeof remote === 'object' ? remote : {};
    const rt = {
      tasks: Array.isArray(r.tasks) ? r.tasks : [],
      routines: Array.isArray(r.routines) ? r.routines : [],
      jar: Array.isArray(r.jar) ? r.jar : [],
      energy: r.energy && typeof r.energy === 'object' ? r.energy : {},
      energyAt: r.energyAt && typeof r.energyAt === 'object' ? r.energyAt : {},
      tomb: r.tomb && typeof r.tomb === 'object' ? r.tomb : {},
      settings: r.settings && typeof r.settings === 'object' ? r.settings : {},
    };

    const tomb = {};
    Object.keys(rt.tomb).forEach((k) => { tomb[k] = rt.tomb[k]; });
    Object.keys(state.tomb).forEach((k) => { tomb[k] = Math.max(tomb[k] || 0, state.tomb[k]); });

    const mergeArr = (p, localArr, remoteArr) => {
      const map = new Map();
      remoteArr.forEach((x) => { if (x && x.id) map.set(x.id, x); });
      localArr.forEach((x) => {
        if (!x || !x.id) return;
        const y = map.get(x.id);
        if (!y || (x.updatedAt || 0) >= (y.updatedAt || 0)) map.set(x.id, x);
      });
      const out = [];
      map.forEach((x) => {
        const t = tomb[p + x.id];
        if (t && t >= (x.updatedAt || 0)) return;       // borrada después de su última edición
        out.push(x);
      });
      return out;
    };

    state.tasks = mergeArr('T', state.tasks, rt.tasks);
    state.routines = mergeArr('R', state.routines, rt.routines);
    state.jar = mergeArr('J', state.jar, rt.jar);

    if ((rt.settings.updatedAt || 0) > (state.settings.updatedAt || 0)) {
      SHARED.forEach((k) => { if (k in rt.settings) state.settings[k] = rt.settings[k]; });
      state.settings.updatedAt = rt.settings.updatedAt;
    }

    Object.keys(rt.energy).forEach((day) => {
      if ((rt.energyAt[day] || 0) > (state.energyAt[day] || 0)) {
        state.energy[day] = rt.energy[day];
        state.energyAt[day] = rt.energyAt[day];
      }
    });

    const cutoff = Date.now() - TOMB_DAYS * 86400000;
    Object.keys(tomb).forEach((k) => { if (tomb[k] < cutoff) delete tomb[k]; });
    state.tomb = tomb;

    rehash(state);
    return state;
  }

  const sameContent = (a, b) => stable(a) === stable(b);

  /* ---------- cliente ---------- */
  function fail(message, code) { const e = new Error(message); e.code = code || 'error'; return e; }

  function create(opts) {
    const cfg = opts.config || {};
    const url = String(cfg.url || '').replace(/\/+$/, '');
    const anon = String(cfg.anonKey || '');
    const configured = !!(url && anon);
    const doFetch = opts.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const store = opts.store || { get: async () => null, set: async () => {} };

    let session = null;
    let busy = false, again = false, timer = null, interval = null;
    const status = { phase: configured ? 'signedout' : 'unconfigured', error: '', last: 0, email: '' };
    const emit = () => { if (opts.onStatus) opts.onStatus(Object.assign({}, status)); };
    const setStatus = (phase, error) => { status.phase = phase; status.error = error || ''; emit(); };

    async function persist() {
      try { await store.set(session ? JSON.stringify({ s: session, last: status.last }) : null); } catch (e) { /* nada */ }
    }

    async function load() {
      if (!configured) { emit(); return; }
      try {
        const raw = await store.get();
        if (raw) { const o = JSON.parse(raw); session = o.s || null; status.last = o.last || 0; }
      } catch (e) { /* sin sesión guardada */ }
      status.email = (session && session.user && session.user.email) || '';
      status.phase = session ? 'idle' : 'signedout';
      emit();
    }

    async function http(path, o) {
      o = o || {};
      if (!doFetch) throw fail('Este equipo no puede conectarse.', 'network');
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const t = ctl ? setTimeout(() => ctl.abort(), o.timeout || 15000) : null;
      try {
        const headers = Object.assign({ apikey: anon, 'Content-Type': 'application/json' }, o.headers || {});
        // Con sesión se manda el token del usuario. Las claves nuevas de Supabase (sb_publishable_…)
        // no son JWT y solo van en "apikey"; las antiguas (eyJ…) también se aceptan como Bearer.
        if (o.token) headers.Authorization = 'Bearer ' + o.token;
        else if (anon.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + anon;
        const res = await doFetch(url + path, {
          method: o.method || 'GET',
          headers,
          body: o.body === undefined ? undefined : JSON.stringify(o.body),
          signal: ctl ? ctl.signal : undefined,
        });
        const text = await res.text();
        let json = null;
        if (text) { try { json = JSON.parse(text); } catch (e) { json = text; } }
        return { status: res.status, ok: res.ok, json };
      } catch (e) {
        throw fail('Sin conexión.', 'network');
      } finally {
        if (t) clearTimeout(t);
      }
    }

    function authMessage(res) {
      const j = (res.json && typeof res.json === 'object') ? res.json : {};
      const raw = String(j.error_description || j.msg || j.message || j.error || '').toLowerCase();
      if (raw.includes('invalid login')) return 'Correo o contraseña incorrectos.';
      if (raw.includes('already registered') || raw.includes('already exists')) return 'Ese correo ya tiene cuenta. Inicia sesión.';
      if (raw.includes('password') && (raw.includes('least') || raw.includes('short') || raw.includes('weak'))) return 'La contraseña es muy corta (mínimo 6 caracteres).';
      if (raw.includes('email') && raw.includes('confirm')) return 'Falta confirmar tu correo. Revisa tu bandeja.';
      if (raw.includes('rate limit') || res.status === 429) return 'Demasiados intentos. Espera un momento.';
      if (raw.includes('invalid') && raw.includes('email')) return 'Ese correo no parece válido.';
      if (raw.includes('invalid api key') || res.status === 401) return 'La clave de Supabase no es válida. Revisa sync-config.js.';
      return 'No se pudo entrar (' + res.status + ').';
    }

    async function setSession(j) {
      const expiresAt = j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600);
      session = {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: expiresAt,
        user: { id: j.user && j.user.id, email: j.user && j.user.email },
      };
      status.email = session.user.email || '';
      await persist();
    }

    async function refresh() {
      if (!session || !session.refresh_token) throw fail('Vuelve a iniciar sesión.', 'auth');
      const r = await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
      if (!r.ok) { session = null; await persist(); throw fail('Tu sesión venció. Vuelve a iniciar sesión.', 'auth'); }
      await setSession(r.json);
    }

    async function ensureSession() {
      if (!session) throw fail('Inicia sesión para sincronizar.', 'auth');
      if (session.expires_at - Math.floor(Date.now() / 1000) < 60) await refresh();
    }

    async function rest(path, o) {
      let r = await http('/rest/v1/' + path, Object.assign({}, o, { token: session.access_token }));
      if (r.status === 401) {
        await refresh();
        r = await http('/rest/v1/' + path, Object.assign({}, o, { token: session.access_token }));
      }
      return r;
    }

    /* ----- cuenta ----- */
    async function signIn(email, password) {
      if (!configured) throw fail('Falta configurar Supabase.', 'config');
      setStatus('syncing');
      try {
        const r = await http('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: String(email).trim(), password } });
        if (!r.ok) throw fail(authMessage(r), 'auth');
        await setSession(r.json);
        startTimer();
        setStatus('idle');
      } catch (e) { setStatus(session ? 'idle' : 'signedout', ''); throw e; }
    }

    async function signUp(email, password) {
      if (!configured) throw fail('Falta configurar Supabase.', 'config');
      setStatus('syncing');
      try {
        const r = await http('/auth/v1/signup', { method: 'POST', body: { email: String(email).trim(), password } });
        if (!r.ok) throw fail(authMessage(r), 'auth');
        if (r.json && r.json.access_token) { await setSession(r.json); startTimer(); setStatus('idle'); return { needsConfirm: false }; }
        setStatus('signedout');
        return { needsConfirm: true };
      } catch (e) { setStatus(session ? 'idle' : 'signedout', ''); throw e; }
    }

    async function signOut() {
      const token = session && session.access_token;
      session = null;
      status.email = '';
      status.last = 0;
      await persist();
      clearTimeout(timer);
      clearInterval(interval);
      if (token) { try { await http('/auth/v1/logout', { method: 'POST', token }); } catch (e) { /* da igual */ } }
      setStatus('signedout');
    }

    /* ----- sincronizar ----- */
    async function fetchRow() {
      const r = await rest('poquito_state?select=data,version&user_id=eq.' + session.user.id, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw httpError(r);
      return Array.isArray(r.json) && r.json[0] ? r.json[0] : null;
    }

    function httpError(r) {
      const j = (r.json && typeof r.json === 'object') ? r.json : {};
      const code = String(j.code || '');
      if (r.status === 404 || code === 'PGRST205' || code === '42P01') return fail('Falta crear la tabla en Supabase (mira la guía SUPABASE.md).', 'setup');
      if (r.status === 401 || r.status === 403) return fail('Sin permiso. Revisa las políticas de la tabla.', 'auth');
      return fail('Error del servidor (' + r.status + ').', 'server');
    }

    async function writeRow(row, data) {
      const now = new Date().toISOString();
      if (row) {
        const r = await rest('poquito_state?user_id=eq.' + session.user.id + '&version=eq.' + row.version, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: { data, version: row.version + 1, updated_at: now },
        });
        if (!r.ok) throw httpError(r);
        return Array.isArray(r.json) && r.json.length === 1;       // 0 filas = alguien escribió antes: reintentar
      }
      const r = await rest('poquito_state', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: { user_id: session.user.id, data, version: 1, updated_at: now },
      });
      if (r.status === 409) return false;
      if (!r.ok) throw httpError(r);
      return true;
    }

    async function syncNow() {
      if (!configured || !session) return;
      if (busy) { again = true; return; }
      busy = true;
      setStatus('syncing');
      try {
        await ensureSession();
        for (let attempt = 0; attempt < 4; attempt++) {
          const row = await fetchRow();
          const state = opts.getState();
          stamp(state);
          const before = stable(payload(state));
          if (row) mergeInto(state, row.data);          // se mezcla sobre el estado vivo, sin esperas de por medio
          const mine = payload(state);
          if (stable(mine) !== before && opts.onMerged) opts.onMerged();
          if (row && sameContent(mine, normalizeRemote(row.data))) break;   // nada que subir
          if (await writeRow(row, JSON.parse(JSON.stringify(mine)))) break;
          if (attempt === 3) throw fail('Hubo cambios al mismo tiempo. Se reintentará.', 'conflict');
        }
        status.last = Date.now();
        await persist();
        setStatus('idle');
      } catch (e) {
        if (e.code === 'auth' && !session) setStatus('signedout', e.message);
        else setStatus(e.code === 'network' ? 'offline' : 'error', e.message);
      } finally {
        busy = false;
        if (again) { again = false; schedule(1500); }
      }
    }

    function normalizeRemote(d) {
      d = d || {};
      return {
        v: 1,
        tasks: d.tasks || [],
        routines: d.routines || [],
        jar: d.jar || [],
        energy: d.energy || {},
        energyAt: d.energyAt || {},
        tomb: d.tomb || {},
        settings: d.settings || {},
      };
    }

    function schedule(ms) {
      if (!configured || !session) return;
      clearTimeout(timer);
      timer = setTimeout(syncNow, ms === undefined ? 3500 : ms);
    }

    async function start() {
      await load();
      if (session) {
        syncNow();
        clearInterval(interval);
        interval = setInterval(syncNow, 60000);
      }
    }

    function startTimer() {
      clearInterval(interval);
      interval = setInterval(syncNow, 60000);
    }

    return {
      configured,
      start, load, signIn, signUp, signOut, syncNow, schedule, startTimer,
      status: () => Object.assign({}, status),
      signedIn: () => !!session,
    };
  }

  return { create, stamp, rehash, payload, mergeInto, stable, SHARED };
});
