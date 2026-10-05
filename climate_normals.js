// Beacon · Climate Normals Reference Table
// Build: 2026-05-14 · rev25 (weather normalization initial ship)
// ════════════════════════════════════════════════════════════════════════════
// NOAA U.S. Climate Normals — 1991-2020 product (most recent NOAA Climate
// Normals release, published 2021). Heating Degree Days (HDD) and Cooling
// Degree Days (CDD) are at base 65°F, annual totals.
//
//   Source: NOAA National Centers for Environmental Information (NCEI)
//   Product page: https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals
//   Direct CSV: https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/
//
// CONTIGUOUS U.S. AVERAGES (NOAA 1991-2020):
//   HDD65 ≈ 4,197    CDD65 ≈ 1,322
//
// CURATED STARTER SET. Covers ~80 principal stations (one airport-grade
// reference per major US metro, plus one principal station per state for
// fallback). For comprehensive coverage, refresh from NCEI by running the
// build_climate_normals.py script in this folder, which scrapes the NCEI
// annual normals CSV and emits a regenerated version of this file.
//
// ASHRAE Climate Zones derived from ANSI/ASHRAE/IES Standard 169-2021
// using HDD/CDD thresholds. Suffix letters (A/B/C) reflect humidity and are
// generalized by region — for code-compliance work refer to the official
// ASHRAE 169 county-level table.
// ════════════════════════════════════════════════════════════════════════════

window.CLIMATE_NORMALS_VERSION = '2026-05-14-rev25 · NOAA 1991-2020';

// National reference values used by weather_norm.js for normalization math.
window.NATIONAL_HDD_65 = 4197;
window.NATIONAL_CDD_65 = 1322;

// ── Station records ─────────────────────────────────────────────────────────
// Each station: { id, name, state, city, lat, lon, hdd, cdd, zone }
//   - id:     ICAO airport identifier (stable, unique). Used as the key.
//   - city:   lowercase, no punctuation — used for city→station lookup.
//   - hdd/cdd: NOAA 1991-2020 annual normals at base 65°F.
//   - zone:   ASHRAE 169-2021 climate zone (e.g., '5A', '3B').
//
// Stations are organized roughly by region for readability. Lookup is by
// the cityIndex / principalByState maps further down — not by array order.

