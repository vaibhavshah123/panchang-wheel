'use strict';
/**
 * Framework-free request handler. Both server.js (plain Node) and the Vercel
 * functions in /api call handle() with the same shape and send the result.
 */
const core = require('./core');
const fs = require('fs');
const path = require('path');

let ENGINE_VERSION = 'unknown';
try {
  const dir = path.dirname(require.resolve('astronomy-engine'));
  ENGINE_VERSION = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
} catch (e) { /* version label is optional */ }

const { GRAHAS, GRAHA_BY_NAME, RASHIS } = core;
const MIN_MS = Date.UTC(1900, 0, 1);
const MAX_MS = Date.UTC(2100, 11, 31, 23, 59, 59);
const DEFAULT_TIME = '06:00:00';

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const first = (v) => (Array.isArray(v) ? v[0] : v);
const str = (v) => { v = first(v); return v === undefined || v === null ? undefined : String(v); };

function parseDateParts(date, time, label) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!dm) throw new ApiError(400, 'invalid_date', `${label} must look like YYYY-MM-DD, for example 2026-11-10.`);
  const y = +dm[1], mo = +dm[2], d = +dm[3];
  const chk = new Date(Date.UTC(y, mo - 1, d));
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) {
    throw new ApiError(400, 'invalid_date', `${date} is not a real calendar date.`);
  }
  const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!tm || +tm[1] > 23 || +tm[2] > 59 || (tm[3] && +tm[3] > 59)) {
    throw new ApiError(400, 'invalid_time', 'time must look like HH:MM or HH:MM:SS (24-hour), for example 06:30.');
  }
  return { y, mo, d, h: +tm[1], mi: +tm[2], s: tm[3] ? +tm[3] : 0 };
}

/** Works out the instant being asked about. */
function resolveInstant(q, tz) {
  const dt = str(q.datetime);
  if (dt) {
    if (/(Z|[+-]\d{2}:?\d{2})$/i.test(dt)) {
      const ms = Date.parse(dt);
      if (isNaN(ms)) throw new ApiError(400, 'invalid_datetime', 'datetime could not be read. Use 2026-11-10T06:30:00+05:30 or 2026-11-10T06:30.');
      return { ms, timeDefaulted: false, dateDefaulted: false };
    }
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)$/.exec(dt);
    if (!m) throw new ApiError(400, 'invalid_datetime', 'datetime could not be read. Use 2026-11-10T06:30:00+05:30 or 2026-11-10T06:30.');
    const p = parseDateParts(m[1], m[2], 'datetime');
    return { ms: core.localToUtc(p.y, p.mo, p.d, p.h, p.mi, p.s, tz), timeDefaulted: false, dateDefaulted: false };
  }
  const date = str(q.date), time = str(q.time);
  if (!date && !time) return { ms: Date.now(), timeDefaulted: false, dateDefaulted: true };
  if (!date) throw new ApiError(400, 'missing_date', 'Give a date as well as a time, or leave both out to use the current moment.');
  const p = parseDateParts(date, time || DEFAULT_TIME, 'date');
  return { ms: core.localToUtc(p.y, p.mo, p.d, p.h, p.mi, p.s, tz), timeDefaulted: !time, dateDefaulted: false };
}

function parseTz(q) {
  const tz = core.makeTz(str(q.tz));
  if (!tz) throw new ApiError(400, 'invalid_tz', 'tz must be IST, UTC, an offset such as +05:30 (write %2B05:30 in a URL), or an IANA name such as Asia/Kolkata.');
  return tz;
}

function parsePlace(q) {
  const latS = str(q.lat), lonS = str(q.lon);
  if (latS === undefined && lonS === undefined) return null;
  if (latS === undefined || lonS === undefined) throw new ApiError(400, 'invalid_place', 'Give both lat and lon, or neither.');
  const lat = Number(latS), lon = Number(lonS);
  if (!isFinite(lat) || Math.abs(lat) > 66.5) throw new ApiError(400, 'invalid_place', 'lat must be a number between -66.5 and 66.5.');
  if (!isFinite(lon) || Math.abs(lon) > 180) throw new ApiError(400, 'invalid_place', 'lon must be a number between -180 and 180 (east is positive).');
  return { lat, lon };
}

