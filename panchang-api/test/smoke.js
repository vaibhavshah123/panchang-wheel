'use strict';
const assert = require('assert');
const { handle } = require('../src/api');
const get = (path, query) => handle({ method: 'GET', path, query });

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ' + name); };

ok('health', () => assert.strictEqual(get('/api/health', {}).body.status, 'ok'));

ok('10 Nov 2026 06:00 IST positions', () => {
  const r = get('/api/panchang', { date: '2026-11-10', time: '06:00' });
  assert.strictEqual(r.status, 200);
  const g = Object.fromEntries(r.body.grahas.map((x) => [x.name, x]));
  assert.strictEqual(g.Moon.rashi.name, 'Vrischika');
  assert.strictEqual(g.Moon.nakshatra.name, 'Vishakha');
  assert.strictEqual(g.Moon.nakshatra.pada, 4);
  assert.strictEqual(g.Sun.rashi.name, 'Tula');
  assert.strictEqual(g.Saturn.rashi.name, 'Meena');
  assert.strictEqual(g.Jupiter.rashi.name, 'Simha');
  assert.ok(g.Mercury.retrograde && g.Venus.retrograde && g.Saturn.retrograde);
  assert.ok(!g.Mars.retrograde && !g.Jupiter.retrograde);
  assert.ok(g.Rahu.retrograde);
  assert.strictEqual(r.body.panchang.tithi.paksha, 'Shukla');
  assert.strictEqual(r.body.panchang.tithi.name, 'Pratipada');
  assert.strictEqual(r.body.panchang.hindu_month.name, 'Kartika');
  assert.strictEqual(r.body.panchang.vara.name, 'Tuesday');
});

ok('Rahu and Ketu are 180 degrees apart', () => {
  const r = get('/api/panchang', { date: '2026-11-10', include: 'grahas' });
  const g = Object.fromEntries(r.body.grahas.map((x) => [x.name, x]));
  const d = Math.abs(g.Rahu.longitude - g.Ketu.longitude);
  assert.ok(Math.abs(d - 180) < 0.001);
});

ok('1962-02-04: seven planets in Makara', () => {
  const r = get('/api/panchang', { date: '1962-02-04', time: '12:00', include: 'grahas' });
  ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].forEach((n) => {
    assert.strictEqual(r.body.grahas.find((x) => x.name === n).rashi.name, 'Makara', n);
  });
});

ok('Adhika Jyeshtha 2026 and Chaitra start', () => {
  assert.strictEqual(get('/api/panchang', { date: '2026-06-01', include: 'panchang' }).body.panchang.hindu_month.adhika, true);
  const c = get('/api/panchang', { date: '2026-03-25', include: 'panchang' }).body.panchang.hindu_month;
  assert.strictEqual(c.name, 'Chaitra');
  assert.strictEqual(c.adhika, false);
});

ok('Mesha Sankranti 2026 falls on 14 April', () => {
  const r = get('/api/panchang', { date: '2026-04-13', time: '12:00', include: 'transits' });
  const sun = r.body.grahas.find((x) => x.name === 'Sun').transit.sign.next_change;
  assert.strictEqual(sun.to, 'Mesha');
  assert.ok(sun.at.local.startsWith('2026-04-14'));
});

ok('transits range: Saturn and Jupiter in 2026', () => {
  const r = get('/api/transits', { from: '2026-01-01', to: '2026-12-31', bodies: 'Jupiter,Saturn' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.events.some((e) => e.body === 'Jupiter' && e.type === 'sign_ingress' && e.to === 'Simha'));
  assert.ok(r.body.events.some((e) => e.body === 'Saturn' && e.type === 'station_direct'));
});

ok('lagna with place', () => {
  const r = get('/api/panchang', { date: '2026-11-10', time: '06:00', lat: '19.076', lon: '72.8777' });
  assert.strictEqual(r.body.lagna.rashi.name, 'Tula');
  assert.ok(r.body.grahas.every((x) => x.house >= 1 && x.house <= 12));
});

ok('time zones: IANA, offset and datetime agree', () => {
  const a = get('/api/panchang', { date: '2026-11-10', time: '06:00', tz: 'Asia/Kolkata', include: 'grahas' }).body.input.instant.utc;
  const b = get('/api/panchang', { date: '2026-11-10', time: '06:00', tz: ' 05:30', include: 'grahas' }).body.input.instant.utc;
  const c = get('/api/panchang', { datetime: '2026-11-10T06:00:00+05:30', include: 'grahas' }).body.input.instant.utc;
  assert.strictEqual(a, '2026-11-10T00:30:00Z');
  assert.strictEqual(b, a); assert.strictEqual(c, a);
  const ny = get('/api/panchang', { date: '2026-07-01', time: '12:00', tz: 'America/New_York', include: 'grahas' }).body.input.instant.utc;
  assert.strictEqual(ny, '2026-07-01T16:00:00Z');
});

ok('time is optional', () => {
  const r = get('/api/panchang', { date: '2026-11-10', include: 'grahas' }).body.input;
  assert.ok(r.time_defaulted);
  assert.strictEqual(r.instant.local, '2026-11-10T06:00:00+05:30');
});

ok('bad input gives clear errors', () => {
  assert.strictEqual(get('/api/panchang', { date: '2026-02-30' }).status, 400);
  assert.strictEqual(get('/api/panchang', { date: '2026-11-10', time: '25:00' }).status, 400);
  assert.strictEqual(get('/api/panchang', { date: '1800-01-01' }).status, 400);
  assert.strictEqual(get('/api/panchang', { date: '2026-11-10', tz: 'Mars/Base' }).status, 400);
  assert.strictEqual(get('/api/panchang', { time: '06:00' }).status, 400);
  assert.strictEqual(get('/api/panchang', { date: '2026-11-10', lat: '19' }).status, 400);
  assert.strictEqual(get('/api/nothing', {}).status, 404);
});

console.log(`\n${n} checks passed`);