window.CLIMATE_STATIONS = {

  // ── Northeast ─────────────────────────────────────────────────────────────
  'KBOS': { id:'KBOS', name:'Boston, MA',           state:'MA', city:'boston',         lat:42.36, lon:-71.01, hdd:5621, cdd:760,  zone:'5A' },
  'KBDL': { id:'KBDL', name:'Hartford, CT',         state:'CT', city:'hartford',       lat:41.94, lon:-72.68, hdd:5897, cdd:740,  zone:'5A' },
  'KPVD': { id:'KPVD', name:'Providence, RI',       state:'RI', city:'providence',     lat:41.72, lon:-71.43, hdd:5631, cdd:720,  zone:'5A' },
  'KPWM': { id:'KPWM', name:'Portland, ME',         state:'ME', city:'portland',       lat:43.65, lon:-70.30, hdd:7150, cdd:430,  zone:'6A' },
  'KMHT': { id:'KMHT', name:'Manchester, NH',       state:'NH', city:'manchester',     lat:42.93, lon:-71.43, hdd:6650, cdd:580,  zone:'6A' },
  'KBTV': { id:'KBTV', name:'Burlington, VT',       state:'VT', city:'burlington',     lat:44.47, lon:-73.15, hdd:7600, cdd:520,  zone:'6A' },
  'KJFK': { id:'KJFK', name:'New York (JFK), NY',   state:'NY', city:'new york',       lat:40.64, lon:-73.78, hdd:4750, cdd:1130, zone:'4A' },
  'KLGA': { id:'KLGA', name:'New York (LGA), NY',   state:'NY', city:'new york city',  lat:40.78, lon:-73.87, hdd:4800, cdd:1180, zone:'4A' },
  'KBUF': { id:'KBUF', name:'Buffalo, NY',          state:'NY', city:'buffalo',        lat:42.94, lon:-78.74, hdd:6680, cdd:610,  zone:'5A' },
  'KALB': { id:'KALB', name:'Albany, NY',           state:'NY', city:'albany',         lat:42.75, lon:-73.80, hdd:6450, cdd:680,  zone:'5A' },
  'KEWR': { id:'KEWR', name:'Newark, NJ',           state:'NJ', city:'newark',         lat:40.69, lon:-74.17, hdd:4710, cdd:1170, zone:'4A' },
  'KPHL': { id:'KPHL', name:'Philadelphia, PA',     state:'PA', city:'philadelphia',   lat:39.87, lon:-75.24, hdd:4650, cdd:1330, zone:'4A' },
  'KPIT': { id:'KPIT', name:'Pittsburgh, PA',       state:'PA', city:'pittsburgh',     lat:40.49, lon:-80.23, hdd:5750, cdd:780,  zone:'5A' },
  'KMDT': { id:'KMDT', name:'Harrisburg, PA',       state:'PA', city:'harrisburg',     lat:40.19, lon:-76.76, hdd:5200, cdd:1090, zone:'5A' },

  // ── Mid-Atlantic ──────────────────────────────────────────────────────────
  'KBWI': { id:'KBWI', name:'Baltimore, MD',        state:'MD', city:'baltimore',      lat:39.18, lon:-76.67, hdd:4530, cdd:1290, zone:'4A' },
  'KDCA': { id:'KDCA', name:'Washington, DC',       state:'DC', city:'washington',     lat:38.85, lon:-77.04, hdd:4040, cdd:1530, zone:'4A' },
  'KIAD': { id:'KIAD', name:'Dulles, VA',           state:'VA', city:'dulles',         lat:38.95, lon:-77.46, hdd:4720, cdd:1230, zone:'4A' },
  'KRIC': { id:'KRIC', name:'Richmond, VA',         state:'VA', city:'richmond',       lat:37.51, lon:-77.32, hdd:3680, cdd:1620, zone:'4A' },
  'KORF': { id:'KORF', name:'Norfolk, VA',          state:'VA', city:'norfolk',        lat:36.90, lon:-76.19, hdd:3320, cdd:1690, zone:'4A' },
  'KILG': { id:'KILG', name:'Wilmington, DE',       state:'DE', city:'wilmington',     lat:39.68, lon:-75.61, hdd:4730, cdd:1230, zone:'4A' },
  'KCRW': { id:'KCRW', name:'Charleston, WV',       state:'WV', city:'charleston',     lat:38.37, lon:-81.59, hdd:4970, cdd:1090, zone:'5A' },

  // ── Southeast ─────────────────────────────────────────────────────────────
  'KCLT': { id:'KCLT', name:'Charlotte, NC',        state:'NC', city:'charlotte',      lat:35.21, lon:-80.94, hdd:2960, cdd:1820, zone:'3A' },
  'KRDU': { id:'KRDU', name:'Raleigh-Durham, NC',   state:'NC', city:'raleigh',        lat:35.88, lon:-78.79, hdd:3160, cdd:1740, zone:'4A' },
  'KCAE': { id:'KCAE', name:'Columbia, SC',         state:'SC', city:'columbia',       lat:33.94, lon:-81.12, hdd:2070, cdd:2390, zone:'3A' },
  'KCHS': { id:'KCHS', name:'Charleston, SC',       state:'SC', city:'charleston',     lat:32.90, lon:-80.04, hdd:1820, cdd:2540, zone:'3A' },
  'KATL': { id:'KATL', name:'Atlanta, GA',          state:'GA', city:'atlanta',        lat:33.64, lon:-84.43, hdd:2680, cdd:1980, zone:'3A' },
  'KSAV': { id:'KSAV', name:'Savannah, GA',         state:'GA', city:'savannah',       lat:32.13, lon:-81.20, hdd:1730, cdd:2670, zone:'2A' },
  'KJAX': { id:'KJAX', name:'Jacksonville, FL',     state:'FL', city:'jacksonville',   lat:30.49, lon:-81.69, hdd:1140, cdd:3000, zone:'2A' },
  'KMCO': { id:'KMCO', name:'Orlando, FL',          state:'FL', city:'orlando',        lat:28.43, lon:-81.31, hdd:530,  cdd:3640, zone:'2A' },
  'KTPA': { id:'KTPA', name:'Tampa, FL',            state:'FL', city:'tampa',          lat:27.98, lon:-82.53, hdd:530,  cdd:3690, zone:'2A' },
  'KMIA': { id:'KMIA', name:'Miami, FL',            state:'FL', city:'miami',          lat:25.79, lon:-80.32, hdd:130,  cdd:4400, zone:'1A' },
  'KFLL': { id:'KFLL', name:'Fort Lauderdale, FL',  state:'FL', city:'fort lauderdale',lat:26.07, lon:-80.15, hdd:160,  cdd:4280, zone:'1A' },
  'KBHM': { id:'KBHM', name:'Birmingham, AL',       state:'AL', city:'birmingham',     lat:33.56, lon:-86.75, hdd:2580, cdd:2180, zone:'3A' },
  'KMOB': { id:'KMOB', name:'Mobile, AL',           state:'AL', city:'mobile',         lat:30.69, lon:-88.25, hdd:1430, cdd:2790, zone:'2A' },
  'KJAN': { id:'KJAN', name:'Jackson, MS',          state:'MS', city:'jackson',        lat:32.31, lon:-90.08, hdd:2150, cdd:2410, zone:'3A' },
  'KMEM': { id:'KMEM', name:'Memphis, TN',          state:'TN', city:'memphis',        lat:35.04, lon:-89.98, hdd:3030, cdd:2080, zone:'3A' },
  'KBNA': { id:'KBNA', name:'Nashville, TN',        state:'TN', city:'nashville',      lat:36.12, lon:-86.68, hdd:3520, cdd:1750, zone:'4A' },
  'KSDF': { id:'KSDF', name:'Louisville, KY',       state:'KY', city:'louisville',     lat:38.17, lon:-85.74, hdd:4260, cdd:1430, zone:'4A' },
  'KLEX': { id:'KLEX', name:'Lexington, KY',        state:'KY', city:'lexington',      lat:38.04, lon:-84.61, hdd:4560, cdd:1240, zone:'4A' },
  'KMSY': { id:'KMSY', name:'New Orleans, LA',      state:'LA', city:'new orleans',    lat:29.99, lon:-90.26, hdd:1280, cdd:2950, zone:'2A' },
  'KBTR': { id:'KBTR', name:'Baton Rouge, LA',      state:'LA', city:'baton rouge',    lat:30.53, lon:-91.15, hdd:1500, cdd:2800, zone:'2A' },
  'KLIT': { id:'KLIT', name:'Little Rock, AR',      state:'AR', city:'little rock',    lat:34.73, lon:-92.22, hdd:2820, cdd:2280, zone:'3A' },

  // ── Midwest ───────────────────────────────────────────────────────────────
  'KORD': { id:'KORD', name:'Chicago, IL',          state:'IL', city:'chicago',        lat:41.98, lon:-87.91, hdd:6180, cdd:880,  zone:'5A' },
  'KMDW': { id:'KMDW', name:'Chicago (Midway), IL', state:'IL', city:'chicago midway', lat:41.79, lon:-87.75, hdd:5950, cdd:1060, zone:'5A' },
  'KIND': { id:'KIND', name:'Indianapolis, IN',     state:'IN', city:'indianapolis',   lat:39.72, lon:-86.29, hdd:5360, cdd:1130, zone:'5A' },
  'KCMH': { id:'KCMH', name:'Columbus, OH',         state:'OH', city:'columbus',       lat:39.99, lon:-82.89, hdd:5440, cdd:1070, zone:'5A' },
  'KCLE': { id:'KCLE', name:'Cleveland, OH',        state:'OH', city:'cleveland',      lat:41.41, lon:-81.85, hdd:5980, cdd:790,  zone:'5A' },
  'KCVG': { id:'KCVG', name:'Cincinnati, OH',       state:'OH', city:'cincinnati',     lat:39.05, lon:-84.67, hdd:4980, cdd:1180, zone:'5A' },
  'KDTW': { id:'KDTW', name:'Detroit, MI',          state:'MI', city:'detroit',        lat:42.21, lon:-83.35, hdd:6310, cdd:870,  zone:'5A' },
  'KGRR': { id:'KGRR', name:'Grand Rapids, MI',     state:'MI', city:'grand rapids',   lat:42.88, lon:-85.52, hdd:6720, cdd:680,  zone:'5A' },
  'KMKE': { id:'KMKE', name:'Milwaukee, WI',        state:'WI', city:'milwaukee',      lat:42.95, lon:-87.90, hdd:6960, cdd:620,  zone:'6A' },
  'KMSN': { id:'KMSN', name:'Madison, WI',          state:'WI', city:'madison',        lat:43.14, lon:-89.34, hdd:7150, cdd:610,  zone:'6A' },
  'KMSP': { id:'KMSP', name:'Minneapolis-St. Paul, MN', state:'MN', city:'minneapolis',lat:44.88, lon:-93.22, hdd:7510, cdd:760,  zone:'6A' },
  'KDSM': { id:'KDSM', name:'Des Moines, IA',       state:'IA', city:'des moines',     lat:41.53, lon:-93.65, hdd:6320, cdd:1090, zone:'5A' },
  'KOMA': { id:'KOMA', name:'Omaha, NE',            state:'NE', city:'omaha',          lat:41.30, lon:-95.89, hdd:5990, cdd:1170, zone:'5A' },
  'KMCI': { id:'KMCI', name:'Kansas City, MO',      state:'MO', city:'kansas city',    lat:39.30, lon:-94.71, hdd:4880, cdd:1500, zone:'5A' },
  'KSTL': { id:'KSTL', name:'St. Louis, MO',        state:'MO', city:'st louis',       lat:38.75, lon:-90.37, hdd:4450, cdd:1580, zone:'4A' },
  'KICT': { id:'KICT', name:'Wichita, KS',          state:'KS', city:'wichita',        lat:37.65, lon:-97.43, hdd:4360, cdd:1680, zone:'4A' },
  'KFAR': { id:'KFAR', name:'Fargo, ND',            state:'ND', city:'fargo',          lat:46.92, lon:-96.81, hdd:8590, cdd:540,  zone:'7'  },
  'KFSD': { id:'KFSD', name:'Sioux Falls, SD',      state:'SD', city:'sioux falls',    lat:43.58, lon:-96.74, hdd:7440, cdd:830,  zone:'6A' },

  // ── South-Central / Texas ─────────────────────────────────────────────────
  'KDFW': { id:'KDFW', name:'Dallas-Fort Worth, TX',state:'TX', city:'dallas',         lat:32.90, lon:-97.04, hdd:2010, cdd:3050, zone:'2A' },
  'KHOU': { id:'KHOU', name:'Houston (Hobby), TX',  state:'TX', city:'houston',        lat:29.65, lon:-95.28, hdd:1290, cdd:3120, zone:'2A' },
  'KIAH': { id:'KIAH', name:'Houston (IAH), TX',    state:'TX', city:'houston intercontinental', lat:29.98, lon:-95.34, hdd:1410, cdd:3050, zone:'2A' },
  'KAUS': { id:'KAUS', name:'Austin, TX',           state:'TX', city:'austin',         lat:30.19, lon:-97.67, hdd:1670, cdd:3140, zone:'2A' },
  'KSAT': { id:'KSAT', name:'San Antonio, TX',      state:'TX', city:'san antonio',    lat:29.53, lon:-98.47, hdd:1430, cdd:3170, zone:'2A' },
  'KELP': { id:'KELP', name:'El Paso, TX',          state:'TX', city:'el paso',        lat:31.81, lon:-106.38,hdd:2390, cdd:2350, zone:'3B' },
  'KOKC': { id:'KOKC', name:'Oklahoma City, OK',    state:'OK', city:'oklahoma city',  lat:35.39, lon:-97.60, hdd:3640, cdd:1990, zone:'3A' },
  'KTUL': { id:'KTUL', name:'Tulsa, OK',            state:'OK', city:'tulsa',          lat:36.20, lon:-95.89, hdd:3540, cdd:2120, zone:'3A' },

  // ── Mountain / West ───────────────────────────────────────────────────────
  'KDEN': { id:'KDEN', name:'Denver, CO',           state:'CO', city:'denver',         lat:39.86, lon:-104.67,hdd:6020, cdd:790,  zone:'5B' },
  'KCOS': { id:'KCOS', name:'Colorado Springs, CO', state:'CO', city:'colorado springs',lat:38.81,lon:-104.71,hdd:6450, cdd:540,  zone:'5B' },
  'KSLC': { id:'KSLC', name:'Salt Lake City, UT',   state:'UT', city:'salt lake city', lat:40.79, lon:-111.98,hdd:5400, cdd:1100, zone:'5B' },
  'KBOI': { id:'KBOI', name:'Boise, ID',            state:'ID', city:'boise',          lat:43.57, lon:-116.22,hdd:5680, cdd:870,  zone:'5B' },
  'KBIL': { id:'KBIL', name:'Billings, MT',         state:'MT', city:'billings',       lat:45.81, lon:-108.54,hdd:6810, cdd:740,  zone:'6B' },
  'KGEG': { id:'KGEG', name:'Spokane, WA',          state:'WA', city:'spokane',        lat:47.62, lon:-117.53,hdd:6470, cdd:500,  zone:'5B' },
  'KCYS': { id:'KCYS', name:'Cheyenne, WY',         state:'WY', city:'cheyenne',       lat:41.16, lon:-104.81,hdd:7000, cdd:340,  zone:'6B' },
  'KABQ': { id:'KABQ', name:'Albuquerque, NM',      state:'NM', city:'albuquerque',    lat:35.04, lon:-106.61,hdd:4080, cdd:1280, zone:'4B' },
  'KPHX': { id:'KPHX', name:'Phoenix, AZ',          state:'AZ', city:'phoenix',        lat:33.43, lon:-112.01,hdd:1010, cdd:4760, zone:'2B' },
  'KTUS': { id:'KTUS', name:'Tucson, AZ',           state:'AZ', city:'tucson',         lat:32.12, lon:-110.94,hdd:1480, cdd:3520, zone:'2B' },
  'KLAS': { id:'KLAS', name:'Las Vegas, NV',        state:'NV', city:'las vegas',      lat:36.08, lon:-115.15,hdd:2080, cdd:3640, zone:'3B' },
  'KRNO': { id:'KRNO', name:'Reno, NV',             state:'NV', city:'reno',           lat:39.49, lon:-119.77,hdd:5390, cdd:700,  zone:'5B' },

  // ── Pacific Coast ─────────────────────────────────────────────────────────
  'KSEA': { id:'KSEA', name:'Seattle, WA',          state:'WA', city:'seattle',        lat:47.45, lon:-122.31,hdd:4620, cdd:240,  zone:'4C' },
  'KPDX': { id:'KPDX', name:'Portland, OR',         state:'OR', city:'portland',       lat:45.59, lon:-122.60,hdd:4290, cdd:430,  zone:'4C' },
  'KEUG': { id:'KEUG', name:'Eugene, OR',           state:'OR', city:'eugene',         lat:44.12, lon:-123.22,hdd:4520, cdd:330,  zone:'4C' },
  'KSFO': { id:'KSFO', name:'San Francisco, CA',    state:'CA', city:'san francisco',  lat:37.62, lon:-122.37,hdd:2640, cdd:140,  zone:'3C' },
  'KOAK': { id:'KOAK', name:'Oakland, CA',          state:'CA', city:'oakland',        lat:37.72, lon:-122.22,hdd:2570, cdd:220,  zone:'3C' },
  'KSJC': { id:'KSJC', name:'San Jose, CA',         state:'CA', city:'san jose',       lat:37.36, lon:-121.93,hdd:2290, cdd:540,  zone:'3C' },
  'KLAX': { id:'KLAX', name:'Los Angeles, CA',      state:'CA', city:'los angeles',    lat:33.94, lon:-118.41,hdd:1280, cdd:620,  zone:'3B' },
  'KBUR': { id:'KBUR', name:'Burbank, CA',          state:'CA', city:'burbank',        lat:34.20, lon:-118.36,hdd:1380, cdd:1230, zone:'3B' },
  'KSAN': { id:'KSAN', name:'San Diego, CA',        state:'CA', city:'san diego',      lat:32.73, lon:-117.19,hdd:1100, cdd:760,  zone:'3B' },
  'KSMF': { id:'KSMF', name:'Sacramento, CA',       state:'CA', city:'sacramento',     lat:38.70, lon:-121.59,hdd:2620, cdd:1310, zone:'3B' },
  'KFAT': { id:'KFAT', name:'Fresno, CA',           state:'CA', city:'fresno',         lat:36.78, lon:-119.72,hdd:2390, cdd:2010, zone:'3B' },

  // ── Alaska & Hawaii ───────────────────────────────────────────────────────
  'PANC': { id:'PANC', name:'Anchorage, AK',        state:'AK', city:'anchorage',      lat:61.17, lon:-150.02,hdd:10070,cdd:0,    zone:'7'  },
  'PAFA': { id:'PAFA', name:'Fairbanks, AK',        state:'AK', city:'fairbanks',      lat:64.80, lon:-147.88,hdd:13720,cdd:100,  zone:'8'  },
  'PHNL': { id:'PHNL', name:'Honolulu, HI',         state:'HI', city:'honolulu',       lat:21.32, lon:-157.93,hdd:0,    cdd:4630, zone:'1A' },
};