function parseInclude(q) {
  const raw = str(q.include);
  const all = ['grahas', 'panchang', 'transits'];
  if (!raw) return new Set(all);
  const set = new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  for (const s of set) {
    if (!['grahas', 'panchang', 'transits', 'lagna'].includes(s)) {
      throw new ApiError(400, 'invalid_include', `Unknown include value "${s}". Use grahas, panchang, transits, lagna.`);
    }
  }
  return set;
}

function parseBodies(q) {
  const raw = str(q.bodies);
  if (!raw || raw.toLowerCase() === 'all') return GRAHAS;
  const out = [];
  for (const n of raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    const g = GRAHA_BY_NAME[n];
    if (!g) throw new ApiError(400, 'invalid_body', `Unknown graha "${n}". Use ${GRAHAS.map((x) => x.id).join(', ')}.`);
    if (!out.includes(g)) out.push(g);
  }
  return out;
}

function checkRange(ms, label) {
  if (ms < MIN_MS || ms > MAX_MS) throw new ApiError(400, 'out_of_range', `${label} must fall between 1900-01-01 and 2100-12-31.`);
}

function settingsBlock(ms) {
  return {
    zodiac: 'sidereal',
    ayanamsa: 'Lahiri',
    ayanamsa_degrees: core.r4(core.ayanamsaAt(ms)),
    rahu_ketu: 'mean node',
    positions: 'geocentric, apparent',
    engine: `astronomy-engine ${ENGINE_VERSION}`,
  };
}

/* ---------- endpoints ---------- */
function panchangEndpoint(q) {
  const t0 = Date.now();
  const tz = parseTz(q);
  const inst = resolveInstant(q, tz);
  checkRange(inst.ms, 'The date');
  const place = parsePlace(q);
  const include = parseInclude(q);
  if (place && !str(q.include)) include.add('lagna');
  if (include.has('lagna') && !place) throw new ApiError(400, 'missing_place', 'lagna needs lat and lon.');

  const ms = inst.ms;
  const out = {
    input: {
      instant: core.timeObj(ms, tz),
      timezone: tz.label,
      time_defaulted: inst.timeDefaulted ? `no time given, used ${DEFAULT_TIME.slice(0, 5)} local` : false,
      used_current_moment: inst.dateDefaulted,
      place: place || null,
    },
    settings: settingsBlock(ms),
  };

  let lagna = null;
  if (include.has('lagna')) {
    const lon = core.ascendant(ms, place.lat, place.lon);
    const p = core.placeOf(lon);
    lagna = p.ri;
    out.lagna = {
      longitude: core.r4(lon),
      rashi: { number: p.ri + 1, name: RASHIS[p.ri].name, english: RASHIS[p.ri].english },
      degree_in_rashi: core.r4(p.inRashi),
      dms_in_rashi: core.dms(p.inRashi),
      nakshatra: { number: p.ni + 1, name: core.NAKSHATRAS[p.ni], pada: p.pada },
      house_system: 'whole sign',
    };
  }

  if (include.has('grahas') || include.has('transits')) {
    out.grahas = GRAHAS.map((g) => {
      const row = {};
      if (include.has('grahas')) {
        Object.assign(row, core.describe(g, ms));
        if (lagna !== null) row.house = ((row.rashi.number - 1 - lagna + 12) % 12) + 1;
      } else {
        row.name = g.id;
        row.sanskrit = g.sanskrit;
      }
      if (include.has('transits')) row.transit = core.transitsFor(g, ms, tz);
      return row;
    });
  }
  if (include.has('panchang')) out.panchang = core.panchangAt(ms, tz);
  out.meta = { calculated_in_ms: Date.now() - t0 };
  return out;
}

