(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const chip = $('#chip'), stateBtn = $('#state'), textEl = $('#text'), moreEl = $('#more');

  const ICON = {
    todo: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2.8"/></svg>',
    doing: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5a11 11 0 0 0 0 22z" fill="currentColor"/><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2.8"/></svg>',
    done: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.3" fill="currentColor"/><path d="M10.5 16.5l4 4 7.5-8.5" fill="none" stroke="var(--pill-bg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // vista previa al pasar el cursor: el círculo muestra el check que pondrá
    check: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2.8"/><path d="M10.8 16.4l3.9 3.9 6.6-7.6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2.8" stroke-dasharray="4 3.2"/><path d="M16 11v10M11 16h10" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>',
  };

  let current = null;     // último resumen recibido
  let lastText = null;
  let shown = null;       // lo que se está dibujando
  let holdUntil = 0;      // durante el destello de "hecho" no cambiamos de tarea
  let pending = null;
  let holdTimer = null;

  function render(s) {
    shown = s;
    stateBtn.classList.remove('hover');
    if (s.state === 'task') {
      chip.dataset.status = s.status;
      chip.classList.remove('finished');
      stateBtn.innerHTML = ICON[s.status];
      stateBtn.disabled = false;
      stateBtn.title = 'Marcar como hecha';
      if (lastText !== null && lastText !== s.text && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        textEl.animate([{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
          { duration: 200, easing: 'ease-out' });
      }
      lastText = s.text;
      textEl.textContent = s.text;
      moreEl.textContent = s.more > 0 ? `+${s.more}` : '';
      chip.title = (s.status === 'doing' ? 'En proceso: ' : 'Por hacer: ') + s.text +
        (s.more > 0 ? `\n${s.more} más pendientes hoy` : '') +
        '\nClic en el círculo: marcar como hecha · Clic en el resto: abrir Poquito';
    } else if (s.state === 'alldone') {
      chip.dataset.status = 'done';
      chip.classList.remove('finished');
      stateBtn.innerHTML = ICON.done;
      stateBtn.disabled = true;
      textEl.textContent = 'Todo listo por hoy';
      moreEl.textContent = '';
      chip.title = 'Todo listo por hoy. Puedes descansar.';
    } else {
      chip.dataset.status = 'todo';
      chip.classList.remove('finished');
      stateBtn.innerHTML = ICON.plus;
      stateBtn.disabled = true;
      textEl.textContent = 'Añade una tarea';
      moreEl.textContent = '';
      chip.title = 'Nada para hoy. Clic para añadir una tarea.';
    }
    requestAnimationFrame(fit);
  }

  function onUpdate(s) {
    current = s;
    if (Date.now() < holdUntil) { pending = s; return; }
    render(s);
  }

  // Ancho justo para el texto (la ventana se ancla junto a la bandeja)
  function fit() {
    const natural = chip.offsetWidth - textEl.clientWidth + textEl.scrollWidth;
    window.api.bar.resize(Math.ceil(natural) + 20);
  }

  // Destello de "hecho": check, verde y texto tachado durante un momento, luego la siguiente tarea
  function markDone() {
    if (!shown || shown.state !== 'task' || !shown.id) return;
    const id = shown.id;
    chip.dataset.status = 'done';
    chip.classList.add('finished');
    stateBtn.innerHTML = ICON.done;
    stateBtn.disabled = true;
    stateBtn.title = '';
    holdUntil = Date.now() + 1100;
    pending = current;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { holdUntil = 0; if (pending) render(pending); }, 1100);
    window.api.bar.setStatus(id, 'done');
  }

  stateBtn.addEventListener('click', (e) => { e.stopPropagation(); markDone(); });
  stateBtn.addEventListener('mouseenter', () => {
    if (!stateBtn.disabled && shown && shown.state === 'task') stateBtn.innerHTML = ICON.check;
  });
  stateBtn.addEventListener('mouseleave', () => {
    if (!stateBtn.disabled && shown && shown.state === 'task') stateBtn.innerHTML = ICON[shown.status];
  });

  chip.addEventListener('click', () => window.api.bar.click());
  chip.addEventListener('contextmenu', (e) => { e.preventDefault(); window.api.bar.menu(); });

  // Mover a lo largo de la barra desde el asa
  const grip = $('#grip');
  grip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    window.api.bar.dragStart();
  });
  const endDrag = (e) => {
    if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId);
    window.api.bar.dragEnd();
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('click', (e) => e.stopPropagation());

  window.api.bar.onUpdate(onUpdate);
  window.api.bar.ready();
})();