// ── City name → station ID index (lowercase, no punctuation) ────────────────
// Used by getStationForLocation() to resolve a portfolio row's city/state to
// the nearest principal NOAA station. Aliases listed for the obvious cases.

window.CLIMATE_CITY_INDEX = (function () {
  var idx = {};
  Object.keys(window.CLIMATE_STATIONS).forEach(function (id) {
    var s = window.CLIMATE_STATIONS[id];
    idx[s.state + '|' + s.city] = id;
  });
  // Hand-curated aliases (commonly used variant spellings)
  var alias = {
    'NY|new york city': 'KLGA',
    'NY|nyc':           'KLGA',
    'NY|manhattan':     'KLGA',
    'NY|brooklyn':      'KJFK',
    'NY|queens':        'KJFK',
    'NY|bronx':         'KLGA',
    'NY|staten island': 'KEWR',
    'NY|long island':   'KJFK',
    'DC|washington dc': 'KDCA',
    'DC|dc':            'KDCA',
    'IL|chicago il':    'KORD',
    'IL|chicago loop':  'KMDW',
    'CA|sf':            'KSFO',
    'CA|la':            'KLAX',
    'CA|los angeles ca':'KLAX',
    'CA|silicon valley':'KSJC',
    'TX|houston tx':    'KIAH',
    'TX|dfw':           'KDFW',
    'TX|fort worth':    'KDFW',
    'FL|miami beach':   'KMIA',
    'FL|south beach':   'KMIA',
    'MA|cambridge':     'KBOS',
    'PA|philly':        'KPHL',
    'MN|st paul':       'KMSP',
    'MN|saint paul':    'KMSP',
    'MO|saint louis':   'KSTL',
    'MO|kc':            'KMCI',
    'NV|vegas':         'KLAS',
  };
  Object.keys(alias).forEach(function (k) { idx[k] = alias[k]; });
  return idx;
})();

