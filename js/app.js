/* global Scheduler */
(function () {
  'use strict';

  // ======================================================================
  // Costanti
  // ======================================================================
  const STORES = [
    { id: 'deco-volla', name: 'Decò Volla' },
    { id: 'deco-casoria', name: 'Decò Casoria' },
    { id: 'md-volla', name: 'MD Volla' },
    { id: 'md-casoria', name: 'MD Casoria' },
    { id: 'md-somma', name: 'MD Somma' },
  ];
  const DEPTS = [
    { id: 'panetteria', name: 'Panetteria' },
    { id: 'salumeria', name: 'Salumeria' },
    { id: 'macelleria', name: 'Macelleria' },
    { id: 'pescheria', name: 'Pescheria' },
    { id: 'ortofrutta', name: 'Ortofrutta' },
    { id: 'casse', name: 'Casse' },
    { id: 'scaffali', name: 'Scaffali' },
  ];
  const DAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const SHIFT_NAMES = { M: 'Mattino', P: 'Pomeriggio' };
  const AVAIL_OPTIONS = [
    { v: '', label: 'Disponibile', short: '—' },
    { v: 'M', label: 'Solo mattino', short: 'Solo M' },
    { v: 'P', label: 'Solo pomeriggio', short: 'Solo P' },
    { v: 'X', label: 'Riposo', short: 'Riposo' },
  ];
  const STORAGE_KEY = 'gruppoRea.turni.v1';

  const storeName = (id) => (STORES.find((s) => s.id === id) || {}).name || id;
  const deptName = (id) => (DEPTS.find((d) => d.id === id) || {}).name || id;

  // ======================================================================
  // Utilità
  // ======================================================================
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
  const fmtShort = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const fmtLong = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const byName = (a, b) => a.name.localeCompare(b.name, 'it');

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ======================================================================
  // Stato e persistenza
  // ======================================================================
  function defaultNeed(deptId, day) {
    const base = deptId === 'casse' ? 3 : deptId === 'scaffali' ? 2 : 1;
    if (day === 6) return { M: Math.max(1, Math.ceil(base / 2)), P: 0 }; // domenica: solo mattina
    return { M: base, P: base };
  }

  function defaultRequirements() {
    const req = {};
    for (const s of STORES) {
      req[s.id] = {};
      for (const d of DEPTS) req[s.id][d.id] = DAY_NAMES.map((_, i) => defaultNeed(d.id, i));
    }
    return req;
  }

  function sampleEmployees() {
    const first = ['Antonio', 'Giuseppe', 'Maria', 'Anna', 'Salvatore', 'Carmela', 'Gennaro', 'Rosa', 'Ciro', 'Teresa',
      'Vincenzo', 'Giovanna', 'Francesco', 'Lucia', 'Pasquale', 'Assunta', 'Raffaele', 'Immacolata', 'Luigi', 'Anna Maria',
      'Ciro', 'Concetta', 'Mario', 'Patrizia', 'Domenico', 'Rita', 'Alessandro', 'Serena', 'Marco', 'Federica', 'Luca'];
    const last = ['Esposito', 'Russo', 'De Luca', 'Romano', 'Iovine', 'Capasso', 'Ferrara', 'Cozzolino', 'Silvestri',
      'Longobardi', 'Sorrentino', 'Amato', 'Improta', 'Caputo', 'Giordano', 'Marino', 'Ruggiero', 'Pagano', 'Grieco',
      'Liguori', 'Buonocore', 'Ascione', 'Coppola', 'Napolitano', 'Guarino', 'Ambrosio', 'Formisano'];
    const perDept = { panetteria: 3, salumeria: 3, macelleria: 3, pescheria: 3, ortofrutta: 3, casse: 8, scaffali: 6 };
    const out = [];
    let k = 0;
    STORES.forEach((store, si) => {
      for (const dept of DEPTS) {
        for (let i = 0; i < perDept[dept.id]; i++, k++) {
          const availability = ['', '', '', '', '', '', ''];
          if (k % 7 === 3) availability[(k + si) % 6] = 'X';
          if (k % 11 === 5) availability[(k + 2) % 6] = 'M';
          out.push({
            id: uid() + k,
            name: `${first[(k * 7 + si) % first.length]} ${last[(k * 5 + si * 3) % last.length]}`,
            store: store.id,
            dept: dept.id,
            maxShifts: 5,
            availability,
          });
        }
      }
    });
    return out;
  }

  function freshState(withSample) {
    return {
      version: 1,
      settings: {
        times: { M: { start: '07:00', end: '14:00' }, P: { start: '14:00', end: '21:00' } },
        defaultMaxShifts: 5,
        useHistory: true,
      },
      employees: withSample ? sampleEmployees() : [],
      requirements: defaultRequirements(),
      schedules: {}, // store -> weekISO -> { days: [{dept:{M:[],P:[]}}], generatedAt, seed }
      ui: { tab: 'plan', store: STORES[0].id, week: toISO(mondayOf(new Date())), view: 'dept', deptFilter: '' },
      sampleData: !!withSample,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* storage non disponibile o dati corrotti */ }
    return freshState(true);
  }

  function normalize(s) {
    const base = freshState(false);
    s.settings = Object.assign(base.settings, s.settings || {});
    s.settings.times = Object.assign(base.settings.times, s.settings.times || {});
    s.employees = Array.isArray(s.employees) ? s.employees : [];
    s.requirements = s.requirements || {};
    for (const st of STORES) {
      s.requirements[st.id] = s.requirements[st.id] || {};
      for (const d of DEPTS) {
        if (!Array.isArray(s.requirements[st.id][d.id])) s.requirements[st.id][d.id] = base.requirements[st.id][d.id];
      }
    }
    s.schedules = s.schedules || {};
    s.ui = Object.assign(base.ui, s.ui || {});
    if (!STORES.some((x) => x.id === s.ui.store)) s.ui.store = STORES[0].id;
    return s;
  }

  let state = load();
  let saveOk = true;
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saveOk = true;
    } catch (e) {
      if (saveOk) toast('Attenzione: impossibile salvare i dati nel browser');
      saveOk = false;
    }
  }

  // ======================================================================
  // Accesso ai dati
  // ======================================================================
  const storeEmployees = (store) => state.employees.filter((e) => e.store === store).sort(byName);
  const empById = (id) => state.employees.find((e) => e.id === id);
  const getSchedule = (store, week) => (state.schedules[store] || {})[week];
  function setSchedule(store, week, sched) {
    state.schedules[store] = state.schedules[store] || {};
    if (sched) state.schedules[store][week] = sched;
    else delete state.schedules[store][week];
  }
  const weekDates = (week) => DAY_NAMES.map((_, i) => addDays(fromISO(week), i));
  const shiftLabel = (s) => `${SHIFT_NAMES[s]} ${state.settings.times[s].start}–${state.settings.times[s].end}`;

  /** Conteggi M/P per dipendente sulle settimane salvate del punto vendita (opzionalmente prima di una data). */
  function historyCounts(store, beforeWeek) {
    const acc = {};
    const weeks = state.schedules[store] || {};
    for (const w of Object.keys(weeks)) {
      if (beforeWeek && w >= beforeWeek) continue;
      Scheduler.countShifts(weeks[w].days, acc);
    }
    return acc;
  }

  function workingOn(sched, day) {
    const map = {};
    for (const dept of Object.keys(sched.days[day] || {})) {
      for (const s of ['M', 'P']) for (const id of sched.days[day][dept][s] || []) map[id] = { dept, shift: s };
    }
    return map;
  }

  function shortagesOf(store, sched) {
    const req = state.requirements[store];
    const list = [];
    sched.days.forEach((day, d) => {
      for (const dept of DEPTS) {
        for (const s of ['M', 'P']) {
          const need = Number((req[dept.id][d] || {})[s]) || 0;
          const have = ((day[dept.id] || {})[s] || []).length;
          if (have < need) list.push({ day: d, dept: dept.id, shift: s, missing: need - have });
        }
      }
    });
    return list;
  }

  // ======================================================================
  // Generazione
  // ======================================================================
  function generateWeek(store, week, seed) {
    const result = Scheduler.generate({
      employees: storeEmployees(store),
      requirements: state.requirements[store],
      history: state.settings.useHistory ? historyCounts(store, week) : {},
      defaultMaxShifts: Number(state.settings.defaultMaxShifts) || 5,
      seed: seed || Math.floor(Math.random() * 1e9),
    });
    setSchedule(store, week, { days: result.schedule, generatedAt: new Date().toISOString() });
    save();
    return result;
  }

  // ======================================================================
  // Rendering
  // ======================================================================
  const view = document.getElementById('view');

  function render() {
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.tab === state.ui.tab));
    });
    const sel = document.getElementById('store-select');
    sel.innerHTML = STORES.map((s) => `<option value="${s.id}"${s.id === state.ui.store ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    const renderers = { plan: renderPlan, summary: renderSummary, employees: renderEmployees, needs: renderNeeds, settings: renderSettings };
    view.innerHTML = (renderers[state.ui.tab] || renderPlan)();
  }

  function sampleBanner() {
    if (!state.sampleData) return '';
    return `<div class="alert warn no-print">Stai usando <strong>dati di esempio</strong>. Sostituiscili con i tuoi dipendenti
      nella scheda <em>Dipendenti</em> oppure <button class="btn small" data-action="clear-sample">elimina i dipendenti di esempio</button>.</div>`;
  }

  function weekNav() {
    const dates = weekDates(state.ui.week);
    return `
      <div class="toolbar">
        <button class="btn" data-action="week-prev" aria-label="Settimana precedente">‹</button>
        <span class="week-label">${fmtLong(dates[0])} – ${fmtLong(dates[6])}</span>
        <button class="btn" data-action="week-next" aria-label="Settimana successiva">›</button>
        <button class="btn" data-action="week-today">Oggi</button>
        <input type="date" data-action="week-pick" value="${state.ui.week}" aria-label="Vai alla settimana">
      </div>`;
  }

  // ---------------------------- Turni ----------------------------
  function renderPlan() {
    const store = state.ui.store;
    const week = state.ui.week;
    const sched = getSchedule(store, week);
    const emps = storeEmployees(store);
    const dates = weekDates(week);

    let body;
    if (!emps.length) {
      body = `<div class="card empty"><p>Nessun dipendente registrato per <strong>${esc(storeName(store))}</strong>.</p>
        <button class="btn primary" data-action="goto" data-tab="employees">Aggiungi dipendenti</button></div>`;
    } else if (!sched) {
      body = `<div class="card empty"><p>Nessun turno pianificato per questa settimana.</p>
        <button class="btn primary" data-action="generate">Genera turni automaticamente</button></div>`;
    } else {
      const shortages = shortagesOf(store, sched);
      const alerts = shortages.length
        ? `<div class="alert danger"><strong>${shortages.reduce((a, s) => a + s.missing, 0)} posti scoperti.</strong>
            Aggiungi personale, riduci il fabbisogno o assegna colleghi di altri reparti.
            <ul>${shortages.slice(0, 8).map((s) => `<li>${DAY_NAMES[s.day]} · ${esc(deptName(s.dept))} · ${SHIFT_NAMES[s.shift]}: manca${s.missing > 1 ? 'no' : ''} ${s.missing}</li>`).join('')}
            ${shortages.length > 8 ? `<li>… e altri ${shortages.length - 8}</li>` : ''}</ul></div>`
        : '<div class="alert ok no-print">Tutti i turni della settimana sono coperti.</div>';
      body = `${alerts}
        <div class="print-only"><h2>${esc(storeName(store))} — Turni dal ${fmtLong(dates[0])} al ${fmtLong(dates[6])}</h2></div>
        ${state.ui.view === 'emp' ? renderPlanByEmployee(sched, emps, dates) : renderPlanByDept(sched, dates)}
        <div class="legend">
          <span><i style="background:var(--morning-line)"></i>${esc(shiftLabel('M'))}</span>
          <span><i style="background:var(--afternoon-line)"></i>${esc(shiftLabel('P'))}</span>
          <span class="no-print">Bordo tratteggiato: collega di un altro reparto · rosso: assegnato in un giorno di indisponibilità</span>
        </div>`;
    }

    return `${sampleBanner()}
      <div class="card no-print">
        <div class="toolbar">
          ${weekNav()}
          <span class="spacer"></span>
          <div class="toolbar" role="group" aria-label="Vista">
            <button class="btn small" data-action="view" data-view="dept" aria-pressed="${state.ui.view !== 'emp'}">Per reparto</button>
            <button class="btn small" data-action="view" data-view="emp" aria-pressed="${state.ui.view === 'emp'}">Per dipendente</button>
          </div>
        </div>
        <div class="toolbar" style="margin-top:10px">
          <button class="btn primary" data-action="generate" ${emps.length ? '' : 'disabled'}>${sched ? 'Rigenera turni' : 'Genera turni'}</button>
          <label class="check"><input type="checkbox" data-action="use-history" ${state.settings.useHistory ? 'checked' : ''}>
            Compensa lo storico delle settimane precedenti</label>
          <span class="spacer"></span>
          <button class="btn" data-action="export-csv" ${sched ? '' : 'disabled'}>Esporta CSV</button>
          <button class="btn" data-action="print" ${sched ? '' : 'disabled'}>Stampa</button>
          <button class="btn danger" data-action="clear-week" ${sched ? '' : 'disabled'}>Svuota settimana</button>
        </div>
      </div>
      ${body}`;
  }

  function renderPlanByDept(sched, dates) {
    const store = state.ui.store;
    const req = state.requirements[store];
    const emps = storeEmployees(store);
    const working = dates.map((_, d) => workingOn(sched, d));

    const head = `<tr><th>Reparto</th>${dates.map((dt, i) => `<th>${DAY_SHORT[i]}<span class="date">${fmtShort(dt)}</span></th>`).join('')}</tr>`;
    const rows = DEPTS.map((dept) => {
      const cells = dates.map((_, d) => {
        const need = req[dept.id][d] || { M: 0, P: 0 };
        const cell = (sched.days[d] || {})[dept.id] || { M: [], P: [] };
        if (!need.M && !need.P && !cell.M.length && !cell.P.length) return '<td><div class="closed">Chiuso</div></td>';
        return `<td>${['M', 'P'].map((s) => {
          const ids = cell[s] || [];
          const n = Number(need[s]) || 0;
          if (!n && !ids.length) return '';
          const short = ids.length < n;
          const chips = ids.map((id) => {
            const e = empById(id);
            if (!e) return '';
            const cls = [e.dept !== dept.id ? 'other-dept' : '', Scheduler.canWork(e, d, s) ? '' : 'conflict'].join(' ');
            const title = e.dept !== dept.id ? ` title="${esc(deptName(e.dept))}"` : '';
            return `<span class="chip ${cls}"${title}>${esc(e.name)}<button data-action="unassign" data-day="${d}" data-dept="${dept.id}" data-shift="${s}" data-id="${id}" aria-label="Rimuovi ${esc(e.name)}">×</button></span>`;
          }).join('');
          const free = emps.filter((e) => !working[d][e.id]);
          const opt = (e) => `<option value="${e.id}">${esc(e.name)}${Scheduler.canWork(e, d, s) ? '' : ' (non disponibile)'}</option>`;
          const same = free.filter((e) => e.dept === dept.id);
          const other = free.filter((e) => e.dept !== dept.id);
          const select = free.length ? `<select class="add-select" data-action="assign" data-day="${d}" data-dept="${dept.id}" data-shift="${s}" aria-label="Aggiungi al turno">
              <option value="">+ Aggiungi…</option>
              ${same.length ? `<optgroup label="${esc(dept.name)}">${same.map(opt).join('')}</optgroup>` : ''}
              ${other.length ? `<optgroup label="Altri reparti">${other.map(opt).join('')}</optgroup>` : ''}
            </select>` : '';
          return `<div class="shift ${s}${short ? ' short' : ''}">
              <div class="shift-head"><span>${SHIFT_NAMES[s]}</span><span class="shift-count${short ? ' short' : ''}">${ids.length}/${n}</span></div>
              <div class="chips">${chips}</div>${select}
            </div>`;
        }).join('')}</td>`;
      }).join('');
      return `<tr><th class="row-head">${esc(dept.name)}</th>${cells}</tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="plan-grid"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderPlanByEmployee(sched, emps, dates) {
    const working = dates.map((_, d) => workingOn(sched, d));
    const head = `<tr><th>Dipendente</th>${dates.map((dt, i) => `<th>${DAY_SHORT[i]} ${fmtShort(dt)}</th>`).join('')}
      <th class="num">Mattine</th><th class="num">Pomeriggi</th><th class="num">Totale</th></tr>`;
    const rows = DEPTS.map((dept) => {
      const list = emps.filter((e) => e.dept === dept.id);
      if (!list.length) return '';
      return `<tr class="group-row"><th colspan="${dates.length + 4}">${esc(dept.name)}</th></tr>` + list.map((e) => {
        let m = 0, p = 0;
        const cells = dates.map((_, d) => {
          const w = working[d][e.id];
          if (!w) return `<td><span class="badge R">${(e.availability || [])[d] === 'X' ? 'Riposo' : '—'}</span></td>`;
          if (w.shift === 'M') m++; else p++;
          const extra = w.dept !== e.dept ? ` <span class="pill">${esc(deptName(w.dept))}</span>` : '';
          return `<td><span class="badge ${w.shift}" title="${esc(shiftLabel(w.shift))}">${w.shift === 'M' ? 'M' : 'P'}</span>${extra}</td>`;
        }).join('');
        return `<tr><td>${esc(e.name)}</td>${cells}<td class="num">${m}</td><td class="num">${p}</td><td class="num"><strong>${m + p}</strong></td></tr>`;
      }).join('');
    }).join('');
    return `<div class="table-wrap"><table class="emp-grid"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---------------------------- Riepilogo ----------------------------
  function balanceCell(m, p) {
    const tot = m + p;
    const diff = m - p;
    const cls = Math.abs(diff) <= 1 ? 'ok' : Math.abs(diff) <= 3 ? 'warn' : 'bad';
    const pm = tot ? (m / tot) * 100 : 0;
    return `<div class="balance" title="${m} mattine, ${p} pomeriggi">
      <div class="balance-bar">${tot ? `<span class="m" style="width:${pm}%"></span><span class="p" style="width:${100 - pm}%"></span>` : ''}</div>
      <span class="delta ${cls}">${diff > 0 ? '+' : ''}${diff}</span></div>`;
  }

  function renderSummary() {
    const store = state.ui.store;
    const week = state.ui.week;
    const emps = storeEmployees(store);
    const sched = getSchedule(store, week);
    const weekCounts = sched ? Scheduler.countShifts(sched.days) : {};
    const allCounts = historyCounts(store);
    const nWeeks = Object.keys(state.schedules[store] || {}).length;
    const deptFilter = state.ui.deptFilter;

    const rows = DEPTS.filter((d) => !deptFilter || d.id === deptFilter).map((dept) => {
      const list = emps.filter((e) => e.dept === dept.id);
      if (!list.length) return '';
      return `<tr class="group-row"><th colspan="8">${esc(dept.name)}</th></tr>` + list.map((e) => {
        const w = weekCounts[e.id] || { M: 0, P: 0 };
        const a = allCounts[e.id] || { M: 0, P: 0 };
        return `<tr><td>${esc(e.name)}</td>
          <td class="num">${w.M}</td><td class="num">${w.P}</td><td class="num"><strong>${w.M + w.P}</strong></td>
          <td>${balanceCell(w.M, w.P)}</td>
          <td class="num">${a.M}</td><td class="num">${a.P}</td>
          <td>${balanceCell(a.M, a.P)}</td></tr>`;
      }).join('');
    }).join('');

    const dates = weekDates(week);
    return `${sampleBanner()}
      <div class="card no-print">
        <div class="toolbar">${weekNav()}
          <span class="spacer"></span>
          <select data-action="dept-filter" aria-label="Filtra reparto">
            <option value="">Tutti i reparti</option>
            ${DEPTS.map((d) => `<option value="${d.id}"${d.id === deptFilter ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card">
        <h2>Bilanciamento turni — ${esc(storeName(store))}</h2>
        <p class="hint">Settimana dal ${fmtLong(dates[0])} al ${fmtLong(dates[6])}${sched ? '' : ' (non ancora pianificata)'} e storico complessivo di ${nWeeks} settimane salvate.
          Il valore indica mattine meno pomeriggi: vicino a 0 significa turni bilanciati.</p>
        ${emps.length ? `<div class="table-wrap"><table>
          <thead><tr><th rowspan="2">Dipendente</th><th colspan="4">Settimana</th><th colspan="3">Storico totale</th></tr>
          <tr><th class="num">Mattine</th><th class="num">Pomeriggi</th><th class="num">Totale</th><th>Bilanciamento</th>
          <th class="num">Mattine</th><th class="num">Pomeriggi</th><th>Bilanciamento</th></tr></thead>
          <tbody>${rows}</tbody></table></div>` : '<p class="empty">Nessun dipendente registrato.</p>'}
      </div>`;
  }

  // ---------------------------- Dipendenti ----------------------------
  let editingId = null;

  function renderEmployees() {
    const store = state.ui.store;
    const emps = storeEmployees(store);
    const e = editingId ? empById(editingId) : null;
    const cur = e || { name: '', store, dept: state.ui.deptFilter || DEPTS[0].id, maxShifts: state.settings.defaultMaxShifts, availability: [] };
    const deptFilter = state.ui.deptFilter;

    const form = `<form class="card form-grid" id="emp-form" autocomplete="off">
        <h2>${e ? 'Modifica dipendente' : 'Nuovo dipendente'}</h2>
        <label class="field">Nome e cognome<input type="text" name="name" required value="${esc(cur.name)}" placeholder="Es. Mario Rossi"></label>
        <label class="field">Punto vendita<select name="store">${STORES.map((s) => `<option value="${s.id}"${s.id === cur.store ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field">Reparto<select name="dept">${DEPTS.map((d) => `<option value="${d.id}"${d.id === cur.dept ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label class="field">Turni massimi a settimana<input type="number" name="maxShifts" min="1" max="7" value="${esc(cur.maxShifts || state.settings.defaultMaxShifts)}"></label>
        <div class="field"><span>Disponibilità settimanale</span>
          <div class="avail-grid">${DAY_SHORT.map((d, i) => `<label>${d}<select name="av${i}">${AVAIL_OPTIONS.map((o) => `<option value="${o.v}"${((cur.availability || [])[i] || '') === o.v ? ' selected' : ''}>${o.short}</option>`).join('')}</select></label>`).join('')}</div>
        </div>
        <div class="toolbar">
          <button class="btn primary" type="submit">${e ? 'Salva modifiche' : 'Aggiungi dipendente'}</button>
          ${e ? '<button class="btn" type="button" data-action="cancel-edit">Annulla</button>' : ''}
        </div>
      </form>`;

    const list = emps.filter((x) => !deptFilter || x.dept === deptFilter);
    const table = list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>Reparto</th><th class="num">Max turni</th><th>Indisponibilità</th><th></th></tr></thead>
        <tbody>${list.map((x) => {
          const av = (x.availability || []).map((v, i) => v ? `<span class="pill">${DAY_SHORT[i]}: ${AVAIL_OPTIONS.find((o) => o.v === v).short}</span>` : '').join('');
          return `<tr><td><strong>${esc(x.name)}</strong></td><td>${esc(deptName(x.dept))}</td>
            <td class="num">${esc(x.maxShifts || state.settings.defaultMaxShifts)}</td><td>${av || '<span class="pill">Sempre disponibile</span>'}</td>
            <td><div class="row-actions"><button class="btn small" data-action="edit-emp" data-id="${x.id}">Modifica</button>
            <button class="btn small danger" data-action="delete-emp" data-id="${x.id}">Elimina</button></div></td></tr>`;
        }).join('')}</tbody></table></div>` : '<div class="empty">Nessun dipendente per questo filtro.</div>';

    const counts = DEPTS.map((d) => `${d.name}: ${emps.filter((x) => x.dept === d.id).length}`).join(' · ');
    return `${sampleBanner()}<div class="two-col">${form}
      <div class="card">
        <div class="toolbar" style="margin-bottom:10px">
          <h2 style="margin:0">Dipendenti — ${esc(storeName(store))} (${emps.length})</h2>
          <span class="spacer"></span>
          <select data-action="dept-filter" aria-label="Filtra reparto">
            <option value="">Tutti i reparti</option>
            ${DEPTS.map((d) => `<option value="${d.id}"${d.id === deptFilter ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
          </select>
        </div>
        <p class="hint">${esc(counts)}</p>
        ${table}
      </div></div>`;
  }

  // ---------------------------- Fabbisogno ----------------------------
  function renderNeeds() {
    const store = state.ui.store;
    const req = state.requirements[store];
    const emps = storeEmployees(store);
    const defMax = Number(state.settings.defaultMaxShifts) || 5;

    const rows = DEPTS.map((dept) => {
      const need = req[dept.id].reduce((a, n) => a + (Number(n.M) || 0) + (Number(n.P) || 0), 0);
      const cap = emps.filter((e) => e.dept === dept.id).reduce((a, e) => a + (Number(e.maxShifts) || defMax), 0);
      const cells = DAY_SHORT.map((_, d) => `<td><div class="need-pair">${['M', 'P'].map((s) => `
          <label class="${s}" title="${SHIFT_NAMES[s]}">${s}<input type="number" min="0" max="50" value="${Number(req[dept.id][d][s]) || 0}"
            data-action="need" data-dept="${dept.id}" data-day="${d}" data-shift="${s}" aria-label="${esc(dept.name)} ${DAY_NAMES[d]} ${SHIFT_NAMES[s]}"></label>`).join('')}
        </div></td>`).join('');
      return `<tr><th class="row-head">${esc(dept.name)}
          <div class="capacity ${cap >= need ? 'ok' : 'bad'}">${need} turni richiesti · ${cap} disponibili</div>
          <button class="btn small" data-action="copy-monday" data-dept="${dept.id}" style="margin-top:6px">Copia lunedì su lun–sab</button></th>${cells}</tr>`;
    }).join('');

    return `<div class="card">
        <h2>Fabbisogno di personale — ${esc(storeName(store))}</h2>
        <p class="hint">Numero di persone necessarie per ogni reparto, giorno e turno (M = ${esc(shiftLabel('M'))}, P = ${esc(shiftLabel('P'))}).
          Metti 0 per indicare che il reparto è chiuso in quel turno. Sotto ogni reparto trovi il confronto tra turni richiesti e turni che i dipendenti possono coprire in una settimana.</p>
        <div class="table-wrap"><table class="needs-grid">
          <thead><tr><th>Reparto</th>${DAY_NAMES.map((d) => `<th>${d}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody></table></div>
        <div class="toolbar" style="margin-top:12px">
          <span>Copia questo fabbisogno su:</span>
          <select id="copy-target" aria-label="Punto vendita di destinazione">
            <option value="__all">Tutti gli altri punti vendita</option>
            ${STORES.filter((s) => s.id !== store).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
          </select>
          <button class="btn" data-action="copy-needs">Copia</button>
          <span class="spacer"></span>
          <button class="btn danger" data-action="reset-needs">Ripristina valori predefiniti</button>
        </div>
      </div>`;
  }

  // ---------------------------- Impostazioni ----------------------------
  function renderSettings() {
    const t = state.settings.times;
    return `<div class="settings-grid">
      <div class="card form-grid">
        <h2>Orari dei turni</h2>
        <p class="hint">Usati nelle stampe, nell'esportazione e nelle etichette dei turni.</p>
        ${['M', 'P'].map((s) => `<div class="toolbar"><strong style="min-width:90px">${SHIFT_NAMES[s]}</strong>
          <input type="time" data-action="time" data-shift="${s}" data-edge="start" value="${esc(t[s].start)}" aria-label="Inizio ${SHIFT_NAMES[s]}"> –
          <input type="time" data-action="time" data-shift="${s}" data-edge="end" value="${esc(t[s].end)}" aria-label="Fine ${SHIFT_NAMES[s]}"></div>`).join('')}
      </div>
      <div class="card form-grid">
        <h2>Regole di generazione</h2>
        <label class="field">Turni massimi a settimana (predefinito)
          <input type="number" min="1" max="7" data-action="default-max" value="${esc(state.settings.defaultMaxShifts)}"></label>
        <label class="check"><input type="checkbox" data-action="use-history" ${state.settings.useHistory ? 'checked' : ''}>
          Compensa lo storico: chi ha fatto più mattine nelle settimane passate riceve più pomeriggi</label>
        <p class="hint">Ogni dipendente fa al massimo un turno al giorno. Il generatore distribuisce il carico in modo equo,
          bilancia mattine e pomeriggi di ciascuno ed evita quando possibile il pomeriggio seguito dal mattino del giorno dopo.</p>
      </div>
      <div class="card form-grid">
        <h2>Backup dei dati</h2>
        <p class="hint">I dati sono salvati solo in questo browser. Esporta un backup regolarmente o per spostarli su un altro computer.</p>
        <div class="toolbar">
          <button class="btn" data-action="backup">Esporta backup</button>
          <label class="btn">Importa backup<input type="file" accept="application/json,.json" data-action="restore" hidden></label>
        </div>
      </div>
      <div class="card form-grid">
        <h2>Ripristino</h2>
        <div class="toolbar">
          <button class="btn" data-action="load-sample">Carica dati di esempio</button>
          <button class="btn danger" data-action="reset-all">Cancella tutti i dati</button>
        </div>
      </div>
    </div>`;
  }

  // ======================================================================
  // Esportazione
  // ======================================================================
  function exportCSV() {
    const store = state.ui.store;
    const week = state.ui.week;
    const sched = getSchedule(store, week);
    if (!sched) return;
    const dates = weekDates(week);
    const working = dates.map((_, d) => workingOn(sched, d));
    const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Reparto', 'Dipendente', ...dates.map((dt, i) => `${DAY_NAMES[i]} ${fmtShort(dt)}`), 'Mattine', 'Pomeriggi', 'Totale'].map(cell).join(';')];
    for (const dept of DEPTS) {
      for (const e of storeEmployees(store).filter((x) => x.dept === dept.id)) {
        let m = 0, p = 0;
        const days = dates.map((_, d) => {
          const w = working[d][e.id];
          if (!w) return 'Riposo';
          if (w.shift === 'M') m++; else p++;
          const t = state.settings.times[w.shift];
          return `${SHIFT_NAMES[w.shift]} ${t.start}-${t.end}${w.dept !== e.dept ? ` (${deptName(w.dept)})` : ''}`;
        });
        lines.push([dept.name, e.name, ...days, m, p, m + p].map(cell).join(';'));
      }
    }
    download(`turni-${store}-${week}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  // ======================================================================
  // Eventi
  // ======================================================================
  function setWeek(date) {
    state.ui.week = toISO(mondayOf(date));
    save();
    render();
  }

  document.querySelector('.tabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-tab]');
    if (!b) return;
    state.ui.tab = b.dataset.tab;
    editingId = null;
    save();
    render();
  });

  document.getElementById('store-select').addEventListener('change', (ev) => {
    state.ui.store = ev.target.value;
    editingId = null;
    save();
    render();
  });

  view.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const a = el.dataset.action;
    const store = state.ui.store;
    const week = state.ui.week;

    switch (a) {
      case 'week-prev': return setWeek(addDays(fromISO(week), -7));
      case 'week-next': return setWeek(addDays(fromISO(week), 7));
      case 'week-today': return setWeek(new Date());
      case 'goto': state.ui.tab = el.dataset.tab; save(); return render();
      case 'view': state.ui.view = el.dataset.view; save(); return render();
      case 'generate': {
        if (getSchedule(store, week) && !confirm('Rigenerare i turni? Le modifiche manuali di questa settimana andranno perse.')) return;
        const res = generateWeek(store, week);
        const missing = res.shortages.reduce((x, s) => x + s.missing, 0);
        toast(missing ? `Turni generati: ${missing} posti scoperti` : 'Turni generati e bilanciati');
        return render();
      }
      case 'clear-week':
        if (!confirm('Eliminare i turni di questa settimana?')) return;
        setSchedule(store, week, null); save(); return render();
      case 'unassign': {
        const sched = getSchedule(store, week);
        const { day, dept, shift, id } = el.dataset;
        const list = sched.days[day][dept][shift];
        list.splice(list.indexOf(id), 1);
        save(); return render();
      }
      case 'export-csv': return exportCSV();
      case 'print': return window.print();
      case 'edit-emp': editingId = el.dataset.id; render(); document.querySelector('#emp-form input[name=name]').focus(); return;
      case 'cancel-edit': editingId = null; return render();
      case 'delete-emp': {
        const e = empById(el.dataset.id);
        if (!e || !confirm(`Eliminare ${e.name}? Verrà rimosso anche dai turni già pianificati.`)) return;
        state.employees = state.employees.filter((x) => x.id !== e.id);
        for (const st of Object.keys(state.schedules)) {
          for (const w of Object.values(state.schedules[st])) {
            for (const day of w.days) for (const dp of Object.values(day)) for (const s of ['M', 'P']) dp[s] = dp[s].filter((id) => id !== e.id);
          }
        }
        if (editingId === e.id) editingId = null;
        save(); toast('Dipendente eliminato'); return render();
      }
      case 'clear-sample':
        if (!confirm('Eliminare tutti i dipendenti di esempio e i turni generati?')) return;
        state.employees = []; state.schedules = {}; state.sampleData = false;
        save(); return render();
      case 'copy-monday': {
        const r = state.requirements[store][el.dataset.dept];
        for (let d = 1; d < 6; d++) r[d] = { M: r[0].M, P: r[0].P };
        save(); toast('Fabbisogno del lunedì copiato fino a sabato'); return render();
      }
      case 'copy-needs': {
        const target = document.getElementById('copy-target').value;
        const targets = target === '__all' ? STORES.filter((s) => s.id !== store).map((s) => s.id) : [target];
        for (const t of targets) state.requirements[t] = JSON.parse(JSON.stringify(state.requirements[store]));
        save(); toast(`Fabbisogno copiato su ${targets.length === 1 ? storeName(targets[0]) : 'tutti gli altri punti vendita'}`); return;
      }
      case 'reset-needs':
        if (!confirm('Ripristinare il fabbisogno predefinito per questo punto vendita?')) return;
        state.requirements[store] = defaultRequirements()[store]; save(); return render();
      case 'backup':
        return download(`backup-turni-${toISO(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
      case 'load-sample':
        if (!confirm('Caricare i dati di esempio? Sostituiranno dipendenti e turni attuali.')) return;
        state.employees = sampleEmployees(); state.schedules = {}; state.sampleData = true;
        save(); toast('Dati di esempio caricati'); return render();
      case 'reset-all': {
        if (!confirm('Cancellare definitivamente tutti i dipendenti, i turni e le impostazioni?')) return;
        state = freshState(false); save(); return render();
      }
    }
  });

  view.addEventListener('change', (ev) => {
    const el = ev.target;
    const a = el.dataset.action;
    const store = state.ui.store;
    switch (a) {
      case 'week-pick': if (el.value) setWeek(fromISO(el.value)); return;
      case 'use-history': state.settings.useHistory = el.checked; save(); return;
      case 'dept-filter': state.ui.deptFilter = el.value; save(); return render();
      case 'assign': {
        if (!el.value) return;
        const sched = getSchedule(store, state.ui.week);
        const { day, dept, shift } = el.dataset;
        const e = empById(el.value);
        if (e && !Scheduler.canWork(e, Number(day), shift) &&
            !confirm(`${e.name} risulta non disponibile ${DAY_NAMES[day].toLowerCase()} per il turno di ${SHIFT_NAMES[shift].toLowerCase()}. Assegnare comunque?`)) {
          return render();
        }
        sched.days[day][dept] = sched.days[day][dept] || { M: [], P: [] };
        sched.days[day][dept][shift].push(el.value);
        save(); return render();
      }
      case 'need': {
        const v = Math.max(0, Math.min(50, parseInt(el.value, 10) || 0));
        state.requirements[store][el.dataset.dept][el.dataset.day][el.dataset.shift] = v;
        save(); return render();
      }
      case 'time': state.settings.times[el.dataset.shift][el.dataset.edge] = el.value; save(); return;
      case 'default-max': state.settings.defaultMaxShifts = Math.max(1, Math.min(7, parseInt(el.value, 10) || 5)); save(); return;
      case 'restore': {
        const file = el.files && el.files[0];
        if (!file) return;
        file.text().then((txt) => {
          const data = JSON.parse(txt);
          if (!data || !Array.isArray(data.employees)) throw new Error('formato');
          if (!confirm('Importare il backup? I dati attuali verranno sostituiti.')) return;
          state = normalize(data); save(); toast('Backup importato'); render();
        }).catch(() => toast('File di backup non valido'));
      }
    }
  });

  view.addEventListener('submit', (ev) => {
    if (ev.target.id !== 'emp-form') return;
    ev.preventDefault();
    const f = new FormData(ev.target);
    const name = String(f.get('name') || '').trim();
    if (!name) return;
    const data = {
      name,
      store: f.get('store'),
      dept: f.get('dept'),
      maxShifts: Math.max(1, Math.min(7, parseInt(f.get('maxShifts'), 10) || state.settings.defaultMaxShifts)),
      availability: DAY_SHORT.map((_, i) => String(f.get(`av${i}`) || '')),
    };
    if (editingId) {
      Object.assign(empById(editingId), data);
      toast('Dipendente aggiornato');
    } else {
      state.employees.push(Object.assign({ id: uid() }, data));
      toast(`${name} aggiunto a ${storeName(data.store)}`);
    }
    editingId = null;
    save();
    render();
  });

  save();
  render();
})();
