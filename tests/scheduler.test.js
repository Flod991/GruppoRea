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
