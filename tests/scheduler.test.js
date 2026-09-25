const test = require('node:test');
const assert = require('node:assert/strict');
const { generate, countShifts, canWork } = require('../js/scheduler.js');

function week(M, P, sundayM = M, sundayP = P) {
  const days = [];
  for (let d = 0; d < 6; d++) days.push({ M, P });
  days.push({ M: sundayM, P: sundayP });
  return days;
}

function staff(dept, n, extra = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: `${dept}-${i}`, dept, maxShifts: 5, ...extra }));
}

function assertValid(employees, schedule) {
  const byId = Object.fromEntries(employees.map((e) => [e.id, e]));
  const perWeek = {};
  schedule.forEach((day, d) => {
    const seen = new Set();
    for (const dept of Object.keys(day)) {
      for (const s of ['M', 'P']) {
        for (const id of day[dept][s]) {
          assert.ok(!seen.has(id), `${id} ha due turni il giorno ${d}`);
          seen.add(id);
          assert.ok(canWork(byId[id], d, s), `${id} non disponibile giorno ${d} turno ${s}`);
          perWeek[id] = (perWeek[id] || 0) + 1;
        }
      }
    }
  });
  for (const [id, n] of Object.entries(perWeek)) {
    assert.ok(n <= (byId[id].maxShifts || 5), `${id} supera il massimo settimanale`);
  }
}

test('copre il fabbisogno e bilancia mattine e pomeriggi', () => {
  const employees = staff('casse', 8);
  const requirements = { casse: week(3, 3, 2, 0) };
  const { schedule, shortages } = generate({ employees, requirements });
  assert.deepEqual(shortages, []);
  assertValid(employees, schedule);
  schedule.forEach((day, d) => {
    assert.equal(day.casse.M.length, requirements.casse[d].M);
    assert.equal(day.casse.P.length, requirements.casse[d].P);
  });
  const counts = countShifts(schedule);
  for (const e of employees) {
    const c = counts[e.id] || { M: 0, P: 0 };
    assert.ok(Math.abs(c.M - c.P) <= 1, `${e.id}: ${c.M} mattine vs ${c.P} pomeriggi`);
  }
  const totals = employees.map((e) => counts[e.id].M + counts[e.id].P);
  assert.ok(Math.max(...totals) - Math.min(...totals) <= 1, `carico sbilanciato: ${totals}`);
});

test('rispetta riposi e disponibilità parziali', () => {
  const employees = staff('panetteria', 4);
  employees[0].availability = ['X', 'X', '', '', '', '', ''];
  employees[1].availability = ['M', 'M', 'M', '', '', '', ''];
  employees[2].availability = ['', '', '', 'P', 'P', '', 'X'];
  const { schedule, shortages } = generate({ employees, requirements: { panetteria: week(1, 1) } });
  assert.deepEqual(shortages, []);
  assertValid(employees, schedule);
});

test('segnala i posti scoperti quando il personale non basta', () => {
  const employees = staff('pescheria', 1);
  const { schedule, shortages } = generate({ employees, requirements: { pescheria: week(1, 1) } });
  assertValid(employees, schedule);
  const missing = shortages.reduce((a, s) => a + s.missing, 0);
  assert.equal(missing, 14 - 5);
});

test('compensa lo storico delle settimane precedenti', () => {
  const employees = staff('salumeria', 2);
  const history = { 'salumeria-0': { M: 10, P: 4 }, 'salumeria-1': { M: 4, P: 10 } };
  const requirements = { salumeria: week(1, 1, 1, 1).slice(0, 5).concat([{ M: 0, P: 0 }, { M: 0, P: 0 }]) };
  const { schedule } = generate({ employees, requirements, history });
  const c = countShifts(schedule);
  assert.equal(c['salumeria-0'].P, 5, 'chi ha fatto più mattine ora fa pomeriggi');
  assert.equal(c['salumeria-1'].M, 5);
});

test('reparti indipendenti e dipendenti di altri reparti non usati', () => {
  const employees = [...staff('macelleria', 3), ...staff('ortofrutta', 3)];
  const { schedule } = generate({
    employees,
    requirements: { macelleria: week(1, 1), ortofrutta: week(1, 1) },
  });
  assertValid(employees, schedule);
  for (const day of schedule) {
    for (const s of ['M', 'P']) {
      assert.ok(day.macelleria[s].every((id) => id.startsWith('macelleria')));
      assert.ok(day.ortofrutta[s].every((id) => id.startsWith('ortofrutta')));
    }
  }
});

test('evita pomeriggio seguito da mattino quando possibile', () => {
  const employees = staff('scaffali', 6);
  const { schedule } = generate({ employees, requirements: { scaffali: week(2, 2) } });
  let turnarounds = 0;
  for (const e of employees) {
    for (let d = 1; d < 7; d++) {
      if (schedule[d - 1].scaffali.P.includes(e.id) && schedule[d].scaffali.M.includes(e.id)) turnarounds++;
    }
  }
  assert.ok(turnarounds <= 2, `troppe sequenze pomeriggio→mattino: ${turnarounds}`);
});

