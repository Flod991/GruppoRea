/* global Scheduler, TurniStorage */
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
  const SHIFT_NAMES = { M: 'Mattino', P: 'Pomeriggio', G: 'Giornata intera' };
  // Posizioni di una casella: mattino, pomeriggio e giornata intera (copre entrambi).
  const SLOTS = ['M', 'P', 'G'];
  const AVAIL_OPTIONS = [
    { v: '', short: 'Sì' },
    { v: 'M', short: 'Solo M' },
    { v: 'P', short: 'Solo P' },
    { v: 'X', short: 'Riposo' },
  ];
  // Valori di una casella inserita a mano. '' = automatico (decide il generatore).
  const CELL_OPTIONS = [
    { v: 'M', label: 'Mattino' },
    { v: 'P', label: 'Pomeriggio' },
    { v: 'G', label: 'Giornata intera' },
    { v: 'R', label: 'Riposo' },
    { v: 'F', label: 'Ferie' },
    { v: 'A', label: 'Assente' },
    { v: '', label: 'Automatico' },
  ];
  const OFF_NAMES = { R: 'Riposo', F: 'Ferie', A: 'Assente' };
  const PERIODS = [
    { v: 'week', label: 'Settimana' },
    { v: 'month', label: 'Mese' },
    { v: 'year', label: 'Anno' },
    { v: 'all', label: 'Tutto' },
  ];
  const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const UI_KEY = 'gruppoRea.turni.ui';
  // Nella versione pubblicata su claude.ai stampa e download non sono disponibili.
  const EMBED = !!window.TURNI_EMBED;

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
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 2600);
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

  function copyText(text, okMsg) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? okMsg : 'Copia non riuscita: il browser non consente l\'accesso agli appunti');
    };
    try {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback);
    } catch (e) {
      fallback();
    }
  }

  /** Riquadro di conferma interno alla pagina. */
  function ask(message, okLabel, danger) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-msg">
          <p id="modal-msg">${esc(message)}</p>
          <div class="row end">
            <button class="btn" data-answer="no">Annulla</button>
            <button class="btn ${danger ? 'danger-solid' : 'primary'}" data-answer="yes">${esc(okLabel || 'Conferma')}</button>
          </div></div>`;
      const close = (v) => {
        wrap.remove();
        document.removeEventListener('keydown', onKey);
        resolve(v);
      };
      const onKey = (ev) => { if (ev.key === 'Escape') close(false); };
      wrap.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-answer]');
        if (b) close(b.dataset.answer === 'yes');
        else if (ev.target === wrap) close(false);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      wrap.querySelector('[data-answer="yes"]').focus();
    });
  }

  // ======================================================================
  // Stato
  // ======================================================================
  function defaultNeed(deptId, day) {
    const base = deptId === 'casse' ? 3 : deptId === 'scaffali' ? 2 : 1;
    if (day === 6) return { M: Math.max(1, Math.ceil(base / 2)), P: 0 }; // domenica: solo mattina
    return { M: base, P: base };
  }

  function defaultStoreRequirements() {
    const req = {};
    for (const d of DEPTS) req[d.id] = DAY_NAMES.map((_, i) => defaultNeed(d.id, i));
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
    const requirements = {};
    for (const s of STORES) requirements[s.id] = defaultStoreRequirements();
    return {
      version: 2,
      settings: {
        times: { M: { start: '07:00', end: '14:00' }, P: { start: '14:00', end: '21:00' } },
        defaultMaxShifts: 5,
        useHistory: true,
      },
      employees: withSample ? sampleEmployees() : [],
      requirements,
      schedules: {}, // sede -> settimana (lunedì ISO) -> { days: [{reparto: {M:[], P:[]}}] }
      sampleData: !!withSample,
    };
  }

  /** Completa uno stato caricato con i valori mancanti. */
  function normalize(s) {
    const base = freshState(false);
    s = s || {};
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
    delete s.ui;
    return s;
  }

  function loadUI() {
    const now = new Date();
    const def = { tab: 'plan', store: STORES[0].id, dept: DEPTS[0].id, week: toISO(mondayOf(now)), period: 'month',
      sumMonth: now.getMonth(), sumYear: now.getFullYear() };
    try {
      const ui = Object.assign(def, JSON.parse(localStorage.getItem(UI_KEY) || '{}'));
      if (!STORES.some((x) => x.id === ui.store)) ui.store = def.store;
      if (ui.dept && !DEPTS.some((x) => x.id === ui.dept)) ui.dept = DEPTS[0].id;
      if (!['plan', 'summary', 'staff', 'settings'].includes(ui.tab)) ui.tab = 'plan';
      if (!PERIODS.some((x) => x.v === ui.period)) ui.period = 'month';
      if (!(ui.sumMonth >= 0 && ui.sumMonth <= 11)) ui.sumMonth = def.sumMonth;
      if (!Number.isInteger(ui.sumYear)) ui.sumYear = def.sumYear;
      return ui;
    } catch (e) {
      return def;
    }
  }

  let state = null;
  const ui = loadUI();
  let storage = null;
  let saveWarned = false;

  function save() {
    const ok = storage.save(state);
    if (!ok && !saveWarned) {
      toast('Attenzione: impossibile salvare i dati in questo browser');
      saveWarned = true;
    }
  }

  function saveUI() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* preferenza non essenziale */ }
  }

  // ======================================================================
  // Accesso ai dati
  // ======================================================================
  const storeEmployees = (store) => state.employees.filter((e) => e.store === store).sort(byName);
  const deptEmployees = (store, dept) => storeEmployees(store).filter((e) => e.dept === dept);
  const empById = (id) => state.employees.find((e) => e.id === id);
  const getSchedule = (store, week) => (state.schedules[store] || {})[week];
  const weekDates = (week) => DAY_NAMES.map((_, i) => addDays(fromISO(week), i));
  const timeRange = (s) => (s === 'G'
    ? `${state.settings.times.M.start}–${state.settings.times.P.end}`
    : `${state.settings.times[s].start}–${state.settings.times[s].end}`);
  const need = (store, dept, d, s) => Number(((state.requirements[store][dept] || [])[d] || {})[s]) || 0;

  function ensureSchedule(store, week) {
    state.schedules[store] = state.schedules[store] || {};
    if (!state.schedules[store][week]) {
      state.schedules[store][week] = { days: DAY_NAMES.map(() => ({})), generatedAt: null };
    }
    return state.schedules[store][week];
  }

  function cellOf(sched, d, dept) {
    const day = sched.days[d];
    day[dept] = day[dept] || { M: [], P: [], G: [] };
    return day[dept];
  }

  /** Valore inserito a mano per un dipendente in un giorno ('' se automatico). */
  const manualOf = (sched, empId, d) => (sched && sched.manual && sched.manual[empId] ? sched.manual[empId][d] || '' : '');

  /** Imposta a mano la casella di un dipendente; '' la restituisce al generatore. */
  function setCell(emp, d, value) {
    const sched = ensureSchedule(ui.store, ui.week);
    for (const dept of Object.keys(sched.days[d])) {
      for (const s of SLOTS) sched.days[d][dept][s] = (sched.days[d][dept][s] || []).filter((id) => id !== emp.id);
    }
    if (SLOTS.includes(value)) {
      const c = cellOf(sched, d, emp.dept);
      (c[value] = c[value] || []).push(emp.id);
    }
    sched.manual = sched.manual || {};
    const m = (sched.manual[emp.id] = sched.manual[emp.id] || {});
    if (value) m[d] = value;
    else delete m[d];
    if (!Object.keys(m).length) delete sched.manual[emp.id];
  }

  const assigned = (sched, d, dept, s) => (sched && sched.days[d] && sched.days[d][dept] ? sched.days[d][dept][s] || [] : []);
  /** Chi copre il turno s (M o P): chi fa quel turno più chi fa la giornata intera. */
  const coverIds = (sched, d, dept, s) => assigned(sched, d, dept, s).concat(assigned(sched, d, dept, 'G'));

  /** Mappa id dipendente -> { dept, shift } per un giorno. */
  function workingOn(sched, d) {
    const map = {};
    if (!sched) return map;
    const day = sched.days[d] || {};
    for (const dept of Object.keys(day)) {
      for (const s of SLOTS) for (const id of day[dept][s] || []) map[id] = { dept, shift: s };
    }
    return map;
  }

  function historyCounts(store, beforeWeek) {
    const acc = {};
    const weeks = state.schedules[store] || {};
    for (const w of Object.keys(weeks)) {
      if (beforeWeek && w >= beforeWeek) continue;
      Scheduler.countShifts(weeks[w].days, acc);
    }
    return acc;
  }

  function missingCount(store, sched, depts) {
    let missing = 0;
    for (const dept of depts) {
      for (let d = 0; d < 7; d++) {
        for (const s of ['M', 'P']) missing += Math.max(0, need(store, dept, d, s) - coverIds(sched, d, dept, s).length);
      }
    }
    return missing;
  }

  // ======================================================================
  // Generazione
  // ======================================================================
  /** Genera i turni della settimana per i reparti indicati, lasciando invariati gli altri. */
  function generate(store, week, depts) {
    const requirements = {};
    for (const d of depts) requirements[d] = state.requirements[store][d];
    const staff = storeEmployees(store).filter((e) => depts.includes(e.dept));
    const current = getSchedule(store, week);
    const fixed = {};
    for (const e of staff) if (current && current.manual && current.manual[e.id]) fixed[e.id] = current.manual[e.id];
    const res = Scheduler.generate({
      employees: staff,
      requirements,
      fixed,
      history: state.settings.useHistory ? historyCounts(store, week) : {},
      defaultMaxShifts: Number(state.settings.defaultMaxShifts) || 5,
      seed: Math.floor(Math.random() * 1e9),
    });
    const sched = ensureSchedule(store, week);
    const ids = new Set(staff.map((e) => e.id));
    res.schedule.forEach((day, d) => {
      // Toglie i dipendenti rigenerati da altri reparti (dati di versioni precedenti), salvo scelte manuali.
      for (const other of Object.keys(sched.days[d])) {
        if (depts.includes(other)) continue;
        for (const s of SLOTS) sched.days[d][other][s] = (sched.days[d][other][s] || []).filter((id) => !ids.has(id) || manualOf(sched, id, d));
      }
      for (const dept of depts) sched.days[d][dept] = day[dept];
    });
    sched.generatedAt = new Date().toISOString();
    return res.shortages.reduce((a, s) => a + s.missing, 0);
  }

  // ======================================================================
  // Rendering
  // ======================================================================
  const view = document.getElementById('view');
  // Sul telefono la settimana si mostra a schede, senza scorrimento orizzontale.
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const isMobile = () => mobileQuery.matches;
  const onMobileChange = () => { if (state) render(); };
  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', onMobileChange);
  else mobileQuery.addListener(onMobileChange);

  function render() {
    document.getElementById('tabs').hidden = false;
    document.getElementById('pickers').hidden = false;
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === ui.tab)));
    document.getElementById('store-select').innerHTML = STORES
      .map((s) => `<option value="${s.id}"${s.id === ui.store ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    document.getElementById('dept-select').innerHTML = DEPTS
      .map((d) => `<option value="${d.id}"${d.id === ui.dept ? ' selected' : ''}>${esc(d.name)}</option>`).join('')
      + `<option value=""${ui.dept ? '' : ' selected'}>Tutti i reparti</option>`;
    closePicker();
    const renderers = { plan: renderPlan, summary: renderSummary, staff: renderStaff, settings: renderSettings };
    view.innerHTML = renderers[ui.tab]();
    // Carica in anticipo le librerie del PDF, così la condivisione parte subito dopo il tocco.
    if ((ui.tab === 'plan' || ui.tab === 'summary') && !EMBED && window.TurniPDF) {
      setTimeout(() => TurniPDF.ensure().catch(() => {}), 800);
    }
  }

  function sampleBanner() {
    if (!state.sampleData) return '';
    return `<div class="note warn no-print">Stai vedendo <strong>dipendenti di esempio</strong>.
      <button class="link" data-action="clear-sample">Eliminali</button> e inserisci i tuoi nella scheda Personale.</div>`;
  }

  // ---------------------------- Turni ----------------------------
  function renderPlan() {
    const store = ui.store;
    const week = ui.week;
    const dept = ui.dept;
    const sched = getSchedule(store, week);
    const dates = weekDates(week);
    const depts = dept ? [dept] : DEPTS.map((d) => d.id);
    const hasStaff = storeEmployees(store).some((e) => depts.includes(e.dept));
    const missing = sched ? missingCount(store, sched, depts) : 0;
    const title = dept ? deptName(dept) : 'Tutti i reparti';

    const status = !sched
      ? '<span class="pill">Da pianificare</span>'
      : missing
        ? `<span class="pill bad">${missing} ${missing === 1 ? 'posto scoperto' : 'posti scoperti'}</span>`
        : '<span class="pill ok">Tutto coperto</span>';

    const extra = sched ? `<details class="more no-print">
        <summary class="btn">Altro</summary>
        <div class="menu">
          <button class="btn" data-action="copy-week">Copia per Excel</button>
          ${EMBED ? '' : '<button class="btn" data-action="export-csv">Scarica CSV</button><button class="btn" data-action="print">Stampa</button>'}
          <button class="btn danger" data-action="clear-week">Svuota settimana</button>
        </div></details>` : '';

    return `${sampleBanner()}
      <section class="plan-head">
        <div class="row">
          <div class="week-nav no-print">
            <button class="btn icon" data-action="week-prev" aria-label="Settimana precedente">‹</button>
            <button class="btn week-label" data-action="week-today" title="Torna alla settimana corrente">
              ${fmtShort(dates[0])} – ${fmtLong(dates[6])}</button>
            <button class="btn icon" data-action="week-next" aria-label="Settimana successiva">›</button>
          </div>
          <span class="grow"></span>
          ${status}
          <button class="btn ${sched ? '' : 'primary'} no-print" data-action="generate" ${hasStaff ? '' : 'disabled'}>
            ${sched ? 'Rigenera' : 'Genera'} turni${dept || isMobile() ? '' : ' di tutti i reparti'}</button>
          ${sched && !EMBED ? `<button class="btn primary no-print" data-action="pdf">${canSharePdf() ? 'Invia PDF' : 'Scarica PDF'}</button>` : ''}
          ${extra}
        </div>
        <h1>${esc(title)} <span class="sub">· ${esc(storeName(store))} · settimana dal ${fmtLong(dates[0])}</span></h1>
      </section>
      ${dept
    ? (isMobile() ? renderDeptWeekMobile(dept, sched, dates) : renderDeptWeek(dept, sched, dates))
    : (isMobile() ? renderOverviewMobile(sched, dates) : renderOverview(sched, dates))}`;
  }

  function renderDeptWeek(dept, sched, dates) {
    const store = ui.store;
    const emps = deptEmployees(store, dept);
    if (!emps.length) {
      return `<div class="empty"><p>Nessun dipendente in ${esc(deptName(dept))} a ${esc(storeName(store))}.</p>
        <button class="btn primary" data-action="goto-staff">Aggiungi personale</button></div>`;
    }
    const working = dates.map((_, d) => workingOn(sched, d));

    const head = `<tr><th class="sticky">Dipendente</th>
      ${dates.map((dt, i) => `<th class="day">${DAY_SHORT[i]} <span class="date">${fmtShort(dt)}</span></th>`).join('')}
      <th class="num" title="Mattine">Mat.</th><th class="num" title="Pomeriggi">Pom.</th><th class="num" title="Giornate intere">Int.</th></tr>`;

    const needRow = `<tr class="need-row no-print"><th class="sticky">Persone richieste</th>
      ${dates.map((_, d) => `<td><div class="need-pair">${['M', 'P'].map((s) => `
        <label class="need ${s}"><span>${s}</span><input type="number" inputmode="numeric" min="0" max="50"
          value="${need(store, dept, d, s)}" data-action="need" data-day="${d}" data-shift="${s}"
          aria-label="${SHIFT_NAMES[s]} di ${DAY_NAMES[d]}: persone richieste"></label>`).join('')}</div></td>`).join('')}
      <td colspan="3"></td></tr>`;

    const rows = emps.map((e) => {
      let m = 0, p = 0, g = 0;
      const cells = dates.map((_, d) => {
        const w = working[d][e.id];
        const man = manualOf(sched, e.id, d);
        let cls = 'off';
        let label = (e.availability || [])[d] === 'X' ? 'Riposo' : '—';
        if (w) {
          if (w.shift === 'M') m++; else if (w.shift === 'P') p++; else g++;
          cls = w.shift;
          label = w.dept === dept ? SHIFT_NAMES[w.shift] : `${w.shift} · ${deptName(w.dept)}`;
          if (w.dept !== dept) cls += ' elsewhere';
          if (!Scheduler.canWork(e, d, w.shift)) cls += ' conflict';
        } else if (OFF_NAMES[man]) {
          cls = man === 'R' ? 'off rest' : man;
          label = OFF_NAMES[man];
        }
        if (man) cls += ' manual';
        return `<td><button class="cell ${cls}" data-action="pick" data-id="${e.id}" data-day="${d}" aria-haspopup="menu"
          aria-label="${esc(e.name)}, ${DAY_NAMES[d]}: ${esc(label)}${man ? ', inserito a mano' : ''}. Premi per cambiare">${esc(label)}</button></td>`;
      }).join('');
      return `<tr><th class="sticky name">${esc(e.name)}</th>${cells}
        <td class="num">${m}</td><td class="num">${p}</td><td class="num">${g}</td></tr>`;
    }).join('');

    const cover = `<tr class="cover-row"><th class="sticky">Copertura</th>
      ${dates.map((_, d) => `<td>${['M', 'P'].map((s) => {
        const n = need(store, dept, d, s);
        if (!n) return '';
        const have = coverIds(sched, d, dept, s).length;
        return `<span class="cov ${have >= n ? 'ok' : 'bad'}">${s} ${have}/${n}</span>`;
      }).join(' ') || '<span class="muted small">Chiuso</span>'}</td>`).join('')}
      <td colspan="3"></td></tr>`;

    return `<div class="table-wrap"><table class="week dept-week">
        <thead>${head}</thead><tbody>${needRow}${rows}${cover}</tbody></table></div>
      <div class="legend no-print">
        <span><i class="sw M"></i>Mattino ${esc(timeRange('M'))}</span>
        <span><i class="sw P"></i>Pomeriggio ${esc(timeRange('P'))}</span>
        <span><i class="sw G"></i>Giornata intera ${esc(timeRange('G'))}</span>
        <span><i class="sw F"></i>Ferie</span>
        <span><i class="sw A"></i>Assente</span>
        <span><i class="sw manual"></i>Inserito a mano: la generazione non lo cambia</span>
      </div>`;
  }

  /** Stato di una casella: kind M/P/F/A/R/'' e testo breve e lungo. */
  function cellState(e, d, sched, working, dept) {
    const w = working[d][e.id];
    const man = manualOf(sched, e.id, d);
    if (w) {
      const other = dept && w.dept !== dept;
      return { kind: w.shift, short: w.shift, long: other ? `${SHIFT_NAMES[w.shift]} in ${deptName(w.dept)}` : SHIFT_NAMES[w.shift], man, other,
        conflict: !Scheduler.canWork(e, d, w.shift) };
    }
    if (OFF_NAMES[man]) return { kind: man, short: man, long: OFF_NAMES[man], man };
    if ((e.availability || [])[d] === 'X') return { kind: 'R', short: 'R', long: 'Riposo', man };
    return { kind: '', short: '—', long: 'Nessun turno', man };
  }

  function renderDeptWeekMobile(dept, sched, dates) {
    const store = ui.store;
    const emps = deptEmployees(store, dept);
    if (!emps.length) {
      return `<div class="empty"><p>Nessun dipendente in ${esc(deptName(dept))} a ${esc(storeName(store))}.</p>
        <button class="btn primary" data-action="goto-staff">Aggiungi personale</button></div>`;
    }
    const working = dates.map((_, d) => workingOn(sched, d));
    const today = toISO(new Date());
    const days = `<div class="wk-days" aria-hidden="true">${dates.map((dt, i) =>
      `<div class="${toISO(dt) === today ? 'today' : ''}"><b>${DAY_SHORT[i]}</b>${dt.getDate()}</div>`).join('')}</div>`;

    const needCard = `<div class="wk-card wk-need">
      <div class="wk-name">Persone richieste</div>
      <div class="wk-grid">${dates.map((_, d) => `<div class="wk-need-col">${['M', 'P'].map((s) => `
        <label class="need ${s}"><span>${s}</span><input type="number" inputmode="numeric" min="0" max="50"
          value="${need(store, dept, d, s)}" data-action="need" data-day="${d}" data-shift="${s}"
          aria-label="${SHIFT_NAMES[s]} di ${DAY_NAMES[d]}: persone richieste"></label>`).join('')}</div>`).join('')}</div></div>`;

    const cards = emps.map((e) => {
      let m = 0, p = 0, g = 0;
      const cells = dates.map((_, d) => {
        const c = cellState(e, d, sched, working, dept);
        if (c.kind === 'M') m++;
        if (c.kind === 'P') p++;
        if (c.kind === 'G') g++;
        const cls = ['cell', 'mini', c.kind || 'off', c.kind === 'R' ? 'rest' : '', c.man ? 'manual' : '', c.other ? 'elsewhere' : '', c.conflict ? 'conflict' : ''].join(' ');
        return `<button class="${cls}" data-action="pick" data-id="${e.id}" data-day="${d}" aria-haspopup="menu"
          aria-label="${esc(e.name)}, ${DAY_NAMES[d]}: ${esc(c.long)}${c.man ? ', inserito a mano' : ''}. Premi per cambiare">${c.short}</button>`;
      }).join('');
      return `<div class="wk-card"><div class="wk-name">${esc(e.name)}<span class="muted small">${m} M · ${p} P${g ? ` · ${g} G` : ''}</span></div>
        <div class="wk-grid">${cells}</div></div>`;
    }).join('');

    const cover = `<div class="wk-card wk-cover"><div class="wk-name">Copertura</div>
      <div class="wk-grid">${dates.map((_, d) => `<div>${['M', 'P'].map((s) => {
        const n = need(store, dept, d, s);
        if (!n) return '';
        const have = coverIds(sched, d, dept, s).length;
        return `<span class="cov ${have >= n ? 'ok' : 'bad'}">${s} ${have}/${n}</span>`;
      }).join('') || '<span class="muted small">—</span>'}</div>`).join('')}</div></div>`;

    return `<div class="wk">${days}${needCard}${cards}${cover}</div>
      <div class="legend">
        <span><i class="sw M"></i>M Mattino ${esc(timeRange('M'))}</span>
        <span><i class="sw P"></i>P Pomeriggio ${esc(timeRange('P'))}</span>
        <span><i class="sw G"></i>G Giornata intera</span>
        <span><i class="sw R"></i>R Riposo</span>
        <span><i class="sw F"></i>F Ferie</span>
        <span><i class="sw A"></i>A Assente</span>
        <span><i class="sw manual"></i>Inserito a mano</span>
      </div>`;
  }

  function renderOverviewMobile(sched, dates) {
    const store = ui.store;
    const todayIdx = dates.findIndex((dt) => toISO(dt) === toISO(new Date()));
    const day = Number.isInteger(ui.day) && ui.day >= 0 && ui.day < 7 ? ui.day : Math.max(0, todayIdx);
    const chips = `<div class="day-chips" role="group" aria-label="Giorno">${dates.map((dt, i) => {
      const miss = DEPTS.reduce((a, dp) => a + ['M', 'P'].reduce((b, s) => b + Math.max(0, need(store, dp.id, i, s) - coverIds(sched, i, dp.id, s).length), 0), 0);
      return `<button class="${i === day ? 'on' : ''}" aria-pressed="${i === day}" data-action="day" data-day="${i}">
        <b>${DAY_SHORT[i]}</b>${dt.getDate()}${sched && miss ? '<i class="dot" aria-label="posti scoperti"></i>' : ''}</button>`;
    }).join('')}</div>`;
    const cards = DEPTS.map((dept) => {
      const parts = ['M', 'P'].map((s) => {
        const n = need(store, dept.id, day, s);
        const ids = coverIds(sched, day, dept.id, s);
        if (!n && !ids.length) return '';
        const names = ids.map((id) => empLabel(sched, day, dept.id, id)).filter(Boolean).join(', ');
        return `<div class="ov ${s} ${ids.length < n ? 'bad' : ''}"><b>${SHIFT_NAMES[s]} ${ids.length}/${n}</b><span>${names || '—'}</span></div>`;
      }).join('');
      const away = deptEmployees(store, dept.id).filter((e) => ['F', 'A'].includes(manualOf(sched, e.id, day)))
        .map((e) => `${esc(e.name)} (${manualOf(sched, e.id, day) === 'F' ? 'ferie' : 'assente'})`);
      return `<div class="wk-card">
        <div class="wk-name"><button class="link strong" data-action="open-dept" data-dept="${dept.id}">${esc(dept.name)} ›</button></div>
        ${parts || '<span class="muted small">Chiuso</span>'}
        ${away.length ? `<div class="ov-away">${away.join(', ')}</div>` : ''}</div>`;
    }).join('');
    return `${chips}<h2 class="day-title">${DAY_NAMES[day]} ${fmtLong(dates[day])}</h2><div class="wk">${cards}</div>`;
  }

  /** Menu di scelta per una casella. */
  function openPicker(btn) {
    closePicker();
    const emp = empById(btn.dataset.id);
    const d = Number(btn.dataset.day);
    if (!emp) return;
    const cur = manualOf(getSchedule(ui.store, ui.week), emp.id, d);
    const menu = document.createElement('div');
    menu.className = 'picker-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div class="picker-title">${esc(emp.name)} · ${DAY_NAMES[d]}</div>
      ${CELL_OPTIONS.map((o) => `<button role="menuitem" class="opt ${o.v || 'auto'}${o.v === cur ? ' current' : ''}" data-value="${o.v}">
        <i class="sw ${o.v || 'auto'}"></i>${o.label}${o.v === '' ? '<small>decide la generazione</small>' : ''}</button>`).join('')}`;
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - mw - 8);
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${top}px`;
    menu.addEventListener('click', (ev) => {
      const o = ev.target.closest('[data-value]');
      if (!o) return;
      setCell(emp, d, o.dataset.value);
      closePicker();
      save();
      render();
      const again = view.querySelector(`[data-action="pick"][data-id="${emp.id}"][data-day="${d}"]`);
      if (again) again.focus();
    });
    menu.addEventListener('keydown', (ev) => {
      const items = [...menu.querySelectorAll('[data-value]')];
      const i = items.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (ev.key === 'Escape' || ev.key === 'Tab') { closePicker(); btn.focus(); }
    });
    openPicker.at = Date.now();
    (menu.querySelector('.current') || menu.querySelector('[data-value]')).focus();
  }

  function closePicker() {
    const m = document.querySelector('.picker-menu');
    if (m) m.remove();
  }
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.picker-menu') && !ev.target.closest('[data-action="pick"]')) closePicker();
  });
  window.addEventListener('resize', closePicker);
  // Lo scorrimento chiude il menu, ma non quello residuo subito dopo il tocco che lo ha aperto.
  document.addEventListener('scroll', () => { if (Date.now() - (openPicker.at || 0) > 400) closePicker(); }, true);

  function balanceCell(m, p) {
    const tot = m + p;
    const diff = m - p;
    const cls = Math.abs(diff) <= 1 ? 'ok' : Math.abs(diff) <= 3 ? 'warn' : 'bad';
    const pm = tot ? (m / tot) * 100 : 50;
    const text = !tot ? 'nessun turno' : diff === 0 ? 'pari' : diff > 0 ? `+${diff} mattine` : `+${-diff} pomeriggi`;
    return `<div class="balance" title="${m} mattine, ${p} pomeriggi">
      <div class="balance-bar"><span class="m" style="width:${pm}%"></span><span class="p" style="width:${100 - pm}%"></span></div>
      <span class="delta ${tot ? cls : ''}">${text}</span></div>`;
  }

  /** Nome per la panoramica, con l'indicazione della giornata intera. */
  function empLabel(sched, d, dept, id) {
    const e = empById(id);
    if (!e) return '';
    return esc(e.name) + (assigned(sched, d, dept, 'G').includes(id) ? ' <small>(intera)</small>' : '');
  }

  function renderOverview(sched, dates) {
    const store = ui.store;
    const head = `<tr><th class="sticky">Reparto</th>${dates.map((dt, i) => `<th class="day">${DAY_SHORT[i]} <span class="date">${fmtShort(dt)}</span></th>`).join('')}</tr>`;
    const rows = DEPTS.map((dept) => {
      const cells = dates.map((_, d) => {
        const parts = ['M', 'P'].map((s) => {
          const n = need(store, dept.id, d, s);
          const ids = coverIds(sched, d, dept.id, s);
          if (!n && !ids.length) return '';
          const names = ids.map((id) => empLabel(sched, d, dept.id, id)).filter(Boolean).join('<br>');
          const cls = ids.length < n ? 'bad' : '';
          return `<div class="ov ${s} ${cls}"><b>${s} ${ids.length}/${n}</b>${names ? `<span>${names}</span>` : ''}</div>`;
        }).join('');
        const away = deptEmployees(store, dept.id)
          .filter((e) => ['F', 'A'].includes(manualOf(sched, e.id, d)))
          .map((e) => `${esc(e.name)} (${manualOf(sched, e.id, d) === 'F' ? 'ferie' : 'assente'})`);
        const awayHtml = away.length ? `<div class="ov-away">${away.join('<br>')}</div>` : '';
        return `<td>${parts || '<span class="muted small">Chiuso</span>'}${awayHtml}</td>`;
      }).join('');
      return `<tr><th class="sticky"><button class="link strong" data-action="open-dept" data-dept="${dept.id}">${esc(dept.name)}</button></th>${cells}</tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="week overview"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      <p class="hint no-print">Premi il nome di un reparto per aprirlo, modificare i turni e le persone richieste.</p>`;
  }

  // ---------------------------- Riepilogo ----------------------------
  /** Intervallo di date del periodo scelto nel riepilogo. */
  function periodRange() {
    const y = ui.sumYear;
    const m = ui.sumMonth;
    switch (ui.period) {
      case 'week': {
        const monday = fromISO(ui.week);
        return { from: monday, to: addDays(monday, 6), label: `Settimana ${fmtShort(monday)} – ${fmtLong(addDays(monday, 6))}` };
      }
      case 'month': return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0), label: `${MONTHS[m]} ${y}` };
      case 'year': return { from: new Date(y, 0, 1), to: new Date(y, 11, 31), label: `Anno ${y}` };
      default: return { from: null, to: null, label: 'Tutte le settimane salvate' };
    }
  }

  function shiftPeriod(dir) {
    if (ui.period === 'week') return setWeek(addDays(fromISO(ui.week), 7 * dir));
    if (ui.period === 'month') {
      const d = new Date(ui.sumYear, ui.sumMonth + dir, 1);
      ui.sumYear = d.getFullYear();
      ui.sumMonth = d.getMonth();
    } else if (ui.period === 'year') {
      ui.sumYear += dir;
    }
    saveUI();
    render();
  }

  /** Anni proponibili nel riepilogo: quelli con turni salvati più l'anno in corso. */
  function summaryYears(store) {
    const years = new Set([new Date().getFullYear(), ui.sumYear]);
    for (const w of Object.keys(state.schedules[store] || {})) {
      years.add(fromISO(w).getFullYear());
      years.add(addDays(fromISO(w), 6).getFullYear());
    }
    return [...years].sort();
  }

  /** Conteggi per dipendente e copertura per reparto nel periodo. */
  function periodStats(store, range) {
    const emp = {};
    const cover = {};
    let days = 0;
    const weeks = state.schedules[store] || {};
    const rec = (id) => (emp[id] = emp[id] || { M: 0, P: 0, G: 0, F: 0, A: 0 });
    for (const w of Object.keys(weeks)) {
      const sched = weeks[w];
      for (let d = 0; d < 7; d++) {
        const date = addDays(fromISO(w), d);
        if (range.from && (date < range.from || date > range.to)) continue;
        days++;
        for (const dept of DEPTS) {
          const c = (cover[dept.id] = cover[dept.id] || { need: 0, have: 0 });
          for (const s of ['M', 'P']) {
            const n = need(store, dept.id, d, s);
            c.need += n;
            c.have += Math.min(n, coverIds(sched, d, dept.id, s).length);
          }
          for (const s of SLOTS) for (const id of assigned(sched, d, dept.id, s)) rec(id)[s]++;
        }
        for (const id of Object.keys(sched.manual || {})) {
          const v = sched.manual[id][d];
          if (v === 'F' || v === 'A') rec(id)[v]++;
        }
      }
    }
    return { emp, cover, days };
  }

  const ZERO = { M: 0, P: 0, G: 0, F: 0, A: 0 };
  const balanceText = (m, p) => (!(m + p) ? '—' : m === p ? 'pari' : m > p ? `+${m - p} mattine` : `+${p - m} pomeriggi`);

  /** Tutti i dati del riepilogo, usati dalla schermata e dal PDF. */
  function summaryData() {
    const store = ui.store;
    const dept = ui.dept;
    const range = periodRange();
    const { emp, cover, days } = periodStats(store, range);
    const depts = DEPTS.filter((d) => !dept || d.id === dept);
    let need = 0, have = 0;
    for (const d of depts) { need += (cover[d.id] || {}).need || 0; have += (cover[d.id] || {}).have || 0; }
    const staff = storeEmployees(store).filter((e) => depts.some((d) => d.id === e.dept));
    const sum = (k) => staff.reduce((a, e) => a + (emp[e.id] || ZERO)[k], 0);
    return {
      store, dept, range, emp, cover, days, depts,
      totals: { need, have, pct: need ? Math.round((have / need) * 100) : 0, M: sum('M'), P: sum('P'), G: sum('G'), F: sum('F'), A: sum('A') },
    };
  }

  function renderSummary() {
    const data = summaryData();
    const { store, dept, range, emp, cover, days, depts, totals } = data;
    const mobile = isMobile();

    const tabs = `<div class="segmented no-print" role="group" aria-label="Periodo">
      ${PERIODS.map((x) => `<button class="${x.v === ui.period ? 'on' : ''}" aria-pressed="${x.v === ui.period}" data-action="period" data-period="${x.v}">${x.label}</button>`).join('')}
    </div>`;
    const years = summaryYears(store);
    const monthSel = ui.period === 'month' ? `<select id="sum-month" data-action="sum-month" aria-label="Mese">
        ${MONTHS.map((m, i) => `<option value="${i}"${i === ui.sumMonth ? ' selected' : ''}>${m}</option>`).join('')}</select>` : '';
    const yearSel = ui.period === 'month' || ui.period === 'year' ? `<select id="sum-year" data-action="sum-year" aria-label="Anno">
        ${years.map((y) => `<option value="${y}"${y === ui.sumYear ? ' selected' : ''}>${y}</option>`).join('')}</select>` : '';
    const nav = ui.period === 'all' ? '' : `<div class="period-nav no-print">
      <button class="btn icon" data-action="period-prev" aria-label="Periodo precedente">‹</button>
      ${monthSel}${yearSel}${ui.period === 'week' ? `<span class="week-label btn">${fmtShort(range.from)} – ${fmtLong(range.to)}</span>` : ''}
      <button class="btn icon" data-action="period-next" aria-label="Periodo successivo">›</button></div>`;
    const pdfBtn = !EMBED && days ? `<button class="btn primary no-print" data-action="summary-pdf">${canSharePdf() ? 'Invia PDF riepilogo' : 'Scarica PDF riepilogo'}</button>` : '';

    const kpis = `<div class="kpis">
      <div class="kpi"><span>Copertura</span><strong>${totals.pct}%</strong><small>${totals.have} di ${totals.need} posti</small></div>
      <div class="kpi"><span>Posti scoperti</span><strong class="${totals.need - totals.have ? 'bad' : ''}">${totals.need - totals.have}</strong><small>&nbsp;</small></div>
      <div class="kpi"><span>Mattine · pomeriggi · intere</span><strong>${totals.M} · ${totals.P} · ${totals.G}</strong><small>turni assegnati</small></div>
      <div class="kpi"><span>Ferie · Assenze</span><strong>${totals.F} · ${totals.A}</strong><small>giorni</small></div>
    </div>`;

    const coverRow = (d) => {
      const c = cover[d.id] || { need: 0, have: 0 };
      return { c, pct: c.need ? Math.round((c.have / c.need) * 100) : 0 };
    };
    const coverTable = dept ? '' : mobile ? `<section class="panel">
      <h2>Copertura per reparto</h2>
      <ul class="plain-list">${depts.map((d) => {
        const { c, pct } = coverRow(d);
        return `<li><button class="link strong" data-action="summary-dept" data-dept="${d.id}">${esc(d.name)}</button>
          <span class="row"><span class="meter"><span style="width:${pct}%"></span></span><span class="small">${pct}%</span>
          ${c.need - c.have ? `<span class="bad-text small">${c.need - c.have} scoperti</span>` : ''}</span></li>`;
      }).join('')}</ul></section>` : `<section class="panel">
      <h2>Copertura per reparto</h2>
      <div class="table-wrap flat"><table><thead><tr><th>Reparto</th><th class="num">Posti richiesti</th><th class="num">Coperti</th><th class="num">Scoperti</th><th>Copertura</th></tr></thead>
      <tbody>${depts.map((d) => {
        const { c, pct } = coverRow(d);
        return `<tr><td><button class="link strong" data-action="summary-dept" data-dept="${d.id}">${esc(d.name)}</button></td>
          <td class="num">${c.need}</td><td class="num">${c.have}</td><td class="num ${c.need - c.have ? 'bad-text' : ''}">${c.need - c.have}</td>
          <td><div class="meter"><span style="width:${pct}%"></span></div> <span class="small">${pct}%</span></td></tr>`;
      }).join('')}</tbody></table></div></section>`;

    const empCards = depts.map((d) => {
      const list = deptEmployees(store, d.id);
      if (!list.length) return '';
      return (dept ? '' : `<li class="group">${esc(d.name)}</li>`) + list.map((e) => {
        const x = emp[e.id] || ZERO;
        const extra = [x.G ? `${x.G} ${x.G === 1 ? 'giornata intera' : 'giornate intere'}` : '', x.F ? `${x.F} ferie` : '',
          x.A ? `${x.A} ${x.A === 1 ? 'assenza' : 'assenze'}` : ''].filter(Boolean).join(' · ');
        return `<li><div><strong>${esc(e.name)}</strong>
          <div class="muted small">${x.M} mattine · ${x.P} pomeriggi · ${x.M + x.P + x.G} giorni${extra ? ` · ${extra}` : ''}</div></div>
          ${balanceCell(x.M, x.P)}</li>`;
      }).join('');
    }).join('');

    const empRows = depts.map((d) => {
      const list = deptEmployees(store, d.id);
      if (!list.length) return '';
      return (dept ? '' : `<tr class="group-row"><th colspan="8">${esc(d.name)}</th></tr>`) + list.map((e) => {
        const x = emp[e.id] || ZERO;
        return `<tr><td>${esc(e.name)}</td><td class="num">${x.M}</td><td class="num">${x.P}</td><td class="num">${x.G || ''}</td>
          <td class="num"><strong>${x.M + x.P + x.G}</strong></td><td class="num">${x.F || ''}</td><td class="num">${x.A || ''}</td>
          <td>${balanceCell(x.M, x.P)}</td></tr>`;
      }).join('');
    }).join('');

    return `${sampleBanner()}
      <section class="plan-head">
        <div class="row">${tabs}${nav}<span class="grow"></span>${pdfBtn}</div>
        <h1>Riepilogo ${esc(dept ? deptName(dept) : 'di tutti i reparti')} <span class="sub">· ${esc(storeName(store))} · ${esc(range.label)}</span></h1>
      </section>
      ${days ? `${kpis}
      <div class="summary">
        ${coverTable}
        <section class="panel">
          <h2>Turni per dipendente</h2>
          ${mobile ? `<ul class="plain-list emp-cards">${empCards || '<li class="muted">Nessun dipendente.</li>'}</ul>` : `<div class="table-wrap flat"><table>
            <thead><tr><th>Dipendente</th><th class="num">Mattine</th><th class="num">Pomeriggi</th><th class="num">Intere</th><th class="num">Giorni</th>
              <th class="num">Ferie</th><th class="num">Assenze</th><th>Equilibrio mattine/pomeriggi</th></tr></thead>
            <tbody>${empRows || '<tr><td colspan="8" class="muted">Nessun dipendente.</td></tr>'}</tbody></table></div>`}
          <p class="hint">Giorni = giorni lavorati (mattine + pomeriggi + giornate intere). Ferie e assenze sono in giorni.
            L'equilibrio confronta mattine e pomeriggi.</p>
        </section>
      </div>` : '<div class="empty"><p>Nessun turno pianificato in questo periodo.</p></div>'}`;
  }

  /** Dati del PDF di riepilogo per il punto vendita o il reparto scelto. */
  function summaryPdfData() {
    const { store, dept, range, emp, cover, depts, totals } = summaryData();
    const scope = dept ? `${deptName(dept)} - ${storeName(store)}` : storeName(store);
    return {
      title: `Riepilogo turni - ${scope}`,
      subtitle: plain(range.label),
      kpis: [
        ['Copertura', `${totals.pct}%`, `${totals.have} di ${totals.need} posti`],
        ['Posti scoperti', String(totals.need - totals.have), ''],
        ['Mattine · pomeriggi · intere', `${totals.M} · ${totals.P} · ${totals.G}`, 'turni assegnati'],
        ['Ferie · assenze', `${totals.F} · ${totals.A}`, 'giorni'],
      ],
      coverage: dept ? null : depts.map((d) => {
        const c = cover[d.id] || { need: 0, have: 0 };
        return [d.name, String(c.need), String(c.have), String(c.need - c.have), `${c.need ? Math.round((c.have / c.need) * 100) : 0}%`];
      }),
      sections: depts.map((d) => ({
        title: d.name,
        rows: deptEmployees(store, d.id).map((e) => {
          const x = emp[e.id] || ZERO;
          return [e.name, x.M, x.P, x.G, x.M + x.P + x.G, x.F, x.A, balanceText(x.M, x.P)].map(String);
        }),
      })).filter((sct) => sct.rows.length),
      footer: `Generato il ${fmtLong(new Date())}`,
      fileName: `Riepilogo_${fileSafe(storeName(store))}_${dept ? fileSafe(deptName(dept)) + '_' : ''}${fileSafe(plain(range.label))}.pdf`,
    };
  }

  // ---------------------------- Personale ----------------------------
  let editingId = null;

  function renderStaff() {
    const store = ui.store;
    const dept = ui.dept;
    const e = editingId ? empById(editingId) : null;
    const cur = e || { name: '', store, dept: dept || DEPTS[0].id, maxShifts: state.settings.defaultMaxShifts, availability: [] };
    const list = storeEmployees(store).filter((x) => !dept || x.dept === dept);

    const form = `<form class="panel form" id="emp-form" autocomplete="off">
        <h2>${e ? 'Modifica dipendente' : 'Nuovo dipendente'}</h2>
        <label class="field">Nome e cognome<input id="f-name" type="text" name="name" required value="${esc(cur.name)}" placeholder="Es. Mario Rossi"></label>
        <div class="row two">
          <label class="field">Reparto<select id="f-dept" name="dept">${DEPTS.map((d) => `<option value="${d.id}"${d.id === cur.dept ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
          <label class="field">Turni a settimana<input id="f-max" type="number" name="maxShifts" min="1" max="7" value="${esc(cur.maxShifts || state.settings.defaultMaxShifts)}"></label>
        </div>
        <label class="field">Punto vendita<select id="f-store" name="store">${STORES.map((s) => `<option value="${s.id}"${s.id === cur.store ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <fieldset class="field avail"><legend>Disponibile?</legend>
          ${DAY_SHORT.map((d, i) => `<label>${d}<select id="f-av${i}" name="av${i}">${AVAIL_OPTIONS.map((o) => `<option value="${o.v}"${((cur.availability || [])[i] || '') === o.v ? ' selected' : ''}>${o.short}</option>`).join('')}</select></label>`).join('')}
        </fieldset>
        <div class="row">
          <button class="btn primary" type="submit">${e ? 'Salva' : 'Aggiungi'}</button>
          ${e ? '<button class="btn" type="button" data-action="cancel-edit">Annulla</button>' : ''}
        </div>
      </form>`;

    const items = list.length ? `<ul class="staff-list">${list.map((x) => {
      const off = (x.availability || []).map((v, i) => (v ? `${DAY_SHORT[i]} ${AVAIL_OPTIONS.find((o) => o.v === v).short.toLowerCase()}` : '')).filter(Boolean);
      return `<li>
        <div><strong>${esc(x.name)}</strong>
          <div class="muted small">${dept ? '' : `${esc(deptName(x.dept))} · `}${esc(x.maxShifts || state.settings.defaultMaxShifts)} turni/sett.${off.length ? ` · ${esc(off.join(', '))}` : ''}</div></div>
        <div class="row">
          <button class="btn small" data-action="edit-emp" data-id="${x.id}">Modifica</button>
          <button class="btn small danger" data-action="delete-emp" data-id="${x.id}" aria-label="Elimina ${esc(x.name)}">Elimina</button>
        </div></li>`;
    }).join('')}</ul>` : '<p class="empty">Nessun dipendente.</p>';

    return `${sampleBanner()}<div class="staff">${form}
      <section class="panel">
        <h2>${esc(dept ? deptName(dept) : 'Tutto il personale')} · ${esc(storeName(store))} <span class="muted">(${list.length})</span></h2>
        ${items}
      </section></div>`;
  }

  // ---------------------------- Impostazioni ----------------------------
  function renderSettings() {
    const t = state.settings.times;
    const cloud = storage.mode === 'cloud';
    return `<div class="settings">
      <section class="panel form">
        <h2>Orari dei turni</h2>
        ${['M', 'P'].map((s) => `<div class="row"><span class="label">${SHIFT_NAMES[s]}</span>
          <input id="t-${s}-start" type="time" data-action="time" data-shift="${s}" data-edge="start" value="${esc(t[s].start)}" aria-label="Inizio ${SHIFT_NAMES[s]}"> –
          <input id="t-${s}-end" type="time" data-action="time" data-shift="${s}" data-edge="end" value="${esc(t[s].end)}" aria-label="Fine ${SHIFT_NAMES[s]}"></div>`).join('')}
      </section>
      <section class="panel form">
        <h2>Generazione</h2>
        <label class="field">Turni a settimana per i nuovi dipendenti
          <input id="s-max" type="number" min="1" max="7" data-action="default-max" value="${esc(state.settings.defaultMaxShifts)}"></label>
        <label class="check"><input id="s-hist" type="checkbox" data-action="use-history" ${state.settings.useHistory ? 'checked' : ''}>
          Compensa le settimane passate: chi ha fatto più mattine riceve più pomeriggi</label>
      </section>
      <section class="panel form">
        <h2>Persone richieste</h2>
        <p class="hint">Copia le persone richieste di ${esc(storeName(ui.store))} su un altro punto vendita.</p>
        <div class="row">
          <select id="copy-target" aria-label="Punto vendita di destinazione">
            <option value="__all">Tutti gli altri</option>
            ${STORES.filter((s) => s.id !== ui.store).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
          </select>
          <button class="btn" data-action="copy-needs">Copia</button>
          <button class="btn danger" data-action="reset-needs">Valori predefiniti</button>
        </div>
      </section>
      <section class="panel form">
        <h2>Dati</h2>
        <p class="hint">${cloud
          ? `Dati condivisi tra tutte le sedi. Accesso effettuato come <strong>${esc((storage.user || {}).email || '')}</strong>.`
          : 'I dati sono salvati solo in questo browser. Per condividerli tra le sedi serve il database (vedi README).'}</p>
        <div class="row">
          ${EMBED ? '<button class="btn" data-action="copy-backup">Copia backup</button>' : '<button class="btn" data-action="backup">Scarica backup</button>'}
          <label class="btn">Importa backup<input type="file" accept="application/json,.json" data-action="restore" hidden></label>
          ${cloud ? '<button class="btn" data-action="logout">Esci</button>' : '<button class="btn" data-action="load-sample">Dati di esempio</button>'}
          <button class="btn danger" data-action="reset-all">Cancella tutto</button>
        </div>
      </section>
    </div>`;
  }

  function renderLogin(message) {
    document.getElementById('tabs').hidden = true;
    document.getElementById('pickers').hidden = true;
    view.innerHTML = `<form class="panel form login" id="login-form">
        <h2>Accedi</h2>
        <p class="hint">Usa l'email e la password che ti ha dato l'amministratore.</p>
        ${message ? `<div class="note bad">${esc(message)}</div>` : ''}
        <label class="field">Email<input id="l-email" type="email" name="email" required autocomplete="username"></label>
        <label class="field">Password<input id="l-pass" type="password" name="password" required autocomplete="current-password"></label>
        <button class="btn primary" type="submit">Accedi</button>
      </form>`;
    document.getElementById('l-email').focus();
  }

  // ======================================================================
  // Esportazione
  // ======================================================================
  function weekTable() {
    const store = ui.store;
    const sched = getSchedule(store, ui.week);
    if (!sched) return null;
    const dates = weekDates(ui.week);
    const working = dates.map((_, d) => workingOn(sched, d));
    const rows = [['Reparto', 'Dipendente', ...dates.map((dt, i) => `${DAY_NAMES[i]} ${fmtShort(dt)}`), 'Mattine', 'Pomeriggi']];
    for (const dept of DEPTS.filter((d) => !ui.dept || d.id === ui.dept)) {
      for (const e of deptEmployees(store, dept.id)) {
        let m = 0, p = 0;
        const days = dates.map((_, d) => {
          const w = working[d][e.id];
          if (!w) return OFF_NAMES[manualOf(sched, e.id, d)] || 'Riposo';
          if (w.shift === 'M') m++; else if (w.shift === 'P') p++;
          return `${SHIFT_NAMES[w.shift]} ${timeRange(w.shift)}${w.dept !== e.dept ? ` (${deptName(w.dept)})` : ''}`;
        });
        rows.push([dept.name, e.name, ...days, m, p]);
      }
    }
    return rows;
  }

  // ======================================================================
  // PDF da inviare ai dipendenti
  // ======================================================================
  const canSharePdf = () => {
    try {
      return !!(navigator.canShare && typeof File === 'function' &&
        navigator.canShare({ files: [new File([''], 'turni.pdf', { type: 'application/pdf' })] }));
    } catch (e) {
      return false;
    }
  };
  const plain = (t) => String(t).replace(/–/g, '-').replace(/…/g, '...');
  const fileSafe = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

  function pdfData() {
    const store = ui.store;
    const sched = getSchedule(store, ui.week);
    const dates = weekDates(ui.week);
    const working = dates.map((_, d) => workingOn(sched, d));
    const times = { M: plain(timeRange('M')), P: plain(timeRange('P')), G: plain(timeRange('G')) };
    const depts = DEPTS.filter((d) => (!ui.dept || d.id === ui.dept) && deptEmployees(store, d.id).length);
    const sections = depts.map((dept) => ({
      title: dept.name,
      rows: deptEmployees(store, dept.id).map((e) => {
        let total = 0;
        const cells = dates.map((_, d) => {
          const c = cellState(e, d, sched, working, null);
          if (c.kind === 'M' || c.kind === 'P' || c.kind === 'G') {
            total++;
            const where = working[d][e.id].dept !== e.dept ? ` (${deptName(working[d][e.id].dept)})` : '';
            return { kind: c.kind, text: `${SHIFT_NAMES[c.kind]}\n${times[c.kind]}${where}` };
          }
          if (c.kind === 'F' || c.kind === 'A') return { kind: c.kind, text: OFF_NAMES[c.kind] };
          return { kind: 'R', text: 'Riposo' };
        });
        return { name: e.name, cells, total: String(total) };
      }),
    }));
    return {
      title: `Turni ${ui.dept ? deptName(ui.dept) : 'di tutti i reparti'} - ${storeName(store)}`,
      subtitle: `Settimana da lunedì ${fmtLong(dates[0])} a domenica ${fmtLong(dates[6])}`,
      days: dates.map((dt, i) => `${DAY_SHORT[i]} ${fmtShort(dt)}`),
      sections,
      legend: `Mattino ${times.M}  ·  Pomeriggio ${times.P}  ·  Giornata intera ${times.G}`,
      footer: `Generato il ${fmtLong(new Date())}`,
      fileName: `Turni_${fileSafe(storeName(store))}_${ui.dept ? fileSafe(deptName(ui.dept)) + '_' : ''}${ui.week}.pdf`,
    };
  }

  /** Offre il file con un nuovo tocco quando il browser non consente la condivisione immediata. */
  function offerFile(file) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="pdf-ready">
        <p id="pdf-ready"><strong>PDF pronto.</strong><br><span class="muted small">${esc(file.name)}</span></p>
        <div class="row end">
          <button class="btn" data-answer="download">Scarica</button>
          <button class="btn primary" data-answer="share">Invia</button>
        </div></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-answer]');
      if (!b && ev.target !== wrap) return;
      wrap.remove();
      if (!b) return;
      if (b.dataset.answer === 'share') navigator.share({ files: [file], title: file.name }).catch(() => {});
      else download(file.name, file, 'application/pdf');
    });
    wrap.querySelector('[data-answer="share"]').focus();
  }

  const exportPDF = (btn) => sharePDF(btn, pdfData(), TurniPDF.build);
  const exportSummaryPDF = (btn) => sharePDF(btn, summaryPdfData(), TurniPDF.buildSummary);

  async function sharePDF(btn, data, builder) {
    if (!data.sections.length) return toast('Nessun dipendente da inserire nel PDF');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparo il PDF…';
    let blob;
    try {
      blob = await builder(data);
    } catch (e) {
      toast('Impossibile creare il PDF: controlla la connessione e riprova');
      return;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
    const file = new File([blob], data.fileName, { type: 'application/pdf' });
    if (!canSharePdf()) return download(data.fileName, blob, 'application/pdf');
    try {
      await navigator.share({ files: [file], title: data.title });
    } catch (e) {
      if (e && e.name === 'AbortError') return; // l'utente ha chiuso la condivisione
      offerFile(file);
    }
  }

  // ======================================================================
  // Eventi
  // ======================================================================
  function setWeek(date) {
    ui.week = toISO(mondayOf(date));
    ui.day = null;
    saveUI();
    render();
  }

  function removeEmployee(e) {
    state.employees = state.employees.filter((x) => x.id !== e.id);
    for (const st of Object.keys(state.schedules)) {
      for (const w of Object.values(state.schedules[st])) {
        for (const day of w.days) for (const dp of Object.values(day)) for (const s of SLOTS) dp[s] = (dp[s] || []).filter((id) => id !== e.id);
        if (w.manual) delete w.manual[e.id];
      }
    }
    if (editingId === e.id) editingId = null;
  }

  function bindGlobal() {
    document.getElementById('tabs').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-tab]');
      if (!b) return;
      ui.tab = b.dataset.tab;
      editingId = null;
      saveUI();
      render();
    });
    document.getElementById('store-select').addEventListener('change', (ev) => {
      ui.store = ev.target.value;
      editingId = null;
      saveUI();
      render();
    });
    document.getElementById('dept-select').addEventListener('change', (ev) => {
      ui.dept = ev.target.value;
      editingId = null;
      saveUI();
      render();
    });

    view.addEventListener('click', onClick);
    view.addEventListener('change', onChange);
    view.addEventListener('submit', onSubmit);
  }

  function onClick(ev) {
    const el = ev.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const store = ui.store;
    const week = ui.week;
    const confirmed = (msg, okLabel, fn) => ask(msg, okLabel, true).then((ok) => {
      if (!ok) return;
      fn();
      save();
      render();
    });

    switch (el.dataset.action) {
      case 'week-prev': return setWeek(addDays(fromISO(week), -7));
      case 'week-next': return setWeek(addDays(fromISO(week), 7));
      case 'week-today': return setWeek(new Date());
      case 'open-dept': ui.dept = el.dataset.dept; saveUI(); return render();
      case 'goto-staff': ui.tab = 'staff'; saveUI(); return render();
      case 'period': ui.period = el.dataset.period; saveUI(); return render();
      case 'day': ui.day = Number(el.dataset.day); saveUI(); return render();
      case 'pdf': return exportPDF(el);
      case 'summary-pdf': return exportSummaryPDF(el);
      case 'period-prev': return shiftPeriod(-1);
      case 'period-next': return shiftPeriod(1);
      case 'summary-dept': ui.dept = el.dataset.dept; saveUI(); return render();
      case 'pick': return openPicker(el);
      case 'generate': {
        const depts = ui.dept ? [ui.dept] : DEPTS.map((d) => d.id);
        // Nessuna conferma: le caselle inserite a mano restano come sono.
        const missing = generate(store, week, depts);
        save();
        render();
        return toast(missing ? `Turni generati: ${missing} ${missing === 1 ? 'posto scoperto' : 'posti scoperti'}` : 'Turni generati e bilanciati');
      }
      case 'clear-week': {
        const what = ui.dept ? `di ${deptName(ui.dept)}` : 'di tutti i reparti';
        return confirmed(`Eliminare i turni generati ${what} di questa settimana? Le caselle inserite a mano restano.`, 'Svuota', () => {
          const sched = getSchedule(store, week);
          sched.days.forEach((day, d) => {
            for (const dp of Object.keys(day)) {
              if (ui.dept && dp !== ui.dept) continue;
              for (const s of SLOTS) day[dp][s] = (day[dp][s] || []).filter((id) => manualOf(sched, id, d) === s);
            }
          });
        });
      }
      case 'copy-week': {
        const rows = weekTable();
        if (rows) copyText(rows.map((r) => r.join('\t')).join('\n'), 'Turni copiati: incollali in Excel');
        return;
      }
      case 'export-csv': {
        const rows = weekTable();
        if (!rows) return;
        const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
        const name = `turni-${store}${ui.dept ? '-' + ui.dept : ''}-${week}.csv`;
        return download(name, '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
      }
      case 'print': return window.print();
      case 'edit-emp': editingId = el.dataset.id; render(); document.getElementById('f-name').focus(); return;
      case 'cancel-edit': editingId = null; return render();
      case 'delete-emp': {
        const e = empById(el.dataset.id);
        if (!e) return;
        return confirmed(`Eliminare ${e.name}? Verrà tolto anche dai turni già pianificati.`, 'Elimina', () => {
          removeEmployee(e);
          toast(`${e.name} eliminato`);
        });
      }
      case 'clear-sample':
        return confirmed('Eliminare tutti i dipendenti di esempio e i loro turni?', 'Elimina', () => {
          state.employees = []; state.schedules = {}; state.sampleData = false;
        });
      case 'copy-needs': {
        const target = document.getElementById('copy-target').value;
        const targets = target === '__all' ? STORES.filter((s) => s.id !== store).map((s) => s.id) : [target];
        for (const t of targets) state.requirements[t] = clone(state.requirements[store]);
        save();
        return toast(`Copiato su ${targets.length === 1 ? storeName(targets[0]) : 'tutti gli altri punti vendita'}`);
      }
      case 'reset-needs':
        return confirmed(`Ripristinare le persone richieste predefinite per ${storeName(store)}?`, 'Ripristina', () => {
          state.requirements[store] = defaultStoreRequirements();
        });
      case 'backup':
        return download(`backup-turni-${toISO(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
      case 'copy-backup':
        return copyText(JSON.stringify(state), 'Backup copiato negli appunti');
      case 'load-sample':
        return confirmed('Caricare i dati di esempio? Sostituiranno dipendenti e turni attuali.', 'Carica', () => {
          state.employees = sampleEmployees(); state.schedules = {}; state.sampleData = true;
        });
      case 'reset-all':
        return confirmed('Cancellare definitivamente tutti i dipendenti, i turni e le impostazioni di tutte le sedi?', 'Cancella tutto', () => {
          state = freshState(false);
        });
      case 'logout':
        return storage.signOut().then(() => renderLogin());
    }
  }

  function onChange(ev) {
    const el = ev.target;
    const store = ui.store;
    switch (el.dataset.action) {
      case 'use-history': state.settings.useHistory = el.checked; return save();
      case 'sum-month': ui.sumMonth = Number(el.value); saveUI(); return render();
      case 'sum-year': ui.sumYear = Number(el.value); saveUI(); return render();
      case 'need': {
        const v = Math.max(0, Math.min(50, parseInt(el.value, 10) || 0));
        state.requirements[store][ui.dept][el.dataset.day][el.dataset.shift] = v;
        save();
        return render();
      }
      case 'time': state.settings.times[el.dataset.shift][el.dataset.edge] = el.value; return save();
      case 'default-max': state.settings.defaultMaxShifts = Math.max(1, Math.min(7, parseInt(el.value, 10) || 5)); return save();
      case 'restore': {
        const file = el.files && el.files[0];
        if (!file) return;
        file.text().then((txt) => {
          const data = JSON.parse(txt);
          if (!data || !Array.isArray(data.employees)) throw new Error('formato');
          return ask('Importare il backup? I dati attuali verranno sostituiti.', 'Importa', true).then((ok) => {
            if (!ok) return;
            state = normalize(data);
            save();
            render();
            toast('Backup importato');
          });
        }).catch(() => toast('File non valido: scegli un backup .json esportato da questa app'));
      }
    }
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (ev.target.id !== 'emp-form') return;
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
      toast(`${name} aggiornato`);
    } else {
      state.employees.push(Object.assign({ id: uid() }, data));
      toast(`${name} aggiunto a ${deptName(data.dept)}, ${storeName(data.store)}`);
    }
    editingId = null;
    save();
    render();
  }

  // ======================================================================
  // Avvio
  // ======================================================================
  const SYNC_TEXT = { saving: 'Salvataggio…', saved: 'Salvato', error: 'Non salvato: riprovo…' };
  function setSync(s) {
    const el = document.getElementById('sync-status');
    el.textContent = SYNC_TEXT[s] || '';
    el.className = 'sync ' + (s || '');
  }

  // Le modifiche arrivate da altre sedi aspettano che l'utente finisca di scrivere.
  let remotePending = false;
  const typing = () => {
    const a = document.activeElement;
    return a && view.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName);
  };
  function onRemoteChange(id, data) {
    TurniStorage.applyDoc(state, id, data);
    state = normalize(state);
    if (typing()) { remotePending = true; return; }
    render();
  }
  view.addEventListener('focusout', () => {
    if (!remotePending) return;
    setTimeout(() => {
      if (typing()) return;
      remotePending = false;
      render();
    }, 0);
  });

  let cloudStarted = false;
  async function startCloud() {
    const loaded = await storage.load();
    if (loaded) {
      state = normalize(loaded);
    } else {
      // Database vuoto: si parte dai dati di questo browser, se sono dati reali.
      const local = TurniStorage.readLocal();
      state = normalize(local && !local.sampleData && (local.employees || []).length ? local : freshState(false));
      save();
    }
    if (!cloudStarted) {
      cloudStarted = true;
      storage.subscribe(onRemoteChange);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') storage.flush(); });
      window.addEventListener('beforeunload', () => storage.flush());
    }
    render();
  }

  async function boot() {
    storage = TurniStorage.create(STORES.map((s) => s.id), { onStatus: setSync });
    bindGlobal();
    if (storage.mode === 'local') {
      const local = await storage.load();
      state = local ? normalize(local) : freshState(true);
      save();
      return render();
    }

    view.innerHTML = '<p class="empty">Connessione al database…</p>';
    let user;
    try {
      user = await storage.init();
    } catch (e) {
      view.innerHTML = '<div class="empty"><p>Impossibile collegarsi al database. Controlla la connessione a internet e ricarica la pagina.</p></div>';
      return;
    }
    view.addEventListener('submit', async (ev) => {
      if (ev.target.id !== 'login-form') return;
      const f = new FormData(ev.target);
      const btn = ev.target.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Accesso…';
      try {
        await storage.signIn(String(f.get('email')).trim(), String(f.get('password')));
      } catch (e) {
        return renderLogin('Email o password non corrette.');
      }
      try {
        await startCloud();
      } catch (e) {
        renderLogin('Accesso riuscito ma impossibile leggere i dati. Verifica di aver eseguito supabase/schema.sql.');
      }
    });
    if (!user) return renderLogin();
    try {
      await startCloud();
    } catch (e) {
      renderLogin('Sessione scaduta: accedi di nuovo.');
    }
  }

  boot();
})();