function transitsEndpoint(q) {
  const t0 = Date.now();
  const tz = parseTz(q);
  const from = str(q.from), to = str(q.to);
  if (!from || !to) throw new ApiError(400, 'missing_range', 'Give from and to as YYYY-MM-DD dates.');
  const fp = parseDateParts(from, '00:00', 'from'), tp = parseDateParts(to, '23:59:59', 'to');
  const fromMs = core.localToUtc(fp.y, fp.mo, fp.d, fp.h, fp.mi, fp.s, tz);
  const toMs = core.localToUtc(tp.y, tp.mo, tp.d, tp.h, tp.mi, tp.s, tz);
  checkRange(fromMs, 'from'); checkRange(toMs, 'to');
  if (toMs < fromMs) throw new ApiError(400, 'invalid_range', 'to must not be earlier than from.');
  if (toMs - fromMs > 10 * 366 * core.DAY) throw new ApiError(400, 'range_too_long', 'The range can cover at most 10 years.');

  const bodies = parseBodies(q);
  const types = (str(q.types) || 'sign,station').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const t of types) if (!['sign', 'nakshatra', 'station'].includes(t)) throw new ApiError(400, 'invalid_types', `Unknown types value "${t}". Use sign, nakshatra, station.`);
  let limit = parseInt(str(q.limit) || '500', 10);
  if (!isFinite(limit) || limit < 1) limit = 500;
  limit = Math.min(limit, 2000);

  const slow = bodies.some((b) => b.id === 'Moon') && types.includes('nakshatra') && toMs - fromMs > 400 * core.DAY;
  if (slow) throw new ApiError(400, 'range_too_long', 'Moon nakshatra changes are frequent, so keep that request within about a year.');

  const events = core.eventsBetween(fromMs, toMs, bodies, types, tz, limit);
  return {
    input: { from: core.timeObj(fromMs, tz), to: core.timeObj(toMs, tz), timezone: tz.label, bodies: bodies.map((b) => b.id), types },
    settings: settingsBlock(fromMs),
    count: events.length,
    truncated: events.length >= limit,
    events,
    meta: { calculated_in_ms: Date.now() - t0 },
  };
}

function docs() {
  return {
    name: 'Panchang API',
    version: '1.0.0',
    endpoints: {
      'GET|POST /api/panchang': {
        about: 'Positions, Panchang and transit details for one instant.',
        params: {
          date: 'YYYY-MM-DD. Leave date and time out to use the current moment.',
          time: 'HH:MM or HH:MM:SS, 24-hour, optional. Default 06:00 in the chosen time zone.',
          datetime: 'Alternative to date and time: 2026-11-10T06:30 or with an offset, 2026-11-10T06:30:00+05:30.',
          tz: 'IST (default), UTC, +05:30 (write %2B05:30 in a URL) or an IANA name such as Asia/Kolkata.',
          lat: 'Optional latitude. With lon, adds the ascendant (lagna) and whole-sign houses.',
          lon: 'Optional longitude, east positive.',
          include: 'Optional list from grahas, panchang, transits, lagna. Default grahas,panchang,transits.',
        },
        example: '/api/panchang?date=2026-11-10&time=06:30&tz=IST&lat=19.076&lon=72.8777',
      },
      'GET|POST /api/transits': {
        about: 'Every sign change, nakshatra change and retrograde station inside a date range.',
        params: {
          from: 'YYYY-MM-DD, required.',
          to: 'YYYY-MM-DD, required. At most 10 years after from.',
          bodies: 'Optional list, for example Jupiter,Saturn. Default all nine.',
          types: 'Optional list from sign, nakshatra, station. Default sign,station.',
          tz: 'As above.',
          limit: 'Optional, up to 2000. Default 500.',
        },
        example: '/api/transits?from=2026-01-01&to=2026-12-31&bodies=Jupiter,Saturn,Rahu',
      },
      'GET /api/health': { about: 'Returns {"status":"ok"}.' },
    },
    notes: [
      'Valid for dates from 1900 to 2100.',
      'Sidereal zodiac with the Lahiri ayanamsa. Rahu and Ketu use the mean node.',
      'Vara is the calendar weekday in the requested time zone, not sunrise-based.',
    ],
  };
}

/** @returns {{status:number, body:object}} */
function handle({ method, path, query, body }) {
  try {
    const m = (method || 'GET').toUpperCase();
    const p = (path || '/').replace(/\/+$/, '') || '/';
    if (m === 'OPTIONS') return { status: 204, body: null };
    if (p === '/' || p === '/api') return { status: 200, body: docs() };
    if (p === '/api/health') return { status: 200, body: { status: 'ok' } };
    if (m !== 'GET' && m !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Use GET or POST.');
    const params = Object.assign({}, query || {}, m === 'POST' && body && typeof body === 'object' ? body : {});
    if (p === '/api/panchang') return { status: 200, body: panchangEndpoint(params) };
    if (p === '/api/transits') return { status: 200, body: transitsEndpoint(params) };
    throw new ApiError(404, 'not_found', `No endpoint at ${p}. See / for the list.`);
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: { error: { code: e.code, message: e.message } } };
    return { status: 500, body: { error: { code: 'internal_error', message: 'Something went wrong while calculating.' } } };
  }
}

module.exports = { handle, ApiError };
