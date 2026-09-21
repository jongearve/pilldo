(() => {
  'use strict';

  /* ---------- Utilidades ---------- */
  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d = new Date()) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const addDays = (k, n) => {
    const d = parseKey(k);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  };
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const ord = (t) => (t.order ?? t.createdAt);

  /* ---------- Cupo del día, tamaños y frasco ---------- */
  const WEIGHT = { S: 1, M: 2, L: 3 };
  const SIZE_NAME = { S: 'chica', M: 'mediana', L: 'grande' };
  const NEXT_SIZE = { S: 'M', M: 'L', L: 'S' };
  const CAP = { low: 4, mid: 7, high: 10 };
  const sizeOf = (t) => (WEIGHT[t.size] ? t.size : 'M');
  const dots = (sz) => [1, 2, 3].map((n) => `<i${n <= WEIGHT[sz] ? ' class="on"' : ''}></i>`).join('');
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 'off' | 'soft' | 'full'. Si Windows tiene los efectos de animación apagados, se respeta.
  const motion = () => (reducedMotion() ? 'off' : (state.settings.motion || 'soft'));
  const applyMotion = () => { document.documentElement.dataset.motion = motion(); };
  const STATUS_COLOR = { todo: 'var(--todo)', doing: 'var(--doing)', done: 'var(--done)' };

  const svg = (paths) =>
    `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

  const ICON = {
    jar: svg('<path d="M8 3h8v3H8z"/><path d="M6.5 6h11l1 3v9a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3V9z"/><path d="M9.5 14h5"/>'),
    prev: svg('<path d="M15 5l-7 7 7 7"/>'),
    next: svg('<path d="M9 5l7 7-7 7"/>'),
    pin: svg('<path d="M9 4h6l-1 6 4 3H6l4-3-1-6z"/><path d="M12 13v7"/>'),
    sliders: svg('<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    chevron: svg('<path d="M6 9l6 6 6-6"/>'),
    repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
    later: svg('<path d="M4 12h11"/><path d="M11 7l5 5-5 5"/><path d="M20 5v14"/>'),
    edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/>'),
    trash: svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  };

  const STATE_SVG = {
    todo: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>',
    doing: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5a11 11 0 0 0 0 22z" fill="currentColor"/><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>',
    done: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.3" fill="currentColor"/><path class="check" pathLength="1" d="M10.5 16.5l4 4 7.5-8.5" fill="none" stroke="var(--pill-bg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const STATUS_LABEL = {
    todo: { title: 'Por hacer. Clic para empezar', next: 'doing' },
    doing: { title: 'En proceso. Clic para marcar como hecha', next: 'done' },
    done: { title: 'Hecha. Clic para volver a por hacer', next: 'todo' },
  };

  /* ---------- Estado ---------- */
  let state = { tasks: [], routines: [], energy: {}, energyAt: {}, tomb: {}, jar: [], settings: {}, meta: {} };
  let isPackaged = false;
  let viewDate = dateKey();
  let lastToday = viewDate;
  let lastChangedId = null;
  let editingId = null;
  let doneOpen = true;
  let toastTimer = null;
  let undoFn = null;
  let gameTimer = null;
  let lastPhrase = '';
  let lastFrom = null;          // estado anterior de la tarea que acaba de cambiar (para el degradado de color)
  let navDir = 0;               // dirección al cambiar de día: -1 anterior, 1 siguiente
  let lastRenderedDate = null;

  let sync = null;
  const save = () => {
    window.PoquitoSync.stamp(state);       // pone la hora a lo que cambió (para poder fusionar con otros equipos)
    window.api.save(state);
    if (sync) sync.schedule();
  };
  const isSticker = () => state.settings.mode === 'sticker';

  /* ---------- Reglas de días ---------- */
  // Lo pendiente de días anteriores pasa a hoy, sin marcas de "atrasado".
  // Las rutinas diarias generan su pastilla de cada día.
  function rollover() {
    const today = dateKey();
    let changed = false;

    for (const t of [...state.tasks]) {
      if (t.status === 'done' || t.date >= today) continue;
      if (t.routineId && state.tasks.some(
        (o) => o !== t && o.routineId === t.routineId && o.date === today)) {
        state.tasks.splice(state.tasks.indexOf(t), 1);   // ya existe la de hoy
      } else {
        t.carriedFrom = t.carriedFrom || t.date;
        t.date = today;
      }
      changed = true;
    }
    if (ensureRoutines(today)) changed = true;
    return changed;
  }

  function ensureRoutines(day) {
    let changed = false;
    for (const r of state.routines) {
      if (day < r.start || (r.skip || []).includes(day)) continue;
      if (state.tasks.some((t) => t.routineId === r.id && t.date === day)) continue;
      state.tasks.push({
        id: `rt_${r.id}_${day}`, text: r.text, status: 'todo', date: day,
        routineId: r.id, createdAt: Date.now(),
      });
      changed = true;
    }
    return changed;
  }

  /* ---------- Acciones ---------- */
  function addTask(text) {
    text = text.trim();
    if (!text || viewDate < dateKey()) return;
    const t = {
      id: uid(), text, status: 'todo', date: viewDate, createdAt: Date.now(),
      size: state.settings.lastSize || 'M',
    };
    state.tasks.push(t);
    commit(t.id);
    if (capOn() && loadOf(state.tasks.filter((x) => x.date === viewDate)) > capOf(viewDate)) {
      const id = t.id;
      showToast(viewDate === dateKey() ? 'Hoy ya está lleno' : 'Este día ya está lleno',
        () => moveToDate(id, addDays(viewDate, 1)), 'Dejar para mañana', 6000);
    }
  }

  const capOn = () => state.settings.capacityOn !== false;
  const energyFor = (day) => (state.energy && state.energy[day]) || state.settings.lastEnergy || 'mid';
  const capOf = (day) => CAP[energyFor(day)];
  const loadOf = (tasks) => tasks.reduce((n, t) => n + WEIGHT[sizeOf(t)], 0);

  // Único lugar donde cambia el estado de una tarea: así el frasco siempre queda consistente
  function applyStatus(t, status) {
    const prev = t.status;
    lastFrom = prev;
    t.status = status;
    if (status === 'done') {
      t.doneAt = Date.now();
      recordJar(t);
    } else {
      delete t.doneAt;
      state.jar = state.jar.filter((j) => j.id !== t.id);
    }
    return prev;
  }

  // Borrar una tarea hecha NO la saca del frasco; solo desmarcarla lo hace
  function recordJar(t) {
    if (state.jar.some((j) => j.id === t.id)) return;
    state.jar.push({
      id: t.id,
      at: t.doneAt || t.createdAt || Date.now(),
      size: sizeOf(t),
      text: String(t.text || '').slice(0, 140),
    });
  }

  function cycleStatus(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const prev = applyStatus(t, STATUS_LABEL[t.status].next);
    commit(id);
    if (t.status === 'done') celebrate(t, prev);
  }

  function cycleSize(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    t.size = NEXT_SIZE[sizeOf(t)];
    commit(id);
  }

  function moveToDate(id, date) {
    const idx = state.tasks.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const t = state.tasks[idx];
    const from = { date: t.date, carriedFrom: t.carriedFrom };
    let removedDuplicate = false;
    const routine = t.routineId ? state.routines.find((r) => r.id === t.routineId) : null;

    if (routine) {
      routine.skip = [...(routine.skip || []), from.date];       // que no se regenere el día de origen
      if (state.tasks.some((o) => o !== t && o.routineId === t.routineId && o.date === date)) {
        state.tasks.splice(idx, 1);                              // ya existe esa rutina ese día
        removedDuplicate = true;
      }
    }
    if (!removedDuplicate) { t.date = date; delete t.carriedFrom; }
    commit();
    showToast(`Pasó a ${dayLabels(date).name.toLowerCase()}`, () => {
      if (routine) routine.skip = routine.skip.filter((d) => d !== from.date);
      if (removedDuplicate) state.tasks.push(t);
      t.date = from.date;
      if (from.carriedFrom) t.carriedFrom = from.carriedFrom;
      commit(t.id);
    });
  }

  function moveToNextDay(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const base = t.date < dateKey() ? dateKey() : t.date;
    moveToDate(id, addDays(base, 1));
  }

  // Reordena con el teclado (Alt + ↑ / ↓) dentro de su sección
  function reorder(id, dir) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const group = state.tasks
      .filter((x) => x.date === t.date && x.status === t.status)
      .sort((a, b) => ord(a) - ord(b));
    const i = group.indexOf(t), j = i + dir;
    if (j < 0 || j >= group.length) return;
    [group[i], group[j]] = [group[j], group[i]];
    group.forEach((x, k) => { x.order = k; });
    commit(id);
    setTimeout(() => {
      const b = document.querySelector(`.pill[data-id="${id}"] .state-btn`);
      if (b) b.focus();
    }, 0);
  }

  // Suelta una pastilla en una sección (estado) y en una posición
  function applyDrop(id, status, idsInOrder) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    let prev = null;
    if (t.status !== status) prev = applyStatus(t, status);
    idsInOrder.forEach((tid, i) => {
      const x = state.tasks.find((q) => q.id === tid);
      if (x) x.order = i;
    });
    commit(id);
    if (prev !== null && status === 'done') celebrate(t, prev);
  }

  function deleteTask(id) {
    const idx = state.tasks.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [t] = state.tasks.splice(idx, 1);
    let routine = null;
    if (t.routineId) {
      routine = state.routines.find((r) => r.id === t.routineId);
      if (routine) routine.skip = [...(routine.skip || []), t.date];
    }
    commit();
    showToast('Pastilla eliminada', () => {
      state.tasks.push(t);
      if (routine) routine.skip = routine.skip.filter((d) => d !== t.date);
      commit(t.id);
    });
  }

  function toggleRoutine(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    if (t.routineId) {
      const rid = t.routineId;
      state.routines = state.routines.filter((r) => r.id !== rid);
      const today = dateKey();
      state.tasks = state.tasks.filter(
        (o) => !(o.routineId === rid && o.id !== t.id && o.date > today && o.status === 'todo'));
      delete t.routineId;
      showToast('Ya no se repite cada día');
    } else {
      const r = { id: uid(), text: t.text, start: t.date, skip: [] };
      state.routines.push(r);
      t.routineId = r.id;
      showToast('Se repetirá cada día');
    }
    commit(id);
  }

  function saveEdit(id, value) {
    const t = state.tasks.find((x) => x.id === id);
    editingId = null;
    value = value.trim();
    if (t && value && value !== t.text) {
      t.text = value;
      if (t.routineId) {
        const r = state.routines.find((x) => x.id === t.routineId);
        if (r) r.text = value;
      }
      commit(id);
    } else {
      render();
    }
  }

  function commit(changedId = null) {
    lastChangedId = changedId;
    save();
    render();
  }

  /* ---------- Aviso con deshacer ---------- */
  function showToast(msg, undo, label = 'Deshacer', ms = 5000) {
    clearTimeout(toastTimer);
    undoFn = undo || null;
    $('#toast-msg').textContent = msg;
    $('#toast-undo').textContent = label;
    $('#toast-undo').hidden = !undo;
    $('#toast').hidden = false;
    toastTimer = setTimeout(hideToast, ms);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    $('#toast').hidden = true;
    undoFn = null;
  }

  /* ---------- Dibujo ---------- */
  function dayLabels(key) {
    const today = dateKey();
    const d = parseKey(key);
    const date = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' });
    let name;
    if (key === today) name = 'Hoy';
    else if (key === addDays(today, 1)) name = 'Mañana';
    else if (key === addDays(today, -1)) name = 'Ayer';
    else name = cap(d.toLocaleDateString('es', { weekday: 'long' }));
    return { name, date };
  }

  function carriedNote(t) {
    if (!t.carriedFrom) return '';
    const today = dateKey();
    if (t.carriedFrom === addDays(today, -1)) return 'viene de ayer';
    const d = parseKey(t.carriedFrom).toLocaleDateString('es', { day: 'numeric', month: 'short' });
    return `viene del ${d}`;
  }

  function renderHeader() {
    const { name, date } = dayLabels(viewDate);
    $('#day-name').textContent = name;
    $('#day-date').textContent = date;
    $('#day').title = viewDate === dateKey() ? '' : 'Ir a hoy';
    const mb = $('#mode-btn');
    mb.setAttribute('aria-pressed', String(isSticker()));
    mb.title = isSticker() ? 'Volver al panel' : 'Fijar en el escritorio';
    const today = dateKey();
    const n = state.jar.filter((j) => dateKey(new Date(j.at)) === today).length;
    const badge = $('#jar-badge');
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }

  // Tareas pequeñas que se pueden dejar para mañana para que el día vuelva a caber
  function overflowCandidates(tasks) {
    let load = loadOf(tasks);
    const cap = capOf(viewDate);
    const out = [];
    const cands = tasks.filter((t) => t.status === 'todo' && !t.routineId).sort((a, b) => ord(b) - ord(a));
    for (const t of cands) {
      if (load <= cap) break;
      out.push(t);
      load -= WEIGHT[sizeOf(t)];
    }
    return out;
  }

  function moveOverflow() {
    const tasks = state.tasks.filter((t) => t.date === viewDate);
    const list = overflowCandidates(tasks);
    if (!list.length) return;
    const target = addDays(viewDate, 1);
    const before = list.map((t) => ({ t, date: t.date, carried: t.carriedFrom }));
    list.forEach((t) => { t.date = target; delete t.carriedFrom; });
    commit();
    showToast(`${list.length === 1 ? 'Una tarea pasó' : `${list.length} tareas pasaron`} a ${dayLabels(target).name.toLowerCase()}`, () => {
      before.forEach((b) => { b.t.date = b.date; if (b.carried) b.t.carriedFrom = b.carried; });
      commit();
    });
  }

  function renderQuota(tasks) {
    const q = $('#quota');
    const show = capOn() && viewDate >= dateKey();
    q.hidden = !show;
    if (!show) return;
    const cap = capOf(viewDate), e = energyFor(viewDate), load = loadOf(tasks);
    $('#quota-label').textContent = viewDate === dateKey() ? 'Energía de hoy' : 'Energía de ese día';
    document.querySelectorAll('#energy button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.e === e)));

    const rank = { done: 0, doing: 1, todo: 2 };
    const units = [];
    [...tasks].sort((a, b) => rank[a.status] - rank[b.status] || ord(a) - ord(b))
      .forEach((t) => { for (let i = 0; i < WEIGHT[sizeOf(t)]; i++) units.push(t.status); });
    const bar = $('#quota-bar');
    const total = Math.max(cap, units.length);
    if (bar.children.length !== total) {           // si no cambia la cantidad, solo se actualizan los colores (con transición)
      bar.textContent = '';
      for (let i = 0; i < total; i++) {
        const seg = document.createElement('span');
        seg.style.setProperty('--i', String(i));
        bar.appendChild(seg);
      }
    }
    [...bar.children].forEach((seg, i) => {
      seg.className = `seg ${i < units.length ? units[i] : 'free'}${i >= cap ? ' over' : ''}${i === cap ? ' first-over' : ''}`;
    });
    $('#quota-text').textContent = `${load} de ${cap}`;

    const over = load > cap;
    $('#quota-over').hidden = !over || isSticker();
    if (over) {
      $('#quota-msg').textContent = viewDate === dateKey()
        ? 'Hoy ya está lleno. Lo que sobra puede esperar a mañana.'
        : 'Este día ya está lleno.';
      $('#quota-move').hidden = overflowCandidates(tasks).length === 0;
    }
  }

  function renderAddSize() {
    const b = $('#add-size');
    const sz = WEIGHT[state.settings.lastSize] ? state.settings.lastSize : 'M';
    b.hidden = !capOn();
    b.innerHTML = dots(sz);
    b.title = `Tamaño de la próxima tarea: ${SIZE_NAME[sz]}. Clic para cambiar`;
    b.setAttribute('aria-label', b.title);
  }

  function renderProgress(tasks) {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const isToday = viewDate === dateKey();
    let text;
    if (total === 0) text = isToday ? 'Todavía no hay nada para hoy' : 'Sin tareas este día';
    else if (done === total) text = isToday ? 'Todo listo por hoy. Puedes descansar.' : `${done} de ${total} hechas`;
    else text = `${done} de ${total} ${total === 1 ? 'hecha' : 'hechas'}`;
    $('#progress-text').textContent = text;
    $('#progress-fill').style.width = total ? `${(done / total) * 100}%` : '0%';
  }

  function pillEl(t) {
    const li = document.createElement('li');
    li.className = 'pill' + (t.id === lastChangedId ? ' changed' : '');
    li.dataset.status = t.status;
    li.dataset.id = t.id;
    if (t.id === lastChangedId && lastFrom && lastFrom !== t.status) li.style.setProperty('--from-bg', STATUS_COLOR[lastFrom]);

    const readOnly = viewDate < dateKey();
    li.draggable = !readOnly && editingId !== t.id;
    const label = STATUS_LABEL[t.status].title;
    const sz = sizeOf(t);
    const sizeTitle = `Tamaño: ${SIZE_NAME[sz]}. Clic para cambiar`;

    const meta = [];
    if (t.routineId) meta.push(`${ICON.repeat}<span>cada día</span>`);
    const note = carriedNote(t);
    if (note && t.status !== 'done') meta.push(`<span>${note}</span>`);

    const body = editingId === t.id
      ? '<input class="pill-edit" type="text" maxlength="140" aria-label="Editar tarea">'
      : `<span class="pill-text"></span>${meta.length ? `<span class="pill-meta">${meta.join('')}</span>` : ''}`;

    li.innerHTML = `
      <button class="state-btn" type="button" title="${label}" aria-label="${label}">${STATE_SVG[t.status]}</button>
      <div class="pill-body">${body}</div>
      ${capOn() && editingId !== t.id ? `<span class="pill-size" title="Tamaño: ${SIZE_NAME[sz]}" aria-hidden="true">${dots(sz)}</span>` : ''}
      ${readOnly || editingId === t.id ? '' : `
      <div class="pill-actions">
        <button type="button" data-act="repeat" title="Repetir cada día" aria-pressed="${!!t.routineId}">${ICON.repeat}</button>
        ${capOn() ? `<button type="button" data-act="size" title="${sizeTitle}" aria-label="${sizeTitle}"><span class="size-dots">${dots(sz)}</span></button>` : ''}
        <button type="button" data-act="later" title="Pasar al día siguiente">${ICON.later}</button>
        <button type="button" data-act="edit" title="Editar">${ICON.edit}</button>
        <button type="button" data-act="delete" title="Eliminar">${ICON.trash}</button>
      </div>`}`;

    const textEl = li.querySelector('.pill-text');
    if (textEl) textEl.textContent = t.text;

    const edit = li.querySelector('.pill-edit');
    if (edit) {
      edit.value = t.text;
      let finished = false;
      const finish = (commitIt) => {
        if (finished) return;
        finished = true;
        commitIt ? saveEdit(t.id, edit.value) : (editingId = null, render());
      };
      edit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
      });
      edit.addEventListener('blur', () => finish(true));
      queueMicrotask(() => { edit.focus(); edit.select(); });
    }
    return li;
  }

  function groupEl(title, tasks, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'group';
    wrap.dataset.status = opts.status;
    if (tasks.length === 0) wrap.dataset.empty = 'true';   // solo se ve mientras arrastras

    const head = document.createElement(opts.collapsible ? 'button' : 'div');
    head.className = 'group-head';
    head.innerHTML = `${opts.collapsible ? ICON.chevron : ''}<span>${title}</span><span class="count">${tasks.length}</span>`;
    if (opts.collapsible) {
      head.type = 'button';
      head.setAttribute('aria-expanded', String(doneOpen));
      head.addEventListener('click', () => { doneOpen = !doneOpen; render(); });
    }
    wrap.appendChild(head);

    const ul = document.createElement('ul');
    ul.className = 'pills';
    ul.dataset.status = opts.status;
    tasks.forEach((t) => ul.appendChild(pillEl(t)));
    if (opts.collapsible && !doneOpen) ul.hidden = true;
    wrap.appendChild(ul);
    return wrap;
  }

  function renderList(tasks) {
    const list = $('#list');
    const scroll = list.scrollTop;
    list.textContent = '';

    const by = (st) => tasks.filter((t) => t.status === st).sort((a, b) => ord(a) - ord(b));
    const doing = by('doing'), todo = by('todo'), done = by('done');
    const today = dateKey();

    if (tasks.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent =
        viewDate < today ? 'No quedó nada guardado de este día.' :
        viewDate === today ? 'Nada por aquí todavía. Escribe una tarea pequeña y pulsa Enter.' :
        'Este día está libre. Lo que escribas aparecerá aquí.';
      list.appendChild(p);
    }
    list.appendChild(groupEl('En proceso', doing, { status: 'doing' }));
    list.appendChild(groupEl('Por hacer', todo, { status: 'todo' }));
    if (!isSticker()) list.appendChild(groupEl('Hecho', done, { status: 'done', collapsible: true }));

    list.scrollTop = scroll;
  }

  /* ---------- Movimiento: las pastillas se deslizan a su nuevo lugar ---------- */
  function snapshotPills() {
    const m = new Map();
    document.querySelectorAll('#list .pill').forEach((li) => {
      if (li.classList.contains('drag-source')) return;
      const r = li.getBoundingClientRect();
      if (r.width) m.set(li.dataset.id, { rect: r, el: li });
    });
    return m;
  }

  function playFlip(snap, changedId, sameDay) {
    if (motion() === 'off' || !sameDay) return;
    const seen = new Set();
    document.querySelectorAll('#list .pill').forEach((li) => {
      const id = li.dataset.id;
      seen.add(id);
      const prev = snap.get(id);
      if (prev) {
        const r = li.getBoundingClientRect();
        const dx = prev.rect.left - r.left, dy = prev.rect.top - r.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      } else if (id === changedId) {
        li.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 220, easing: 'ease-out' });
      }
    });
    // las que se fueron (borradas o pasadas a otro día) se desvanecen donde estaban
    snap.forEach((v, id) => {
      if (seen.has(id)) return;
      const g = v.el;
      g.style.position = 'fixed';
      g.style.left = `${v.rect.left}px`;
      g.style.top = `${v.rect.top}px`;
      g.style.width = `${v.rect.width}px`;
      g.style.margin = '0';
      g.style.zIndex = '40';
      g.style.pointerEvents = 'none';
      document.body.appendChild(g);
      g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(.96)' }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' }).onfinish = () => g.remove();
    });
  }

  // Al cambiar de día el contenido entra desde el lado correspondiente
  function playDaySlide(dir) {
    const level = motion();
    if (level === 'off') return;
    const frames = level === 'full'
      ? [{ opacity: 0, transform: `translateX(${dir * 26}px)` }, { opacity: 1, transform: 'none' }]
      : [{ opacity: 0 }, { opacity: 1 }];
    ['#list', '#quota'].forEach((sel) => $(sel).animate(frames, { duration: level === 'full' ? 260 : 160, easing: 'ease-out' }));
  }

  function render() {
    const snap = snapshotPills();
    const sameDay = lastRenderedDate === viewDate;
    const changedId = lastChangedId;
    if (viewDate >= dateKey() && ensureRoutines(viewDate)) save();
    const tasks = state.tasks.filter((t) => t.date === viewDate);

    document.body.classList.toggle('sticker', isSticker());
    renderHeader();
    renderProgress(tasks);
    renderQuota(tasks);
    renderAddSize();
    $('#add-form').hidden = viewDate < dateKey();
    renderList(tasks);
    playFlip(snap, changedId, sameDay);
    if (!sameDay && lastRenderedDate !== null) playDaySlide(navDir || 1);
    lastRenderedDate = viewDate;
    navDir = 0;
    lastChangedId = null;
    lastFrom = null;
    fitSticker();
  }

  function fitSticker() {
    if (!isSticker()) return;
    requestAnimationFrame(() => {
      const h = $('#shell').getBoundingClientRect().height;
      window.api.resize(Math.ceil(h) + 24);
    });
  }

  /* ---------- Modo pegatina / panel ---------- */
  function setMode(mode) {
    state.settings.mode = mode;
    if (mode === 'sticker') viewDate = dateKey();
    save();
    render();
    window.api.setMode(mode);
  }

  /* ---------- Recompensas ---------- */
  const PHRASES = [
    'Una menos. Bien.', 'Eso cuenta.', 'Hecho. Puedes respirar.', 'Poquito a poquito.',
    'Otra pastilla al frasco.', 'Buen trabajo, sin prisa.', 'Eso costaba y lo hiciste.',
  ];
  const PHRASES_BIG = ['Una grande. Pesaba, y ya está.', 'Eso era grande. Lo lograste.'];

  function pickPhrase(t) {
    const list = sizeOf(t) === 'L' ? PHRASES_BIG.concat(PHRASES) : PHRASES;
    let text;
    do { text = list[Math.floor(Math.random() * list.length)]; } while (list.length > 1 && text === lastPhrase);
    lastPhrase = text;
    return text;
  }

  function bumpJar() {
    const b = $('#jar-btn');
    b.classList.remove('bump');
    void b.offsetWidth;
    b.classList.add('bump');
  }

  function flyToJar(t) {
    const src = document.querySelector(`.pill[data-id="${t.id}"] .state-btn`);
    const dst = $('#jar-btn');
    if (!src || !dst) { bumpJar(); return; }
    const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
    const el = document.createElement('i');
    el.className = 'fly-pill';
    el.style.background = { S: 'var(--todo)', M: 'var(--doing)', L: 'var(--done)' }[sizeOf(t)];
    el.style.left = `${a.left + a.width / 2 - 14}px`;
    el.style.top = `${a.top + a.height / 2 - 6}px`;
    document.body.appendChild(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    el.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 46}px) rotate(200deg) scale(1.15)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) rotate(400deg) scale(.5)`, opacity: 0.9 },
    ], { duration: 720, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => { el.remove(); bumpJar(); };
  }

  function confetti(id) {
    if (motion() === 'off') return;
    const li = document.querySelector(`.pill[data-id="${id}"]`);
    const r = li ? li.getBoundingClientRect() : { left: 160, top: 300, width: 0, height: 0 };
    const cx = r.left + 46, cy = r.top + r.height / 2;
    const cols = ['#CFC8F0', '#F7DA7B', '#A9D8BC'];
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('i');
      el.className = 'confetti';
      const ang = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
      const dist = 50 + Math.random() * 60;
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      el.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
      el.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
      el.style.setProperty('--rot', `${Math.random() * 360}deg`);
      el.style.background = cols[i % 3];
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 900);
    }
  }

  // Se llama cuando una tarea pasa a "hecha". Siempre suma al frasco; el resto es opcional.
  function celebrate(t, prev) {
    const mode = state.settings.reward || 'soft';
    if (motion() === 'full') flyToJar(t); else bumpJar();
    if (mode === 'off') return;
    showToast(pickPhrase(t), () => { applyStatus(t, prev); commit(t.id); }, 'Deshacer', 3500);
    if (mode === 'party') confetti(t.id);
    if (mode === 'game' && motion() !== 'off') setTimeout(openGame, 500);
  }

  /* ---------- Minijuego: reventar pastillas (15 s, sin puntos) ---------- */
  function openGame() {
    const field = $('#game-field');
    field.textContent = '';
    $('#game').hidden = false;
    const colors = ['var(--todo)', 'var(--doing)', 'var(--done)'];
    const spawn = () => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bubble';
      b.setAttribute('aria-label', 'Pastilla');
      b.style.left = `${6 + Math.random() * 74}%`;
      b.style.background = colors[Math.floor(Math.random() * 3)];
      b.style.animationDuration = `${5 + Math.random() * 4}s`;
      b.style.animationDelay = `${-Math.random() * 4}s`;
      b.addEventListener('click', () => {
        b.classList.add('pop');
        setTimeout(() => { b.remove(); if (!$('#game').hidden) spawn(); }, 220);
      });
      field.appendChild(b);
    };
    for (let i = 0; i < 8; i++) spawn();
    const fill = $('#game-timer-fill');
    fill.style.transition = 'none';
    fill.style.width = '100%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.transition = 'width 15s linear';
      fill.style.width = '0%';
    }));
    clearTimeout(gameTimer);
    gameTimer = setTimeout(closeGame, 15000);
    $('#game-close').focus();
  }
  function closeGame() {
    clearTimeout(gameTimer);
    $('#game').hidden = true;
    $('#game-field').textContent = '';
  }

  /* ---------- Frasco ---------- */
  function jarSvg(entries, animate) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (name, attrs) => {
      const n = document.createElementNS(NS, name);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    };
    const root = el('svg', { viewBox: '0 0 220 250', width: '176', height: '200', role: 'img' });
    root.appendChild(el('rect', { x: '30', y: '52', width: '160', height: '190', rx: '30', class: 'jar-glass' }));
    const colors = { S: '#CFC8F0', M: '#F7DA7B', L: '#A9D8BC' };
    const shown = entries.slice(-50);
    const cols = 5, x0 = 44, x1 = 176, y1 = 226, rowH = 16, cw = (x1 - x0) / cols;
    shown.forEach((e, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      let h = 0;
      for (const ch of `${e.id}${i}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const x = x0 + cw * (col + 0.5) + ((h % 9) - 4) + (row % 2 ? cw * 0.18 : 0);
      const y = y1 - 8 - row * rowH + (((h >> 4) % 5) - 2);
      const rot = ((h >> 8) % 60) - 30;
      const g = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})` });
      const inner = el('g', { class: 'jp' });
      inner.appendChild(el('rect', { x: '-13', y: '-5.5', width: '26', height: '11', rx: '5.5', fill: colors[e.size] || colors.M, stroke: '#2A2440', 'stroke-width': '1.5' }));
      if (animate) inner.style.animationDelay = `${Math.min(i * 24, 1100)}ms`;
      g.appendChild(inner);
      root.appendChild(g);
    });
    root.appendChild(el('rect', { x: '30', y: '52', width: '160', height: '190', rx: '30', class: 'jar-rim', fill: 'none' }));
    root.appendChild(el('rect', { x: '58', y: '14', width: '104', height: '30', rx: '10', class: 'jar-lid' }));
    root.appendChild(el('rect', { x: '70', y: '40', width: '80', height: '14', rx: '4', class: 'jar-neck' }));
    return root;
  }

  function countUp(el, to, fmt) {
    if (motion() !== 'full' || to <= 1) { el.textContent = fmt(to, to); return; }
    const t0 = performance.now(), ms = 650;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))), to);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderJar(animate = false) {
    const today = dateKey();
    const jar = [...state.jar].sort((a, b) => a.at - b.at);
    const byDay = {};
    jar.forEach((j) => { const k = dateKey(new Date(j.at)); (byDay[k] = byDay[k] || []).push(j); });

    const art = $('#jar-art');
    art.textContent = '';
    art.appendChild(jarSvg(jar, animate && motion() === 'full'));

    const total = jar.length;
    countUp($('#jar-total'), total, (n, to) => (to === 0 ? 'Tu frasco está vacío, por ahora.'
      : n === 1 ? 'Llevas 1 pastilla.' : `Llevas ${n} pastillas.`));
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));
    const week = days.reduce((n, k) => n + (byDay[k] ? byDay[k].length : 0), 0);
    const hoy = byDay[today] ? byDay[today].length : 0;
    $('#jar-sub').textContent = total === 0
      ? 'Cada tarea que termines suma una.'
      : `Hoy ${hoy} · Últimos 7 días ${week}${total > 50 ? ' · El frasco está lleno; sigues sumando.' : ''}`;

    const wk = $('#jar-week');
    wk.textContent = '';
    const max = Math.max(1, ...days.map((k) => (byDay[k] ? byDay[k].length : 0)));
    days.forEach((k) => {
      const n = byDay[k] ? byDay[k].length : 0;
      const col = document.createElement('div');
      col.className = 'jw-col';
      const num = document.createElement('span');
      num.className = 'jw-n';
      num.textContent = n ? String(n) : '';
      const bar = document.createElement('div');
      bar.className = 'jw-bar' + (k === today ? ' today' : '');
      const h = `${6 + (n / max) * 44}px`;
      if (animate && motion() !== 'off') {
        bar.style.height = '6px';
        requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.height = h; }));
      } else {
        bar.style.height = h;
      }
      const lab = document.createElement('span');
      lab.className = 'jw-l';
      lab.textContent = parseKey(k).toLocaleDateString('es', { weekday: 'narrow' }).toUpperCase();
      col.append(num, bar, lab);
      wk.appendChild(col);
    });

    const list = $('#jar-list');
    list.textContent = '';
    let shown = 0;
    [...days].reverse().forEach((k) => {
      if (!byDay[k] || shown >= 30) return;
      const h = document.createElement('p');
      h.className = 'jl-day';
      h.textContent = k === today ? 'Hoy' : cap(parseKey(k).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' }));
      list.appendChild(h);
      const ul = document.createElement('ul');
      [...byDay[k]].reverse().forEach((j) => {
        if (shown >= 30) return;
        const li = document.createElement('li');
        li.dataset.size = j.size || 'M';
        li.textContent = j.text;
        ul.appendChild(li);
        shown++;
      });
      list.appendChild(ul);
    });
  }
  function openJar() { renderJar(true); $('#jar').hidden = false; $('#jar-back').focus(); }
  function closeJar() { $('#jar').hidden = true; $('#add-input').focus(); }

  /* ---------- Cuenta y sincronización ---------- */
  function ago(ts) {
    if (!ts) return 'aún no se ha sincronizado';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'hace un momento';
    if (m < 60) return `hace ${m} min`;
    return new Date(ts).toLocaleString('es', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  }

  function renderAccount(st) {
    if (!sync) return;
    const conf = sync.configured, inn = sync.signedIn();
    $('#acc-unconf').hidden = conf;
    $('#acc-form').hidden = !conf || inn;
    $('#acc-in').hidden = !conf || !inn;
    if (!inn) return;
    const s = st || sync.status();
    $('#acc-status').textContent =
      s.phase === 'syncing' ? 'Sincronizando…' :
      s.phase === 'offline' ? `Conectado como ${s.email}. Sin conexión: se reintentará sola.` :
      s.phase === 'error' ? `Conectado como ${s.email}. ${s.error}` :
      `Conectado como ${s.email}. Última sincronización: ${ago(s.last)}.`;
    $('#acc-sync').disabled = s.phase === 'syncing';
  }

  function accMsg(text, isErr) {
    const m = $('#acc-msg');
    m.textContent = text || '';
    m.classList.toggle('err', !!isErr);
  }

  // Lo que llegó de otro equipo ya está mezclado en el estado: se refresca la pantalla
  function applyMerged() {
    state.tasks.filter((t) => t.status === 'done').forEach(recordJar);
    rollover();
    window.PoquitoSync.stamp(state);
    window.api.save(state);
    if (!editingId) render();
  }

  async function accRun(fn) {
    const btns = document.querySelectorAll('#account .btn');
    btns.forEach((b) => { b.disabled = true; });
    accMsg('');
    try { await fn(); } catch (e) { accMsg(e.message || 'No se pudo completar.', true); }
    btns.forEach((b) => { b.disabled = false; });
    renderAccount();
  }

  function bindAccount() {
    const creds = () => ({ email: $('#acc-email').value.trim(), pass: $('#acc-pass').value });
    $('#acc-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const { email, pass } = creds();
      if (!email || !pass) { accMsg('Escribe tu correo y tu contraseña.', true); return; }
      accRun(async () => {
        await sync.signIn(email, pass);
        $('#acc-pass').value = '';
        accMsg('Listo. Sincronizando tus tareas…');
        await sync.syncNow();
        accMsg('');
      });
    });
    $('#acc-signup').addEventListener('click', () => {
      const { email, pass } = creds();
      if (!email || !pass) { accMsg('Escribe un correo y una contraseña para crear la cuenta.', true); return; }
      accRun(async () => {
        const r = await sync.signUp(email, pass);
        $('#acc-pass').value = '';
        if (r.needsConfirm) { accMsg('Te enviamos un correo para confirmar la cuenta. Después, inicia sesión aquí.'); return; }
        accMsg('Cuenta creada. Sincronizando tus tareas…');
        await sync.syncNow();
        accMsg('');
      });
    });
    $('#acc-sync').addEventListener('click', () => accRun(async () => { await sync.syncNow(); }));
    $('#acc-out').addEventListener('click', () => accRun(async () => {
      await sync.signOut();
      accMsg('Sesión cerrada. Tus tareas siguen en este equipo.');
    }));
  }

  /* ---------- Ajustes ---------- */
  function openSettings() {
    renderAccount();
    const s = state.settings;
    $('#set-cap').checked = s.capacityOn !== false;
    $('#set-reward').value = s.reward || 'soft';
    $('#set-motion').value = s.motion || 'soft';
    $('#set-bar').checked = s.showInTaskbar !== false;
    $('#set-morning').checked = !!s.morningEnabled;
    $('#set-time').value = s.morningTime || '09:00';
    $('#row-time').hidden = !s.morningEnabled;
    $('#set-nudge').value = String(s.nudgeMinutes ?? 60);
    $('#set-silent').checked = !!s.silent;
    $('#set-autostart').checked = !!s.autostart;
    $('#set-autostart').disabled = !isPackaged;
    $('#autostart-hint').textContent = isPackaged
      ? 'Así tus pastillas siempre están ahí.'
      : 'Disponible en la versión instalada.';
    $('#settings').hidden = false;
    $('#settings-back').focus();
  }
  function closeSettings() {
    $('#settings').hidden = true;
    $('#add-input').focus();
  }

  function bindSettings() {
    const s = () => state.settings;
    $('#set-cap').addEventListener('change', (e) => { s().capacityOn = e.target.checked; save(); render(); });
    $('#set-reward').addEventListener('change', (e) => { s().reward = e.target.value; save(); });
    $('#set-motion').addEventListener('change', (e) => { s().motion = e.target.value; save(); applyMotion(); });
    $('#set-bar').addEventListener('change', (e) => { s().showInTaskbar = e.target.checked; save(); });
    $('#reset-bar').addEventListener('click', () => window.api.resetBar());
    $('#set-morning').addEventListener('change', (e) => {
      s().morningEnabled = e.target.checked;
      $('#row-time').hidden = !e.target.checked;
      save();
    });
    $('#set-time').addEventListener('change', (e) => { s().morningTime = e.target.value || '09:00'; save(); });
    $('#set-nudge').addEventListener('change', (e) => { s().nudgeMinutes = Number(e.target.value); save(); });
    $('#set-silent').addEventListener('change', (e) => { s().silent = e.target.checked; save(); });
    $('#set-autostart').addEventListener('change', (e) => { s().autostart = e.target.checked; save(); });
    $('#test-notif').addEventListener('click', () => window.api.testNotification());
    $('#quit-btn').addEventListener('click', () => window.api.quit());
    $('#settings-back').addEventListener('click', closeSettings);
  }


  /* ---------- Arrastrar y soltar ---------- */
  let drag = null;   // { id, li, height }

  function bindDragAndDrop() {
    const list = $('#list');

    const finishDrag = () => {
      if (drag && drag.li) drag.li.classList.remove('drag-source');
      drag = null;
      list.classList.remove('is-dragging');
      document.body.classList.remove('dragging');
      list.querySelectorAll('.drop-gap').forEach((n) => n.remove());
      list.querySelectorAll('.drop-hover').forEach((n) => n.classList.remove('drop-hover'));
      document.querySelectorAll('.nav-btn').forEach((n) => n.classList.remove('can-drop', 'drop-hover'));
    };

    list.addEventListener('dragstart', (e) => {
      const el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
      const li = el && el.closest('.pill');
      if (!li || !li.draggable) { e.preventDefault(); return; }
      drag = { id: li.dataset.id, li, height: li.offsetHeight };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', drag.id);
      // Cambiamos el aspecto después del primer instante para no cancelar el arrastre
      setTimeout(() => {
        if (!drag) return;
        li.classList.add('drag-source');
        list.classList.add('is-dragging');
        document.body.classList.add('dragging');
        const today = dateKey();
        $('#next').classList.add('can-drop');
        if (addDays(viewDate, -1) >= today) $('#prev').classList.add('can-drop');
      }, 0);
    });

    list.addEventListener('dragover', (e) => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const groups = [...list.querySelectorAll('.group')].filter((g) => g.offsetParent !== null);
      if (!groups.length) return;
      const dist = (g) => {
        const r = g.getBoundingClientRect();
        return e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      };
      const group = groups.reduce((best, g) => (dist(g) < dist(best) ? g : best), groups[0]);
      const ul = group.querySelector('.pills');

      let before = null;
      for (const p of ul.querySelectorAll('.pill')) {
        if (p === drag.li) continue;
        const r = p.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { before = p; break; }
      }
      let gap = list.querySelector('.drop-gap');
      if (!gap) {
        gap = document.createElement('li');
        gap.className = 'drop-gap';
        gap.style.height = `${drag.height}px`;
      }
      if (gap.parentNode !== ul || gap.nextElementSibling !== before) ul.insertBefore(gap, before);
      list.querySelectorAll('.group').forEach((g) => g.classList.toggle('drop-hover', g === group));
    });

    list.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault();
      const gap = list.querySelector('.drop-gap');
      const ul = gap && gap.parentNode;
      if (!ul) { finishDrag(); return; }
      const ids = [];
      for (const el of ul.children) {
        if (el === gap) ids.push(drag.id);
        else if (el.classList.contains('pill') && el !== drag.li) ids.push(el.dataset.id);
      }
      const id = drag.id, status = ul.dataset.status;
      finishDrag();
      applyDrop(id, status, ids);
    });

    list.addEventListener('dragend', finishDrag);

    // Soltar sobre ‹ o › para pasar la pastilla al día anterior o siguiente
    [['#prev', -1], ['#next', 1]].forEach(([sel, delta]) => {
      const btn = $(sel);
      const target = () => addDays(viewDate, delta);
      const ok = () => drag && target() >= dateKey();
      btn.addEventListener('dragover', (e) => {
        if (!ok()) return;
        e.preventDefault();
        btn.classList.add('drop-hover');
      });
      btn.addEventListener('dragleave', () => btn.classList.remove('drop-hover'));
      btn.addEventListener('drop', (e) => {
        if (!ok()) return;
        e.preventDefault();
        const id = drag.id, date = target();
        finishDrag();
        moveToDate(id, date);
      });
    });
  }

  /* ---------- Eventos ---------- */
  function bindEvents() {
    $('#prev').innerHTML = ICON.prev;
    $('#next').innerHTML = ICON.next;
    $('#mode-btn').innerHTML = ICON.pin;
    $('#settings-btn').innerHTML = ICON.sliders;
    $('#hide-btn').innerHTML = ICON.close;
    $('#settings-back').innerHTML = ICON.back;
    $('#jar-back').innerHTML = ICON.back;
    $('#jar-btn').insertAdjacentHTML('afterbegin', ICON.jar);

    $('#prev').addEventListener('click', () => { navDir = -1; viewDate = addDays(viewDate, -1); render(); });
    $('#next').addEventListener('click', () => { navDir = 1; viewDate = addDays(viewDate, 1); render(); });
    $('#day').addEventListener('click', () => { const to = dateKey(); navDir = to < viewDate ? -1 : 1; viewDate = to; render(); });
    $('#mode-btn').addEventListener('click', () => setMode(isSticker() ? 'panel' : 'sticker'));
    $('#settings-btn').addEventListener('click', openSettings);
    $('#jar-btn').addEventListener('click', openJar);
    $('#jar-back').addEventListener('click', closeJar);
    $('#game-close').addEventListener('click', closeGame);
    $('#quota-move').addEventListener('click', moveOverflow);
    document.querySelectorAll('#energy button').forEach((b) => b.addEventListener('click', () => {
      state.energy[viewDate] = b.dataset.e;
      state.settings.lastEnergy = b.dataset.e;
      save();
      render();
    }));
    $('#add-size').addEventListener('click', () => {
      state.settings.lastSize = NEXT_SIZE[WEIGHT[state.settings.lastSize] ? state.settings.lastSize : 'M'];
      save();
      renderAddSize();
      $('#add-input').focus();
    });
    $('#hide-btn').addEventListener('click', () => window.api.hide());
    $('#toast-undo').addEventListener('click', () => { const fn = undoFn; hideToast(); if (fn) fn(); });

    $('#add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#add-input');
      addTask(input.value);
      input.value = '';
    });

    $('#list').addEventListener('click', (e) => {
      const li = e.target.closest('.pill');
      if (!li) return;
      const id = li.dataset.id;
      if (e.target.closest('.state-btn')) {
        if (viewDate < dateKey()) return;
        cycleStatus(id);
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      ({
        repeat: toggleRoutine,
        size: cycleSize,
        later: moveToNextDay,
        edit: (i) => { editingId = i; render(); },
        delete: deleteTask,
      })[act.dataset.act](id);
    });

    bindDragAndDrop();

    $('#list').addEventListener('keydown', (e) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const li = e.target.closest && e.target.closest('.pill');
      if (!li) return;
      e.preventDefault();
      reorder(li.dataset.id, e.key === 'ArrowUp' ? -1 : 1);
    });

    $('#list').addEventListener('dblclick', (e) => {
      const text = e.target.closest('.pill-text');
      if (!text || viewDate < dateKey()) return;
      editingId = text.closest('.pill').dataset.id;
      render();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#game').hidden) { closeGame(); return; }
      if (!$('#jar').hidden) { closeJar(); return; }
      if (!$('#settings').hidden) { closeSettings(); return; }
      const input = $('#add-input');
      if (input.value) { input.value = ''; return; }
      if (!isSticker()) window.api.hide();
    });

    window.addEventListener('focus', () => { checkDay(); if (sync && sync.signedIn()) sync.syncNow(); });

    window.api.onFocusInput(() => {
      checkDay();
      if (!isSticker() && motion() !== 'off') {
        $('#shell').animate([{ opacity: 0, transform: 'translateY(10px) scale(.985)' }, { opacity: 1, transform: 'none' }],
          { duration: 190, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      if ($('#settings').hidden && $('#jar').hidden && $('#game').hidden && !$('#add-form').hidden) $('#add-input').focus();
    });
    window.api.onRequestMode((mode) => setMode(mode));
    window.api.onPatchSettings((patch) => {
      Object.assign(state.settings, patch);
      save();
      if (!$('#settings').hidden) openSettings();
    });
    window.api.onBarSetStatus((id, status) => {
      const t = state.tasks.find((x) => x.id === id);
      if (!t) return;
      const prev = applyStatus(t, status);
      commit(id);
      if (status === 'done') celebrate(t, prev);
    });

    bindSettings();
    bindAccount();
  }

  // Solo redibuja si algo cambió (nuevo día, tareas que pasan a hoy),
  // para no interrumpir a quien está escribiendo.
  function checkDay() {
    const today = dateKey();
    let changed = false;
    if (today !== lastToday) {
      if (viewDate === lastToday) viewDate = today;
      lastToday = today;
      changed = true;
    }
    if (rollover()) { save(); changed = true; }
    if (changed && !editingId) render();
  }

  /* ---------- Inicio ---------- */
  async function init() {
    bindEvents();
    const data = await window.api.load();
    state = data.state;
    state.energy = state.energy || {};
    state.jar = Array.isArray(state.jar) ? state.jar : [];
    state.tasks.filter((t) => t.status === 'done').forEach(recordJar);   // lo ya hecho también cuenta
    isPackaged = data.isPackaged;
    applyMotion();
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyMotion);
    doneOpen = true;
    if (rollover()) save();
    render();
    if (!$('#add-form').hidden) $('#add-input').focus();
    setInterval(checkDay, 30000);

    sync = window.PoquitoSync.create({
      config: window.POQUITO_SYNC,
      store: { get: () => window.api.sessionGet(), set: (v) => window.api.sessionSet(v) },
      getState: () => state,
      onMerged: applyMerged,
      onStatus: (st) => { if (!$('#settings').hidden) renderAccount(st); },
    });
    await sync.start();
    setInterval(() => { if (!$('#settings').hidden) renderAccount(); }, 30000);
  }

  init();
})();
