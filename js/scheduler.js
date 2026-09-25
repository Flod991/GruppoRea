/**
 * Motore di generazione turni.
 *
 * Ogni giornata è divisa in due turni: 'M' (mattino) e 'P' (pomeriggio).
 * Il motore assegna i dipendenti di ogni reparto ai turni richiesti rispettando:
 *   - un solo turno al giorno per dipendente;
 *   - le indisponibilità settimanali (riposo, solo mattino, solo pomeriggio);
 *   - il numero massimo di turni settimanali di ciascuno;
 * e cercando di:
 *   1. distribuire equamente il carico (numero di turni) tra i dipendenti;
 *   2. bilanciare, per ciascun dipendente, turni di mattina e di pomeriggio,
 *      anche tenendo conto dello storico delle settimane precedenti;
 *   3. evitare, quando possibile, il pomeriggio seguito dal mattino del giorno dopo.
 *
 * Le caselle inserite a mano (opts.fixed) non vengono mai modificate: i turni
 * M/P fissati contano per la copertura, mentre riposo, ferie e assenze rendono
 * il dipendente non disponibile quel giorno. Ferie e assenze riducono anche il
 * numero massimo di turni della settimana.
 *
 * Funziona sia nel browser (window.Scheduler) sia in Node (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Scheduler = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SHIFTS = ['M', 'P'];

  // Pesi della funzione obiettivo: il carico equo prevale sul bilanciamento M/P,
  // che a sua volta prevale sulla penalità "pomeriggio → mattino".
  const W_LOAD = 20;
  const W_BALANCE = 1;
  const W_TURNAROUND = 0.5;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Disponibilità del giorno: '' libero, 'M' solo mattino, 'P' solo pomeriggio, 'X' riposo. */
  function canWork(emp, day, shift) {
    const a = (emp.availability && emp.availability[day]) || '';
    if (a === 'X') return false;
    if (a === 'M') return shift === 'M';
    if (a === 'P') return shift === 'P';
    return true;
  }

  function maxShiftsOf(emp, defaultMax) {
    const n = Number(emp.maxShifts);
    return Number.isFinite(n) && n > 0 ? n : defaultMax;
  }

  /**
   * @param {object} opts
   * @param {Array<{id:string, dept:string, maxShifts?:number, availability?:string[]}>} opts.employees
   * @param {Object<string, Array<{M:number,P:number}>>} opts.requirements  reparto -> giorno -> fabbisogno
   * @param {Object<string, {M:number,P:number}>} [opts.history]  turni già svolti in passato per dipendente
   * @param {Object<string, Object<number,string>>} [opts.fixed]  dipendente -> giorno -> 'M'|'P'|'R'|'F'|'A' inseriti a mano
   * @param {number} [opts.days=7]
   * @param {number} [opts.defaultMaxShifts=5]
   * @param {number} [opts.seed=1]  cambia il seed per ottenere soluzioni alternative equivalenti
   * @returns {{schedule: Array<Object<string,{M:string[],P:string[]}>>, shortages: Array<{day:number,dept:string,shift:string,missing:number}>}}
   */
  function generate(opts) {
    const {
      employees = [],
      requirements = {},
      history = {},
      fixed = {},
      days = 7,
      defaultMaxShifts = 5,
      seed = 1,
    } = opts || {};
    const rand = mulberry32(seed);

    const schedule = [];
    for (let d = 0; d < days; d++) schedule.push({});
    const shortages = [];

    const byDept = {};
    for (const e of employees) (byDept[e.dept] = byDept[e.dept] || []).push(e);

    for (const dept of Object.keys(requirements)) {
      const res = solveDept(dept, byDept[dept] || [], requirements[dept], history, fixed, days, defaultMaxShifts, rand);
      for (let d = 0; d < days; d++) schedule[d][dept] = res.days[d];
      shortages.push(...res.shortages);
    }
    return { schedule, shortages };
  }

  function solveDept(dept, emps, req, history, fixed, days, defaultMax, rand) {
    const n = emps.length;
    const fix = emps.map((e) => fixed[e.id] || {});
    const locked = (i, d) => !!fix[i][d];
    // Può ricevere il turno s il giorno d: casella non fissata a mano e dipendente disponibile.
    const ok = (i, d, s) => !locked(i, d) && canWork(emps[i], d, s);
    const max = emps.map((e, i) => {
      let away = 0;
      for (let d = 0; d < days; d++) if (fix[i][d] === 'F' || fix[i][d] === 'A') away++;
      return Math.max(0, maxShiftsOf(e, defaultMax) - away);
    });
    const histDiff = emps.map((e) => {
      const h = history[e.id] || {};
      return (h.M || 0) - (h.P || 0);
    });
    // work[i][d] = null | 'M' | 'P'
    const work = emps.map((_, i) => {
      const row = new Array(days).fill(null);
      for (let d = 0; d < days; d++) if (fix[i][d] === 'M' || fix[i][d] === 'P') row[d] = fix[i][d];
      return row;
    });
    const shortages = [];

    const count = (i) => {
      let m = 0, p = 0;
      for (const s of work[i]) {
        if (s === 'M') m++;
        else if (s === 'P') p++;
      }
      return { m, p };
    };

    // ---- 1. Costruzione greedy, giorno per giorno ----
    for (let d = 0; d < days; d++) {
      const need = { M: need0(req, d, 'M'), P: need0(req, d, 'P') };
      // I turni fissati a mano coprono già parte del fabbisogno.
      for (let i = 0; i < n; i++) if (locked(i, d) && work[i][d]) need[work[i][d]] = Math.max(0, need[work[i][d]] - 1);
      // Si riempie prima il turno con meno candidati per posto richiesto.
      const order = SHIFTS.slice().sort((a, b) => ratio(a) - ratio(b));
      function ratio(s) {
        if (!need[s]) return Infinity;
        let c = 0;
        for (let i = 0; i < n; i++) if (ok(i, d, s)) c++;
        return c / need[s];
      }
      for (const s of order) {
        for (let k = 0; k < need[s]; k++) {
          let best = -1, bestScore = Infinity;
          for (let i = 0; i < n; i++) {
            if (work[i][d] || !ok(i, d, s)) continue;
            const { m, p } = count(i);
            if (m + p >= max[i]) continue;
            const diff = histDiff[i] + m - p; // >0: più mattine che pomeriggi
            const directional = s === 'M' ? diff : -diff;
            let score = ((m + p) / max[i]) * 10 + directional;
            if (s === 'M' && d > 0 && work[i][d - 1] === 'P') score += W_TURNAROUND;
            // Chi oggi può fare solo questo turno va preferito: non servirebbe altrove.
            const other = s === 'M' ? 'P' : 'M';
            if (!canWork(emps[i], d, other)) score -= 0.3;
            score += rand() * 0.05;
            if (score < bestScore) { bestScore = score; best = i; }
          }
          if (best < 0) {
            const missing = need[s] - k;
            shortages.push({ day: d, dept, shift: s, missing });
            break;
          }
          work[best][d] = s;
        }
      }
    }

    // ---- 2. Ricerca locale: scambi e sostituzioni che migliorano l'obiettivo ----
    const objective = () => {
      let total = 0;
      for (let i = 0; i < n; i++) {
        const { m, p } = count(i);
        const diff = histDiff[i] + m - p;
        total += W_BALANCE * diff * diff;
        total += (W_LOAD * (m + p) * (m + p)) / max[i];
        for (let d = 1; d < days; d++) {
          if (work[i][d - 1] === 'P' && work[i][d] === 'M') total += W_TURNAROUND;
        }
      }
      return total;
    };

    let current = objective();
    for (let pass = 0; pass < 60; pass++) {
      let improved = false;
      for (let d = 0; d < days; d++) {
        // a) scambio mattino/pomeriggio tra due dipendenti nello stesso giorno
        for (let a = 0; a < n; a++) {
          if (work[a][d] !== 'M' || !ok(a, d, 'P')) continue;
          for (let b = 0; b < n; b++) {
            if (work[b][d] !== 'P' || !ok(b, d, 'M')) continue;
            work[a][d] = 'P'; work[b][d] = 'M';
            const v = objective();
            if (v < current - 1e-9) { current = v; improved = true; break; }
            work[a][d] = 'M'; work[b][d] = 'P';
          }
        }
        // b) sostituzione di un assegnato con un collega libero quel giorno
        for (let a = 0; a < n; a++) {
          const s = work[a][d];
          if (!s || locked(a, d)) continue;
          for (let b = 0; b < n; b++) {
            if (b === a || work[b][d] || !ok(b, d, s)) continue;
            const { m, p } = count(b);
            if (m + p >= max[b]) continue;
            work[a][d] = null; work[b][d] = s;
            const v = objective();
            if (v < current - 1e-9) { current = v; improved = true; break; }
            work[a][d] = s; work[b][d] = null;
          }
        }
        // c) scambio incrociato su due giorni: lascia invariati i conteggi M/P
        //    ma riduce le sequenze pomeriggio → mattino del giorno dopo
        for (let a = 0; a < n; a++) {
          const s = work[a][d];
          if (!s) continue;
          for (let e = 0; e < days; e++) {
            if (e === d) continue;
            const t = work[a][e];
            if (!t || t === s) continue;
            // a fa s il giorno d e t il giorno e: cerco b che fa t il giorno d e s il giorno e
            for (let b = 0; b < n; b++) {
              if (b === a || work[b][d] !== t || work[b][e] !== s) continue;
              if (!ok(a, d, t) || !ok(b, d, s) || !ok(a, e, s) || !ok(b, e, t)) continue;
              work[a][d] = t; work[b][d] = s; work[a][e] = s; work[b][e] = t;
              const v = objective();
              if (v < current - 1e-9) { current = v; improved = true; break; }
              work[a][d] = s; work[b][d] = t; work[a][e] = t; work[b][e] = s;
            }
          }
        }
      }
      if (!improved) break;
    }

    const out = [];
    for (let d = 0; d < days; d++) {
      const cell = { M: [], P: [] };
      for (let i = 0; i < n; i++) if (work[i][d]) cell[work[i][d]].push(emps[i].id);
      out.push(cell);
    }
    return { days: out, shortages };
  }

  function need0(req, d, s) {
    const v = req && req[d] ? Number(req[d][s]) : 0;
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }

  /** Conta mattine/pomeriggi per dipendente in una pianificazione. */
  function countShifts(schedule, into) {
    const acc = into || {};
    for (const day of schedule || []) {
      for (const dept of Object.keys(day || {})) {
        for (const s of SHIFTS) {
          for (const id of day[dept][s] || []) {
            const c = (acc[id] = acc[id] || { M: 0, P: 0 });
            c[s]++;
          }
        }
      }
    }
    return acc;
  }

  return { generate, countShifts, canWork, SHIFTS };
});
