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

  const svg = (paths) =>
    `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

  const ICON = {
    dots: svg('<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
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
    done: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.3" fill="currentColor"/><path d="M10.5 16.5l4 4 7.5-8.5" fill="none" stroke="var(--pill-bg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const STATUS_LABEL = {
    todo: { title: 'Por hacer. Clic para empezar', next: 'doing' },
    doing: { title: 'En proceso. Clic para marcar como hecha', next: 'done' },
    done: { title: 'Hecha. Clic para volver a por hacer', next: 'todo' },
  };

  /* ---------- Estado ---------- */
  let state = { tasks: [], routines: [], settings: {}, meta: {} };
  let isPackaged = false;
  let viewDate = dateKey();
  let weekStart = dateKey();          // la tira muestra 7 días desde aquí (por defecto, desde hoy)
  let lastToday = viewDate;
  let lastChangedId = null;
  let editingId = null;
  let doneOpen = true;
  let toastTimer = null;
  let undoFn = null;

  const save = () => window.api.save(state);
  const isSticker = () => false;   // en el celular no hay modo pegatina
  const isMobile = true;

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
        id: uid(), text: r.text, status: 'todo', date: day,
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
    const t = { id: uid(), text, status: 'todo', date: viewDate, createdAt: Date.now() };
    state.tasks.push(t);
    commit(t.id);
  }

  function cycleStatus(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    t.status = STATUS_LABEL[t.status].next;
    if (t.status === 'done') t.doneAt = Date.now();
    else delete t.doneAt;
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
    if (t.status !== status) {
      t.status = status;
      if (status === 'done') t.doneAt = Date.now(); else delete t.doneAt;
    }
    idsInOrder.forEach((tid, i) => {
      const x = state.tasks.find((q) => q.id === tid);
      if (x) x.order = i;
    });
    commit(id);
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
  function showToast(msg, undo) {
    clearTimeout(toastTimer);
    undoFn = undo || null;
    $('#toast-msg').textContent = msg;
    $('#toast-undo').hidden = !undo;
    $('#toast').hidden = false;
    toastTimer = setTimeout(hideToast, 5000);
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
    const date = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
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
  }

  function renderWeek() {
    const wrap = $('#week');
    const today = dateKey();
    while (viewDate < weekStart) weekStart = addDays(weekStart, -7);
    while (viewDate > addDays(weekStart, 6)) weekStart = addDays(weekStart, 7);
    const start = weekStart;
    wrap.textContent = '';
    for (let i = 0; i < 7; i++) {
      const key = addDays(start, i);
      const d = parseKey(key);
      const open = state.tasks.some((t) =>
        t.status !== 'done' && (key === today ? t.date <= today : t.date === key));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wk' + (key === today ? ' is-today' : '') + (key < today ? ' is-past' : '');
      b.dataset.date = key;
      b.setAttribute('aria-pressed', String(key === viewDate));
      b.setAttribute('aria-label', d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));
      b.innerHTML = `<span class="wk-l">${d.toLocaleDateString('es', { weekday: 'narrow' }).toUpperCase()}</span>` +
        `<span class="wk-n">${d.getDate()}</span><span class="wk-dot${open ? ' on' : ''}"></span>`;
      wrap.appendChild(b);
    }
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

    const readOnly = viewDate < dateKey();
    const label = STATUS_LABEL[t.status].title;

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
      ${readOnly || editingId === t.id ? '' : `
      <button class="kebab" type="button" data-act="menu" aria-label="Opciones de esta tarea">${ICON.dots}</button>`}`;

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

  function render() {
    if (viewDate >= dateKey() && ensureRoutines(viewDate)) save();
    const tasks = state.tasks.filter((t) => t.date === viewDate);

    document.body.classList.toggle('sticker', isSticker());
    renderHeader();
    renderWeek();
    renderProgress(tasks);
    $('#add-form').hidden = viewDate < dateKey();
    renderList(tasks);
    lastChangedId = null;
  }

  /* ---------- Ajustes ---------- */
  function openSettings() {
    const s = state.settings;
    $('#set-morning').checked = !!s.morningEnabled;
    $('#set-time').value = s.morningTime || '09:00';
    $('#row-time').hidden = !s.morningEnabled;
    $('#set-nudge').value = String(s.nudgeMinutes ?? 60);
    $('#set-silent').checked = !!s.silent;
    $('#settings').hidden = false;
  }
  function closeSettings() {
    $('#settings').hidden = true;
  }

  function bindSettings() {
    const s = () => state.settings;
    $('#set-morning').addEventListener('change', (e) => {
      s().morningEnabled = e.target.checked;
      $('#row-time').hidden = !e.target.checked;
      save();
    });
    $('#set-time').addEventListener('change', (e) => { s().morningTime = e.target.value || '09:00'; save(); });
    $('#set-nudge').addEventListener('change', (e) => { s().nudgeMinutes = Number(e.target.value); save(); });
    $('#set-silent').addEventListener('change', (e) => { s().silent = e.target.checked; save(); });
    $('#perm-btn').addEventListener('click', async () => {
      const ok = await window.api.requestNotifications();
      showToast(ok ? 'Avisos permitidos' : 'Sin permiso. Actívalo en Ajustes del teléfono → Apps → Poquito → Notificaciones.');
    });
    $('#test-notif').addEventListener('click', async () => {
      const ok = await window.api.testNotification();
      showToast(ok ? 'Te llegará un aviso en unos segundos' : 'Primero permite los avisos');
    });
    $('#settings-back').addEventListener('click', closeSettings);
  }

  /* ---------- Cambiar estado (usado por el menú y los gestos) ---------- */
  function setStatus(id, status) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    t.status = status;
    if (status === 'done') t.doneAt = Date.now(); else delete t.doneAt;
    commit(id);
  }

  /* ---------- Menú de la tarea (hoja inferior) ---------- */
  let sheetId = null;
  function openSheet(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t || viewDate < dateKey()) return;
    sheetId = id;
    $('#sheet-title').textContent = t.text;
    document.querySelectorAll('#sheet-status button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.status === t.status));
    });
    $('#sheet-repeat-label').textContent = t.routineId ? 'Dejar de repetir cada día' : 'Repetir cada día';
    $('#sheet').hidden = false;
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    sheetId = null;
  }
  function bindSheet() {
    $('#sheet-backdrop').addEventListener('click', closeSheet);
    document.querySelectorAll('#sheet-status button').forEach((b) => {
      b.addEventListener('click', () => {
        const id = sheetId; closeSheet(); if (id) setStatus(id, b.dataset.status);
      });
    });
    $('#sheet-edit').addEventListener('click', () => { const id = sheetId; closeSheet(); editingId = id; render(); });
    $('#sheet-repeat').addEventListener('click', () => { const id = sheetId; closeSheet(); if (id) toggleRoutine(id); });
    $('#sheet-later').addEventListener('click', () => { const id = sheetId; closeSheet(); if (id) moveToNextDay(id); });
    $('#sheet-delete').addEventListener('click', () => { const id = sheetId; closeSheet(); if (id) deleteTask(id); });
  }

  /* ---------- Gestos: mantener para mover, deslizar para completar ---------- */
  let drag = null;   // { id, li, height }

  function updateDragTarget(clientY) {
    const list = $('#list');
    const groups = [...list.querySelectorAll('.group')].filter((g) => g.offsetParent !== null);
    if (!groups.length) return;
    const dist = (g) => {
      const r = g.getBoundingClientRect();
      return clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
    };
    const group = groups.reduce((best, g) => (dist(g) < dist(best) ? g : best), groups[0]);
    const ul = group.querySelector('.pills');
    let before = null;
    for (const p of ul.querySelectorAll('.pill')) {
      if (p === drag.li) continue;
      const r = p.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) { before = p; break; }
    }
    let gap = list.querySelector('.drop-gap');
    if (!gap) {
      gap = document.createElement('li');
      gap.className = 'drop-gap';
      gap.style.height = `${drag.height}px`;
    }
    if (gap.parentNode !== ul || gap.nextElementSibling !== before) ul.insertBefore(gap, before);
    list.querySelectorAll('.group').forEach((g) => g.classList.toggle('drop-hover', g === group));
  }

  function dropAtGap() {
    const list = $('#list');
    const gap = list.querySelector('.drop-gap');
    const ul = gap && gap.parentNode;
    if (!ul) return;
    const ids = [];
    for (const el of ul.children) {
      if (el === gap) ids.push(drag.id);
      else if (el.classList.contains('pill') && el !== drag.li) ids.push(el.dataset.id);
    }
    const id = drag.id, status = ul.dataset.status;
    cleanupDrag();
    applyDrop(id, status, ids);
  }

  function cleanupDrag() {
    const list = $('#list');
    if (drag && drag.li) drag.li.classList.remove('drag-source');
    drag = null;
    list.classList.remove('is-dragging');
    document.body.classList.remove('dragging');
    list.querySelectorAll('.drop-gap').forEach((n) => n.remove());
    list.querySelectorAll('.drop-hover').forEach((n) => n.classList.remove('drop-hover'));
    document.querySelectorAll('.nav-btn, .wk').forEach((n) => n.classList.remove('can-drop', 'drop-hover'));
  }

  function bindGestures() {
    const list = $('#list');
    const LONG = 380, SLOP = 9, SWIPE_AT = 96;
    let g = null;

    const navUnder = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const btn = el && el.closest && el.closest('.nav-btn, .wk');
      return btn && btn.classList.contains('can-drop') ? btn : null;
    };

    function startDrag() {
      if (!g || g.mode !== 'pending') return;
      g.mode = 'drag';
      const li = g.li, r = li.getBoundingClientRect();
      drag = { id: g.id, li, height: r.height };
      const clone = li.cloneNode(true);
      clone.classList.add('drag-clone');
      clone.style.width = `${r.width}px`;
      clone.style.left = `${r.left}px`;
      clone.style.top = `${r.top}px`;
      document.body.appendChild(clone);
      g.clone = clone;
      li.classList.add('drag-source');
      list.classList.add('is-dragging');
      document.body.classList.add('dragging');
      $('#next').classList.add('can-drop');
      if (addDays(viewDate, -1) >= dateKey()) $('#prev').classList.add('can-drop');
      document.querySelectorAll('.wk').forEach((b) => {
        if (b.dataset.date >= dateKey() && b.dataset.date !== viewDate) b.classList.add('can-drop');
      });
      window.api.haptic();
      updateDragTarget(g.y);
      g.scroller = setInterval(() => {
        const lr = list.getBoundingClientRect();
        const dir = g.y < lr.top + 70 ? -1 : g.y > lr.bottom - 70 ? 1 : 0;
        if (dir) { list.scrollTop += dir * 9; updateDragTarget(g.y); }
      }, 16);
    }

    function endGesture(commitIt) {
      if (!g) return;
      clearTimeout(g.timer);
      clearInterval(g.scroller);
      const cur = g; g = null;
      if (cur.clone) cur.clone.remove();

      if (cur.mode === 'drag') {
        const nav = commitIt ? navUnder(cur.x, cur.y) : null;
        if (nav && drag) {
          const id = drag.id;
          const date = nav.dataset.date || addDays(viewDate, nav.id === 'next' ? 1 : -1);
          cleanupDrag();
          moveToDate(id, date);
        } else if (commitIt) {
          dropAtGap();
        } else {
          cleanupDrag();
        }
      } else if (cur.mode === 'swipe') {
        const dx = cur.x - cur.x0, li = cur.li;
        li.classList.remove('swipe-done', 'swipe-later');
        li.style.transition = 'transform .18s ease, opacity .18s ease';
        if (commitIt && dx > SWIPE_AT) {
          const t = state.tasks.find((x) => x.id === cur.id);
          const prev = t ? t.status : 'todo';
          li.style.transform = 'translateX(110%)';
          li.style.opacity = '0';
          setTimeout(() => {
            if (prev === 'done') { setStatus(cur.id, 'todo'); showToast('Volvió a por hacer'); }
            else { setStatus(cur.id, 'done'); showToast('Hecha', () => setStatus(cur.id, prev)); }
          }, 170);
        } else if (commitIt && dx < -SWIPE_AT) {
          li.style.transform = 'translateX(-110%)';
          li.style.opacity = '0';
          setTimeout(() => moveToNextDay(cur.id), 170);
        } else {
          li.style.transform = '';
        }
      } else if (cur.mode === 'pending' && commitIt) {
        openSheet(cur.id);          // toque corto sobre la pastilla
      }
    }

    list.addEventListener('pointerdown', (e) => {
      if (g || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const li = e.target.closest('.pill');
      if (!li || e.target.closest('button, input')) return;
      if (viewDate < dateKey() || editingId === li.dataset.id) return;
      g = { id: li.dataset.id, li, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, mode: 'pending', pid: e.pointerId };
      try { list.setPointerCapture(e.pointerId); } catch { /* sin captura, seguimos */ }
      g.timer = setTimeout(startDrag, LONG);
    });

    list.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.pid) return;
      g.x = e.clientX; g.y = e.clientY;
      const dx = g.x - g.x0, dy = g.y - g.y0;
      if (g.mode === 'pending' && (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP)) {
        clearTimeout(g.timer);
        g.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'swipe' : 'scroll';
      }
      if (g.mode === 'swipe') {
        g.li.style.transition = 'none';
        g.li.style.transform = `translateX(${dx}px)`;
        const wasDone = g.li.classList.contains('swipe-done'), wasLater = g.li.classList.contains('swipe-later');
        g.li.classList.toggle('swipe-done', dx > SWIPE_AT);
        g.li.classList.toggle('swipe-later', dx < -SWIPE_AT);
        if ((dx > SWIPE_AT && !wasDone) || (dx < -SWIPE_AT && !wasLater)) window.api.haptic();
      } else if (g.mode === 'drag') {
        g.clone.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
        updateDragTarget(g.y);
        const nav = navUnder(g.x, g.y);
        document.querySelectorAll('.nav-btn, .wk').forEach((n) => n.classList.toggle('drop-hover', n === nav));
      }
    });

    list.addEventListener('pointerup', (e) => { if (g && e.pointerId === g.pid) endGesture(true); });
    list.addEventListener('pointercancel', (e) => { if (g && e.pointerId === g.pid) endGesture(false); });
    // Mientras arrastramos no debe desplazarse la lista con el dedo
    list.addEventListener('touchmove', (e) => { if (g && g.mode === 'drag') e.preventDefault(); }, { passive: false });
    list.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ---------- Eventos ---------- */
  function bindEvents() {
    $('#prev').innerHTML = ICON.prev;
    $('#next').innerHTML = ICON.next;
    $('#settings-btn').innerHTML = ICON.sliders;
    $('#settings-back').innerHTML = ICON.back;
    $('#add-btn').innerHTML = ICON.plus;

    $('#prev').addEventListener('click', () => { viewDate = addDays(viewDate, -1); render(); });
    $('#next').addEventListener('click', () => { viewDate = addDays(viewDate, 1); render(); });
    $('#day').addEventListener('click', () => { viewDate = dateKey(); weekStart = viewDate; render(); });
    $('#week').addEventListener('click', (e) => {
      const b = e.target.closest('.wk');
      if (b) { viewDate = b.dataset.date; render(); }
    });
    // Deslizar la tira: semana anterior o siguiente
    {
      const week = $('#week');
      let sx = null;
      week.addEventListener('pointerdown', (e) => { sx = e.clientX; });
      week.addEventListener('pointerup', (e) => {
        if (sx === null) return;
        const dx = e.clientX - sx; sx = null;
        if (Math.abs(dx) > 60) { viewDate = addDays(viewDate, dx < 0 ? 7 : -7); render(); }
      });
      week.addEventListener('pointercancel', () => { sx = null; });
    }
    $('#settings-btn').addEventListener('click', openSettings);
    $('#toast-undo').addEventListener('click', () => { const fn = undoFn; hideToast(); if (fn) fn(); });

    $('#add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#add-input');
      addTask(input.value);
      input.value = '';
      input.focus();
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
      if (e.target.closest('[data-act="menu"]')) openSheet(id);
    });

    bindGestures();
    bindSheet();
    bindSettings();

    // Cuando vuelves a la app (o cambia el día) se actualiza todo
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
    window.api.onResume(async () => {
      const fresh = await window.api.reload();
      if (fresh && !editingId) {
        state = fresh;
        if (rollover()) save();
        render();
      } else {
        checkDay();
      }
    });
    // Botón "atrás" de Android: cierra lo que esté abierto; si no, deja la app en segundo plano
    window.api.onBack(() => {
      if (!$('#sheet').hidden) { closeSheet(); return true; }
      if (!$('#settings').hidden) { closeSettings(); return true; }
      return false;
    });
  }

  // Solo redibuja si algo cambió (nuevo día, tareas que pasan a hoy),
  // para no interrumpir a quien está escribiendo.
  function checkDay() {
    const today = dateKey();
    let changed = false;
    if (today !== lastToday) {
      if (viewDate === lastToday) { viewDate = today; weekStart = today; }
      lastToday = today;
      changed = true;
    }
    if (rollover()) { save(); changed = true; }
    if (changed && !editingId) render();
  }

  /* ---------- Inicio ---------- */
  async function init() {
    document.body.classList.add('mobile');
    bindEvents();
    const data = await window.api.load();
    state = data.state;
    doneOpen = true;
    if (rollover()) save();
    render();
    setInterval(checkDay, 60000);
  }

  init();
})();