// ── State principal station (fallback when city not recognized) ─────────────
// One station per state — the largest metro in that state. Used by
// getStationForLocation() when state is known but city isn't matched.

window.CLIMATE_PRINCIPAL_BY_STATE = {
  AL:'KBHM', AK:'PANC', AZ:'KPHX', AR:'KLIT', CA:'KLAX',
  CO:'KDEN', CT:'KBDL', DE:'KILG', DC:'KDCA', FL:'KMIA',
  GA:'KATL', HI:'PHNL', ID:'KBOI', IL:'KORD', IN:'KIND',
  IA:'KDSM', KS:'KICT', KY:'KSDF', LA:'KMSY', ME:'KPWM',
  MD:'KBWI', MA:'KBOS', MI:'KDTW', MN:'KMSP', MS:'KJAN',
  MO:'KSTL', MT:'KBIL', NE:'KOMA', NV:'KLAS', NH:'KMHT',
  NJ:'KEWR', NM:'KABQ', NY:'KJFK', NC:'KCLT', ND:'KFAR',
  OH:'KCMH', OK:'KOKC', OR:'KPDX', PA:'KPHL', RI:'KPVD',
  SC:'KCAE', SD:'KFSD', TN:'KBNA', TX:'KDFW', UT:'KSLC',
  VT:'KBTV', VA:'KRIC', WA:'KSEA', WV:'KCRW', WI:'KMKE',
  WY:'KCYS',
};

// ── ASHRAE zone display labels ──────────────────────────────────────────────
// For UI display only. Source: ANSI/ASHRAE/IES Standard 169-2021.

window.ASHRAE_ZONE_LABELS = {
  '1A':'1A · Very Hot, Humid',
  '1B':'1B · Very Hot, Dry',
  '2A':'2A · Hot, Humid',
  '2B':'2B · Hot, Dry',
  '3A':'3A · Warm, Humid',
  '3B':'3B · Warm, Dry',
  '3C':'3C · Warm, Marine',
  '4A':'4A · Mixed, Humid',
  '4B':'4B · Mixed, Dry',
  '4C':'4C · Mixed, Marine',
  '5A':'5A · Cool, Humid',
  '5B':'5B · Cool, Dry',
  '5C':'5C · Cool, Marine',
  '6A':'6A · Cold, Humid',
  '6B':'6B · Cold, Dry',
  '7' :'7 · Very Cold',
  '8' :'8 · Subarctic',
};
