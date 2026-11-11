'use strict';
/**
 * Calculation core: sidereal (Lahiri) positions, Panchang limbs, Hindu month,
 * ascendant and transit searches. No network and no external data: everything
 * is computed from the Astronomy Engine library.
 */
const A = require('astronomy-engine');

const AY0 = 23.85306;          // Lahiri ayanamsa at J2000, degrees
const NAK = 360 / 27;
const DAY = 864e5;
const HOUR = 36e5;

const norm = (x) => { x %= 360; return x < 0 ? x + 360 : x; };
const wrap = (x) => ((x + 540) % 360) - 180;
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const pad = (n) => String(n).padStart(2, '0');

/* ---------- reference data ---------- */
const RASHIS = [
  ['Mesha', 'Aries'], ['Vrishabha', 'Taurus'], ['Mithuna', 'Gemini'], ['Karka', 'Cancer'],
  ['Simha', 'Leo'], ['Kanya', 'Virgo'], ['Tula', 'Libra'], ['Vrischika', 'Scorpio'],
  ['Dhanu', 'Sagittarius'], ['Makara', 'Capricorn'], ['Kumbha', 'Aquarius'], ['Meena', 'Pisces'],
].map(([name, english]) => ({ name, english }));

const NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
const TITHIS = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima'];
const YOGAS = ['Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyana', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti'];
const MOVABLE = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];
const VARAS = [['Sunday', 'Ravi'], ['Monday', 'Soma'], ['Tuesday', 'Mangala'], ['Wednesday', 'Budha'], ['Thursday', 'Guru'], ['Friday', 'Shukra'], ['Saturday', 'Shani']];
const MASAS = ['Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada', 'Ashwin', 'Kartika', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna', 'Chaitra'];

/**
 * step: scan step for transit searches. signMax / nakMax: how far to look for a
 * sign or nakshatra change. stMax: how far to look for a retrograde station.
 */
const GRAHAS = [
  { id: 'Sun',     sanskrit: 'Surya',   body: A.Body.Sun,     step: DAY,       signMax: 400 * DAY,  nakMax: 60 * DAY },
  { id: 'Moon',    sanskrit: 'Chandra', body: A.Body.Moon,    step: 3 * HOUR,  signMax: 60 * DAY,   nakMax: 10 * DAY },
  { id: 'Mars',    sanskrit: 'Mangala', body: A.Body.Mars,    step: DAY,       signMax: 400 * DAY,  nakMax: 400 * DAY, stMax: 900 * DAY },
  { id: 'Mercury', sanskrit: 'Budha',   body: A.Body.Mercury, step: 12 * HOUR, signMax: 200 * DAY,  nakMax: 100 * DAY, stMax: 200 * DAY },
  { id: 'Jupiter', sanskrit: 'Guru',    body: A.Body.Jupiter, step: DAY,       signMax: 800 * DAY,  nakMax: 450 * DAY, stMax: 450 * DAY },
  { id: 'Venus',   sanskrit: 'Shukra',  body: A.Body.Venus,   step: DAY,       signMax: 250 * DAY,  nakMax: 250 * DAY, stMax: 700 * DAY },
  { id: 'Saturn',  sanskrit: 'Shani',   body: A.Body.Saturn,  step: DAY,       signMax: 1500 * DAY, nakMax: 900 * DAY, stMax: 450 * DAY },
  { id: 'Rahu',    sanskrit: 'Rahu',    node: true,           step: 2 * DAY,   signMax: 700 * DAY,  nakMax: 400 * DAY },
  { id: 'Ketu',    sanskrit: 'Ketu',    node: true,           step: 2 * DAY,   signMax: 700 * DAY,  nakMax: 400 * DAY },
];
const GRAHA_BY_NAME = Object.fromEntries(GRAHAS.map((g) => [g.id.toLowerCase(), g]));

/* ---------- astronomy ---------- */
const ROT = A.Rotation_EQJ_ECL();
const astroTime = (ms) => A.MakeTime(new Date(ms));

function sidLon(body, ms) {
  const v = A.GeoVector(body, astroTime(ms), true);
  const e = A.RotateVector(ROT, v);
  return norm(Math.atan2(e.y, e.x) * 180 / Math.PI - AY0);
}
function ayanamsaAt(ms) {
  const T = astroTime(ms).ut / 36525;
  return AY0 + (5028.796195 * T + 1.1054348 * T * T) / 3600;
}
function rahuLon(ms) {
  const T = astroTime(ms).ut / 36525;
  const om = norm(125.04452 - 1934.136261 * T + 0.0020708 * T * T);
  return norm(om - ayanamsaAt(ms));
}
function lonOf(g, ms) {
  if (g.id === 'Rahu') return rahuLon(ms);
  if (g.id === 'Ketu') return norm(rahuLon(ms) + 180);
  return sidLon(g.body, ms);
}
function speedOf(g, ms) {          // degrees per day, negative when retrograde
  return wrap(lonOf(g, ms + 6 * HOUR) - lonOf(g, ms - 6 * HOUR)) * 2;
}
function sunMoon(ms) { return [sidLon(A.Body.Sun, ms), sidLon(A.Body.Moon, ms)]; }

function dms(x) {
  let d = Math.floor(x), m = Math.floor((x - d) * 60), s = Math.round(((x - d) * 60 - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; d += 1; }
  return `${d}\u00B0${pad(m)}\u2032${pad(s)}\u2033`;
}
function placeOf(lon) {
  const ri = Math.floor(lon / 30), ni = Math.floor(lon / NAK);
  return { ri, ni, pada: Math.floor((lon - ni * NAK) / (NAK / 4)) + 1, inRashi: lon - ri * 30 };
}

/* ---------- time zones ---------- */
function makeTz(input) {
  let s = (input === undefined || input === null || input === '') ? 'Asia/Kolkata' : String(input);
  const u = s.trim().toUpperCase();
  if (u === 'IST') s = 'Asia/Kolkata';
  if (u === 'UTC' || u === 'GMT' || u === 'Z') return { kind: 'fixed', minutes: 0, label: 'UTC' };
  // A "+" in a query string arrives as a space, so a leading space counts as "+"
  const m = /^([+-]|\s)?(\d{1,2})(?::?(\d{2}))?$/.exec(s);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const minutes = sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
    if (Math.abs(minutes) > 14 * 60) return null;
    const lab = `UTC${sign < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
    return { kind: 'fixed', minutes, label: lab };
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s.trim() });
    return { kind: 'iana', name: s.trim(), label: s.trim() };
  } catch (e) { return null; }
}
function offsetMinutes(tz, utcMs) {
  if (tz.kind === 'fixed') return tz.minutes;
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz.name, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {};
  const whole = Math.floor(utcMs / 1000) * 1000;
  dtf.formatToParts(new Date(whole)).forEach((x) => { p[x.type] = x.value; });
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - whole) / 60000);
}
function localToUtc(y, mo, d, h, mi, s, tz) {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = naive;
  for (let i = 0; i < 3; i++) utc = naive - offsetMinutes(tz, utc) * 60000;
  return utc;
}
function localParts(ms, tz) {
  const off = offsetMinutes(tz, ms);
  return { off, d: new Date(ms + off * 60000) };
}
function timeObj(ms, tz) {
  const t = Math.round(ms / 1000) * 1000;
  const { off, d } = localParts(t, tz);
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  return {
    utc: new Date(t).toISOString().replace('.000Z', 'Z'),
    local: d.toISOString().slice(0, 19) + sign + pad(Math.floor(a / 60)) + ':' + pad(a % 60),
  };
}

/* ---------- searches ---------- */
function findChange(g, ms, dir, idxFn, stepMs, maxMs) {
  const i0 = idxFn(lonOf(g, ms));
  let lo = ms, hi = null;
  for (let t = ms + dir * stepMs; Math.abs(t - ms) <= maxMs; t += dir * stepMs) {
    if (idxFn(lonOf(g, t)) !== i0) { hi = t; break; }
    lo = t;
  }
  if (hi === null) return null;
  for (let k = 0; k < 26; k++) {
    const mid = (lo + hi) / 2;
    if (idxFn(lonOf(g, mid)) === i0) lo = mid; else hi = mid;
  }
  return { at: (lo + hi) / 2, other: idxFn(lonOf(g, hi)), same: i0 };
}
function findStation(g, ms, dir) {
  if (!g.stMax) return null;
  const retro0 = speedOf(g, ms) < 0;
  let lo = ms, hi = null;
  for (let t = ms + dir * DAY; Math.abs(t - ms) <= g.stMax; t += dir * DAY) {
    if ((speedOf(g, t) < 0) !== retro0) { hi = t; break; }
    lo = t;
  }
  if (hi === null) return null;
  for (let k = 0; k < 22; k++) {
    const mid = (lo + hi) / 2;
    if ((speedOf(g, mid) < 0) === retro0) lo = mid; else hi = mid;
  }
  const at = (lo + hi) / 2;
  // forward: the station that ends the current state; backward: the one that began it
  const type = dir > 0 ? (retro0 ? 'direct' : 'retrograde') : (retro0 ? 'retrograde' : 'direct');
  return { type, at };
}

const signIdx = (lon) => Math.floor(lon / 30);
const nakIdx = (lon) => Math.floor(lon / NAK);

function describe(g, ms) {
  const lon = lonOf(g, ms), p = placeOf(lon), sp = speedOf(g, ms);
  return {
    name: g.id,
    sanskrit: g.sanskrit,
    longitude: r4(lon),
    rashi: { number: p.ri + 1, name: RASHIS[p.ri].name, english: RASHIS[p.ri].english },
    degree_in_rashi: r4(p.inRashi),
    dms_in_rashi: dms(p.inRashi),
    nakshatra: { number: p.ni + 1, name: NAKSHATRAS[p.ni], pada: p.pada },
    speed_deg_per_day: r4(sp),
    retrograde: sp < 0,
  };
}

function transitsFor(g, ms, tz) {
  const sNext = findChange(g, ms, +1, signIdx, g.step, g.signMax);
  const sPrev = findChange(g, ms, -1, signIdx, g.step, g.signMax);
  const nNext = findChange(g, ms, +1, nakIdx, g.step, g.nakMax);
  const nPrev = findChange(g, ms, -1, nakIdx, g.step, g.nakMax);
  const cur = placeOf(lonOf(g, ms));

  const out = {
    sign: {
      current: RASHIS[cur.ri].name,
      entered_at: sPrev ? timeObj(sPrev.at, tz) : null,
      entered_from: sPrev ? RASHIS[sPrev.other].name : null,
      days_in_sign: sPrev ? r4((ms - sPrev.at) / DAY) : null,
      next_change: sNext ? {
        at: timeObj(sNext.at, tz),
        to: RASHIS[sNext.other].name,
        retrograde_ingress: speedOf(g, sNext.at) < 0,
        days_from_now: r4((sNext.at - ms) / DAY),
      } : null,
    },
    nakshatra: {
      current: NAKSHATRAS[cur.ni],
      pada: cur.pada,
      entered_at: nPrev ? timeObj(nPrev.at, tz) : null,
      next_change: nNext ? {
        at: timeObj(nNext.at, tz),
        to: NAKSHATRAS[nNext.other],
        days_from_now: r4((nNext.at - ms) / DAY),
      } : null,
    },
    station: null,
  };
  if (g.stMax) {
    const stNext = findStation(g, ms, +1);
    const stPrev = findStation(g, ms, -1);
    out.station = {
      previous: stPrev ? { type: stPrev.type, at: timeObj(stPrev.at, tz) } : null,
      next: stNext ? { type: stNext.type, at: timeObj(stNext.at, tz), days_from_now: r4((stNext.at - ms) / DAY) } : null,
    };
  }
  return out;
}

/* ---------- Panchang ---------- */
const tithiIdx = (ms) => { const s = sunMoon(ms); return Math.floor(norm(s[1] - s[0]) / 12); };
const nakOfMoon = (ms) => Math.floor(sunMoon(ms)[1] / NAK);
const yogaIdx = (ms) => { const s = sunMoon(ms); return Math.floor(norm(s[0] + s[1]) / NAK); };
const karanaIdx = (ms) => { const s = sunMoon(ms); return Math.floor(norm(s[1] - s[0]) / 6); };

function findEnd(ms, fn) {
  const i0 = fn(ms);
  let lo = ms, hi = ms;
  for (let k = 0; k < 400; k++) {
    hi = lo + 20 * 60e3;
    if (fn(hi) !== i0) break;
    lo = hi;
  }
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) === i0) lo = mid; else hi = mid;
  }
  return hi;
}
function karanaName(k) {
  if (k === 0) return 'Kimstughna';
  if (k === 57) return 'Shakuni';
  if (k === 58) return 'Chatushpada';
  if (k === 59) return 'Naga';
  return MOVABLE[(k - 1) % 7];
}
function tithiName(ti) {
  if (ti === 14) return 'Purnima';
  if (ti === 29) return 'Amavasya';
  return TITHIS[ti % 15];
}
function elSigned(ms) { const s = sunMoon(ms); return wrap(s[1] - s[0]); }
function refineNewMoon(t) {
  for (let k = 0; k < 8; k++) t -= elSigned(t) / 12.19 * DAY;
  return t;
}
function lunarMonth(ms) {
  const s = sunMoon(ms), el = norm(s[1] - s[0]);
  const prev = refineNewMoon(ms - el / 12.19 * DAY);
  const next = refineNewMoon(prev + 29.53 * DAY);
  const rs = Math.floor(sunMoon(prev)[0] / 30), re = Math.floor(sunMoon(next)[0] / 30);
  return { rs, adhika: rs === re, name: MASAS[rs], prev, next, frac: Math.min(1, Math.max(0, (ms - prev) / (next - prev))) };
}

function panchangAt(ms, tz) {
  const [sun, moon] = sunMoon(ms), el = norm(moon - sun);
  const ti = Math.floor(el / 12), mp = placeOf(moon);
  const yi = Math.floor(norm(sun + moon) / NAK), ki = Math.floor(el / 6);
  const vara = VARAS[localParts(ms, tz).d.getUTCDay()];
  const lm = lunarMonth(ms);
  return {
    tithi: {
      number: ti + 1,
      number_in_paksha: (ti % 15) + 1,
      name: tithiName(ti),
      paksha: ti < 15 ? 'Shukla' : 'Krishna',
      ends_at: timeObj(findEnd(ms, tithiIdx), tz),
    },
    vara: { name: vara[0], lord: vara[1], basis: 'calendar weekday in the requested time zone' },
    nakshatra: { number: mp.ni + 1, name: NAKSHATRAS[mp.ni], pada: mp.pada, ends_at: timeObj(findEnd(ms, nakOfMoon), tz) },
    yoga: { number: yi + 1, name: YOGAS[yi], ends_at: timeObj(findEnd(ms, yogaIdx), tz) },
    karana: { number: ki + 1, name: karanaName(ki), ends_at: timeObj(findEnd(ms, karanaIdx), tz) },
    hindu_month: {
      name: lm.name,
      adhika: lm.adhika,
      system: 'amanta',
      starts_at: timeObj(lm.prev, tz),
      ends_at: timeObj(lm.next, tz),
      elapsed_fraction: r4(lm.frac),
    },
    moon_sun_elongation: r4(el),
  };
}

/* ---------- ascendant ---------- */
function ascendant(ms, lat, lon) {
  const t = astroTime(ms);
  const th = norm(A.SiderealTime(t) * 15 + lon) * Math.PI / 180;
  const T = t.ut / 36525;
  const eps = (23.4392911 - 0.0130042 * T) * Math.PI / 180, phi = lat * Math.PI / 180;
  const lam = norm(Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * 180 / Math.PI);
  return norm(lam - ayanamsaAt(ms));
}

/* ---------- event list for a date range ---------- */
function eventsBetween(fromMs, toMs, bodies, types, tz, limit) {
  const events = [];
  const want = new Set(types);
  const cap = limit * 4;
  for (const g of bodies) {
    const scan = (kind, idxFn, max, nameOf) => {
      let t = fromMs;
      while (events.length < cap) {
        const c = findChange(g, t, +1, idxFn, g.step, Math.min(max, toMs - t + g.step));
        if (!c || c.at > toMs) break;
        events.push({
          at_ms: c.at, body: g.id, type: kind,
          from: nameOf(c.same), to: nameOf(c.other),
          retrograde: speedOf(g, c.at) < 0,
        });
        t = c.at + 60e3;
      }
    };
    if (want.has('sign')) scan('sign_ingress', signIdx, g.signMax, (i) => RASHIS[i].name);
    if (want.has('nakshatra')) scan('nakshatra_ingress', nakIdx, g.nakMax, (i) => NAKSHATRAS[i]);
    if (want.has('station') && g.stMax) {
      let t = fromMs;
      while (events.length < cap) {
        const s = findStation(g, t, +1);
        if (!s || s.at > toMs) break;
        events.push({ at_ms: s.at, body: g.id, type: s.type === 'retrograde' ? 'station_retrograde' : 'station_direct' });
        t = s.at + DAY;
      }
    }
  }
  events.sort((a, b) => a.at_ms - b.at_ms);
  return events.slice(0, limit).map((e) => {
    const { at_ms, ...rest } = e;
    return { at: timeObj(at_ms, tz), ...rest };
  });
}

module.exports = {
  A, GRAHAS, GRAHA_BY_NAME, RASHIS, NAKSHATRAS, DAY,
  makeTz, offsetMinutes, localToUtc, timeObj, localParts,
  describe, transitsFor, panchangAt, ascendant, ayanamsaAt, placeOf, eventsBetween, lonOf,
  r4, dms,
};