test('non modifica le caselle inserite a mano e le conta nella copertura', () => {
  const employees = staff('casse', 6);
  const fixed = {
    'casse-0': { 0: 'P', 1: 'P', 2: 'P' },
    'casse-1': { 0: 'F', 1: 'F', 2: 'F', 3: 'F', 4: 'F', 5: 'F', 6: 'F' },
    'casse-2': { 3: 'A', 4: 'R' },
  };
  for (let seed = 1; seed <= 20; seed++) {
    const { schedule, shortages } = generate({ employees, requirements: { casse: week(2, 2) }, fixed, seed });
    for (let d = 0; d < 3; d++) {
      assert.ok(schedule[d].casse.P.includes('casse-0'), 'turno manuale spostato');
      assert.equal(schedule[d].casse.P.length, 2, 'il turno manuale deve contare nel fabbisogno');
    }
    for (let d = 0; d < 7; d++) {
      for (const s of ['M', 'P']) assert.ok(!schedule[d].casse[s].includes('casse-1'), 'assegnato durante le ferie');
    }
    for (const s of ['M', 'P']) {
      assert.ok(!schedule[3].casse[s].includes('casse-2'), 'assegnato durante un\'assenza');
      assert.ok(!schedule[4].casse[s].includes('casse-2'), 'assegnato durante un riposo');
    }
    assert.ok(Array.isArray(shortages));
  }
});

test('ferie e assenze riducono i turni massimi della settimana', () => {
  const employees = staff('ortofrutta', 3);
  const fixed = { 'ortofrutta-0': { 0: 'F', 1: 'F' } };
  const { schedule } = generate({ employees, requirements: { ortofrutta: week(1, 1) }, fixed });
  const c = countShifts(schedule)['ortofrutta-0'] || { M: 0, P: 0 };
  assert.ok(c.M + c.P <= 3, `con 2 giorni di ferie al massimo 3 turni, trovati ${c.M + c.P}`);
});

test('la giornata intera inserita a mano copre mattino e pomeriggio e vale un giorno', () => {
  const employees = staff('salumeria', 3);
  const fixed = { 'salumeria-0': { 0: 'G', 1: 'G' } };
  const { schedule, shortages } = generate({ employees, requirements: { salumeria: week(1, 1) }, fixed });
  assert.deepEqual(shortages, []);
  for (const d of [0, 1]) {
    assert.deepEqual(schedule[d].salumeria.G, ['salumeria-0']);
    assert.equal(schedule[d].salumeria.M.length, 0, 'il mattino è già coperto dalla giornata intera');
    assert.equal(schedule[d].salumeria.P.length, 0, 'il pomeriggio è già coperto dalla giornata intera');
  }
  const c = countShifts(schedule)['salumeria-0'];
  assert.equal(c.G, 2);
  assert.ok(c.M + c.P + c.G <= 5, 'le giornate intere contano nei giorni massimi');
});

test('prove casuali: copertura mai oltre il richiesto, vincoli e caselle manuali rispettati', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const n = 3 + (seed % 6);
    const employees = Array.from({ length: n }, (_, i) => ({
      id: `e${i}`,
      dept: 'x',
      maxShifts: 4 + (i % 3),
      availability: Array.from({ length: 7 }, (_, d) => ['', '', '', 'M', 'P', 'X'][(i * 7 + d + seed) % 6]),
    }));
    const fixed = seed % 2 ? { e0: { 1: 'G', 2: 'F' }, e1: { 0: 'P', 3: 'A' } } : {};
    const req = Array.from({ length: 7 }, (_, d) => ({ M: 1 + ((d + seed) % 2), P: 1 + (seed % 2) }));
    const { schedule } = generate({ employees, requirements: { x: req }, fixed, seed });
    schedule.forEach((day, d) => {
      const c = day.x;
      const g = c.G.length;
      assert.ok(c.M.length + g <= Math.max(req[d].M, g), `seed ${seed} giorno ${d}: troppe mattine`);
      assert.ok(c.P.length + g <= Math.max(req[d].P, g), `seed ${seed} giorno ${d}: troppi pomeriggi`);
      const seen = new Set();
      for (const s of ['M', 'P', 'G']) {
        for (const id of c[s]) {
          assert.ok(!seen.has(id), `seed ${seed}: ${id} due volte il giorno ${d}`);
          seen.add(id);
          const f = (fixed[id] || {})[d];
          if (f) assert.equal(f, s, `seed ${seed}: casella manuale di ${id} cambiata`);
          else assert.ok(canWork(employees.find((e) => e.id === id), d, s), `seed ${seed}: ${id} non disponibile`);
        }
      }
    });
  }
});
