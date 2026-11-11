# Panchang API

This folder is the API half of the Panchang Wheel project. The page and the full explanation of the Panchang are in the [main README](../README.md).

Send a date (and optionally a time) and get back every graha's position and transit details, plus the Panchang for that moment.

- Sidereal zodiac, Lahiri ayanamsa, geocentric apparent positions
- Rahu and Ketu use the mean node
- Valid for 1900 to 2100
- No database, no external service: everything is calculated from the `astronomy-engine` library

## Run it

```bash
npm install
npm start          # http://localhost:3000
npm test           # 11 checks against known dates
```

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Port to listen on |
| `ALLOW_ORIGIN` | `*` | Website allowed to call it from a browser, for example `https://yoursite.com` |
| `RATE_LIMIT_PER_MIN` | 60 | Requests per IP per minute. 0 switches it off |

## Deploy it

- **Vercel:** import the repository, set the **Root Directory** to `panchang-api`, and deploy. The files in `api/` become `/api/panchang`, `/api/transits` and `/api/health` with no further setup.
- **Render, Railway, Fly.io, a VPS or any Node 18+ host:** run `npm install` then `npm start`.
- **Shared PHP hosting:** this needs Node, so host it on one of the above and call it from your site.

## Endpoint 1: positions, Panchang and transits for one moment

`GET` or `POST` `/api/panchang`

| Parameter | Required | Meaning |
|---|---|---|
| `date` | no | `YYYY-MM-DD`. Leave `date` and `time` out to use the current moment |
| `time` | no | `HH:MM` or `HH:MM:SS`, 24-hour. Default `06:00` in the chosen time zone |
| `datetime` | no | Instead of date and time: `2026-11-10T06:30` or `2026-11-10T06:30:00+05:30` |
| `tz` | no | `IST` (default), `UTC`, an offset like `+05:30` (write `%2B05:30` in a URL), or an IANA name like `Asia/Kolkata` |
| `lat`, `lon` | no | Give both to add the ascendant (lagna) and whole-sign houses. East longitude is positive |
| `include` | no | Any of `grahas`, `panchang`, `transits`, `lagna`. Default `grahas,panchang,transits` |

Example:

```
GET /api/panchang?date=2026-11-10&time=06:30&tz=IST&lat=19.076&lon=72.8777
```

```json
{
  "input": {
    "instant": { "utc": "2026-11-10T01:00:00Z", "local": "2026-11-10T06:30:00+05:30" },
    "timezone": "Asia/Kolkata",
    "time_defaulted": false,
    "used_current_moment": false,
    "place": { "lat": 19.076, "lon": 72.8777 }
  },
  "settings": { "zodiac": "sidereal", "ayanamsa": "Lahiri", "rahu_ketu": "mean node" },
  "lagna": { "rashi": { "number": 7, "name": "Tula" }, "dms_in_rashi": "19°37′45″", "house_system": "whole sign" },
  "grahas": [
    {
      "name": "Saturn",
      "sanskrit": "Shani",
      "longitude": 344.5325,
      "rashi": { "number": 12, "name": "Meena", "english": "Pisces" },
      "degree_in_rashi": 14.5333,
      "dms_in_rashi": "14°31′57″",
      "nakshatra": { "number": 26, "name": "Uttara Bhadrapada", "pada": 4 },
      "speed_deg_per_day": -0.0517,
      "retrograde": true,
      "house": 6,
      "transit": {
        "sign": {
          "current": "Meena",
          "entered_at": { "utc": "2025-03-29T15:50:40Z", "local": "2025-03-29T21:20:40+05:30" },
          "entered_from": "Kumbha",
          "days_in_sign": 590.38,
          "next_change": { "at": { "...": "..." }, "to": "Mesha", "retrograde_ingress": false, "days_from_now": 204.94 }
        },
        "nakshatra": { "current": "Uttara Bhadrapada", "pada": 4, "entered_at": { "...": "..." }, "next_change": { "to": "Revati", "...": "..." } },
        "station": {
          "previous": { "type": "retrograde", "at": { "utc": "2026-07-26T18:54:11Z", "local": "2026-07-27T00:24:11+05:30" } },
          "next": { "type": "direct", "at": { "utc": "2026-12-11T00:27:03Z", "local": "2026-12-11T05:57:03+05:30" }, "days_from_now": 30.98 }
        }
      }
    }
  ],
  "panchang": {
    "tithi": { "number": 1, "name": "Pratipada", "paksha": "Shukla", "ends_at": { "local": "2026-11-10T14:00:29+05:30" } },
    "vara": { "name": "Tuesday", "lord": "Mangala" },
    "nakshatra": { "name": "Vishakha", "pada": 4, "ends_at": { "...": "..." } },
    "yoga": { "name": "Shobhana", "ends_at": { "...": "..." } },
    "karana": { "name": "Bava", "ends_at": { "...": "..." } },
    "hindu_month": { "name": "Kartika", "adhika": false, "system": "amanta", "elapsed_fraction": 0.0252 }
  }
}
```

What the transit block means, for each graha:

- `sign.entered_at` and `entered_from`: when it moved into its current rashi and where it came from
- `sign.next_change`: the next time the rashi changes, the new rashi, and whether that is a backward step caused by retrograde motion (`retrograde_ingress`)
- `nakshatra`: the same, for the nakshatra
- `station`: the previous and next retrograde or direct turning point (Mars to Saturn only; Sun, Moon, Rahu and Ketu have none)

Any value that cannot be found within the search window comes back as `null`.

## Endpoint 2: every transit in a date range

`GET` or `POST` `/api/transits`

| Parameter | Required | Meaning |
|---|---|---|
| `from`, `to` | yes | `YYYY-MM-DD`. At most 10 years apart |
| `bodies` | no | For example `Jupiter,Saturn,Rahu`. Default all nine |
| `types` | no | Any of `sign`, `nakshatra`, `station`. Default `sign,station` |
| `tz` | no | As above |
| `limit` | no | Up to 2000. Default 500 |

```
GET /api/transits?from=2026-11-10&to=2027-06-30&bodies=Jupiter,Saturn,Mars&types=sign,station
```

returns events in time order, for example:

```json
{ "at": { "local": "2026-12-11T05:57:03+05:30" }, "body": "Saturn", "type": "station_direct" }
{ "at": { "local": "2027-06-03T05:06:..+05:30" }, "body": "Saturn", "type": "sign_ingress", "from": "Meena", "to": "Mesha", "retrograde": false }
```

## Errors

Every error has the same shape and an HTTP 4xx status:

```json
{ "error": { "code": "invalid_date", "message": "2026-02-30 is not a real calendar date." } }
```

## Calling it from your website

```html
<script>
fetch('https://YOUR-API-URL/api/panchang?date=2026-11-10&time=06:30')
  .then(r => r.json())
  .then(d => {
    const moon = d.grahas.find(g => g.name === 'Moon');
    console.log(moon.rashi.name, moon.nakshatra.name, d.panchang.tithi.name);
  });
</script>
```

## Limits worth knowing

- Vara is the calendar weekday in the chosen time zone. It is not switched at sunrise.
- There are no sunrise, sunset, Rahu Kaal or Choghadiya times.
- Hindu months are amanta (new moon to new moon). An adhika month is flagged when a lunar month passes without the Sun changing rashi. Lost (kshaya) months are not handled.
- Results can differ from a printed Panchang by an arc-minute or two, so a tithi or nakshatra ending within minutes of the requested time may read either way.
