/* ════════════════════════════════════════════════════════
   LOCATION CHECK — data.js
   All API fetching functions.
   Called by core.js runCheckWithCoords().
   Results passed to renderResults() in results.js
   ════════════════════════════════════════════════════════ */


/* ── WEATHER ────────────────────────────────────────────
   Open-Meteo — free, pulls from ECMWF, GFS, UK Met Office
   Returns daily summary + full hourly data for 7 days
   ───────────────────────────────────────────────────── */
async function fetchWeather(lat, lon) {
  const url = [
    'https://api.open-meteo.com/v1/forecast',
    '?latitude=' + lat,
    '&longitude=' + lon,
    '&daily=weathercode,temperature_2m_max,temperature_2m_min,',
    'cloudcover_mean,precipitation_sum,windspeed_10m_max,',
    'windgusts_10m_max,winddirection_10m_dominant,',
    'precipitation_probability_max,uv_index_max,',
    'precipitation_hours,sunrise,sunset',
    '&hourly=temperature_2m,weathercode,cloudcover,',
    'windspeed_10m,windgusts_10m,winddirection_10m,',
    'precipitation_probability,visibility,relativehumidity_2m,',
    'apparent_temperature,surface_pressure,dewpoint_2m,',
    'uv_index,precipitation,snowfall,freezinglevel_height',
    '&timezone=Europe%2FLondon',
    '&forecast_days=7'
  ].join('');

  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather data unavailable — please try again');
  return res.json();
}


/* ── AIR QUALITY & POLLEN ───────────────────────────────
   Open-Meteo Air Quality API — free, no key required
   Returns pollen counts, AQI, PM2.5, NO2 etc
   ───────────────────────────────────────────────────── */
async function fetchAirQuality(lat, lon) {
  try {
    const url = [
      'https://air-quality-api.open-meteo.com/v1/air-quality',
      '?latitude=' + lat,
      '&longitude=' + lon,
      '&hourly=pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,',
      'ozone,alder_pollen,birch_pollen,grass_pollen,',
      'mugwort_pollen,olive_pollen,ragweed_pollen,',
      'european_aqi',
      '&timezone=Europe%2FLondon',
      '&forecast_days=3'
    ].join('');
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}


/* ── MARINE WEATHER ─────────────────────────────────────
   Open-Meteo Marine API — coastal locations only
   Returns wave height, swell direction, sea state
   ───────────────────────────────────────────────────── */
async function fetchMarineWeather(lat, lon) {
  try {
    const url = [
      'https://marine-api.open-meteo.com/v1/marine',
      '?latitude=' + lat,
      '&longitude=' + lon,
      '&hourly=wave_height,wave_direction,wave_period,',
      'wind_wave_height,swell_wave_height',
      '&timezone=Europe%2FLondon',
      '&forecast_days=3'
    ].join('');
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}


/* ── SUN & MOON ─────────────────────────────────────────
   Sunrise-sunset.org — free, no key required
   Returns all twilight times, sunrise, sunset, solar noon
   ───────────────────────────────────────────────────── */
async function fetchSun(lat, lon, date) {
  const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=${date}&formatted=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Sun data unavailable — please try again');
  const data = await res.json();
  if (data.status !== 'OK') throw new Error('Could not calculate sun times for this location');
  return data.results;
}


/* ── ELEVATION ──────────────────────────────────────────
   Open-Meteo elevation API — free, no key required
   Returns elevation in metres above sea level
   ───────────────────────────────────────────────────── */
async function fetchElevation(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.elevation ? data.elevation[0] : null;
  } catch (e) {
    return null;
  }
}


/* ── REVERSE GEOCODE ────────────────────────────────────
   Nominatim — free, no key required
   Returns structured address data for the coordinates
   ───────────────────────────────────────────────────── */
async function fetchAddress(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LocationCheckDOP/1.0' }
    });
    return res.json();
  } catch (e) {
    return {};
  }
}

/* ── LOCAL FEATURES CACHE + OVERPASS FALLBACK ─────────── */
const OVERPASS_MODE = 'full';
const FEATURE_CACHE_VERSION = 'v4-full-restored';
const FEATURE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FEATURE_CACHE_NEARBY_RADIUS_KM = 0.25; // reuse cached Overpass data within ~250m

const LAND_CONTEXT_CACHE_VERSION = 'v1';
const LAND_CONTEXT_CACHE_NEARBY_RADIUS_KM = 0.25; // reuse cached Overpass data within ~250m

function getFeatureCacheKey(lat, lon) {
  return `locationCheckFeatures:${FEATURE_CACHE_VERSION}:${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
}

function readFeatureCache(lat, lon) {
  const exactKey = getFeatureCacheKey(lat, lon);

  try {
    const cached = JSON.parse(localStorage.getItem(exactKey) || 'null');

    if (cached && Date.now() - cached.savedAt < FEATURE_CACHE_MAX_AGE_MS) {
      console.log('Using cached local features');
      return cached.value;
    }
  } catch (err) {
    console.warn('Feature cache read failed:', err);
  }

  // Fallback: reuse nearby cached Overpass results.
  // This avoids a fresh Overpass call when the user moves the pin/searches nearby.
  try {
    const prefix = `locationCheckFeatures:${FEATURE_CACHE_VERSION}:`;
    let best = null;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix) || key === exactKey) continue;

      const coordPart = key.slice(prefix.length);
      const [cachedLat, cachedLon] = coordPart.split(',').map(Number);

      if (!Number.isFinite(cachedLat) || !Number.isFinite(cachedLon)) continue;

      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (!cached || Date.now() - cached.savedAt >= FEATURE_CACHE_MAX_AGE_MS) continue;

      const dist = haversineDistance(lat, lon, cachedLat, cachedLon);

      if (dist <= FEATURE_CACHE_NEARBY_RADIUS_KM && (!best || dist < best.dist)) {
        best = { dist, value: cached.value };
      }
    }

    if (best) {
      console.log(`Using nearby cached local features (${Math.round(best.dist * 1000)}m away)`);
      return best.value;
    }
  } catch (err) {
    console.warn('Nearby feature cache lookup failed:', err);
  }

  return null;
}

function clearOldFeatureCache() {
  const prefix = `locationCheckFeatures:`;
  const keys = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) keys.push(key);
  }

  // Remove oldest / previous feature caches first
  keys.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('Could not remove old feature cache:', key, err);
    }
  });
}

function writeFeatureCache(lat, lon, value) {
  const key = getFeatureCacheKey(lat, lon);
  const payload = JSON.stringify({
    savedAt: Date.now(),
    value
  });

  try {
    console.log('Saving local features to cache');
    localStorage.setItem(key, payload);
  } catch (err) {
    console.warn('Feature cache write failed, clearing old feature cache and retrying:', err);

    try {
      clearOldFeatureCache();
      localStorage.setItem(key, payload);
      console.log('Saving local features to cache after cleanup');
    } catch (retryErr) {
      console.warn('Feature cache write failed after cleanup:', retryErr);
    }
  }
}

async function fetchOverpassWithFallback(query) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: 'data=' + encodeURIComponent(query)
      });

      if (!res.ok) {
        throw new Error(`Overpass ${res.status} from ${endpoint}`);
      }

      return await res.json();
    } catch (err) {
      console.warn('Overpass endpoint failed:', endpoint, err);
      lastError = err;
    }
  }

  throw lastError || new Error('Could not fetch local features.');
}

/* ── LOCAL FEATURES ─────────────────────────────────────
   OpenStreetMap Overpass API — free, no key required
   Scans for nearby features used by multiple sections
   ───────────────────────────────────────────────────── */
async function fetchFeatures(lat, lon) {
  const cached = readFeatureCache(lat, lon);
  if (cached) return cached;

  const query = OVERPASS_MODE === 'permissions' ? `
    [out:json][timeout:14];
    (
      way["railway"](around:800,${lat},${lon});
      node["railway"="station"](around:1500,${lat},${lon});

      node["amenity"="school"](around:1000,${lat},${lon});
      way["amenity"="school"](around:1000,${lat},${lon});
      node["amenity"="college"](around:1000,${lat},${lon});
      way["amenity"="college"](around:1000,${lat},${lon});
      node["amenity"="university"](around:1000,${lat},${lon});
      way["amenity"="university"](around:1000,${lat},${lon});
      node["amenity"="hospital"](around:1500,${lat},${lon});
      way["amenity"="hospital"](around:1500,${lat},${lon});
            node["amenity"="police"](around:1500,${lat},${lon});
      way["amenity"="police"](around:1500,${lat},${lon});

      node["amenity"="prison"](around:2000,${lat},${lon});
      way["amenity"="prison"](around:2000,${lat},${lon});

      node["aeroway"="helipad"](around:2000,${lat},${lon});
      way["aeroway"="helipad"](around:2000,${lat},${lon});

      way["landuse"="military"](around:3000,${lat},${lon});
      relation["landuse"="military"](around:3000,${lat},${lon});

      node["power"="plant"](around:3000,${lat},${lon});
      way["power"="plant"](around:3000,${lat},${lon});

      way["landuse"="industrial"](around:800,${lat},${lon});
      way["landuse"="commercial"](around:800,${lat},${lon});
      way["landuse"="retail"](around:800,${lat},${lon});

      way["leisure"="park"](around:800,${lat},${lon});
      way["leisure"="recreation_ground"](around:800,${lat},${lon});
      way["landuse"="recreation_ground"](around:800,${lat},${lon});
      way["leisure"="nature_reserve"](around:2000,${lat},${lon});

      way["natural"="coastline"](around:2000,${lat},${lon});
      way["natural"="beach"](around:2000,${lat},${lon});
      way["natural"="water"](around:1000,${lat},${lon});
      way["waterway"](around:1000,${lat},${lon});

      way["natural"="wood"](around:1000,${lat},${lon});
      way["natural"="heath"](around:1000,${lat},${lon});
      way["natural"="moor"](around:1000,${lat},${lon});
      way["landuse"="forest"](around:1000,${lat},${lon});
      way["landuse"="farmland"](around:1000,${lat},${lon});
      way["landuse"="meadow"](around:1000,${lat},${lon});

      way["boundary"="national_park"](around:5000,${lat},${lon});
      relation["boundary"="national_park"](around:5000,${lat},${lon});
      way["boundary"="protected_area"](around:3000,${lat},${lon});
      relation["boundary"="protected_area"](around:3000,${lat},${lon});
    );
    out body center;
  ` : `
    [out:json][timeout:25];
    (
      node["aeroway"="aerodrome"](around:15000,${lat},${lon});
way["aeroway"="aerodrome"](around:15000,${lat},${lon});
relation["aeroway"="aerodrome"](around:15000,${lat},${lon});

      node["aeroway"="terminal"](around:4000,${lat},${lon});
      way["aeroway"="terminal"](around:4000,${lat},${lon});
      relation["aeroway"="terminal"](around:4000,${lat},${lon});

      way["aeroway"="runway"](around:8000,${lat},${lon});
way["aeroway"="apron"](around:5000,${lat},${lon});

node["aeroway"="helipad"](around:6000,${lat},${lon});
way["aeroway"="helipad"](around:6000,${lat},${lon});
relation["aeroway"="helipad"](around:6000,${lat},${lon});

way["military"="airfield"](around:12000,${lat},${lon});
relation["military"="airfield"](around:12000,${lat},${lon});

      way["leisure"="stadium"](around:3000,${lat},${lon});
      relation["leisure"="stadium"](around:3000,${lat},${lon});
      way["building"="stadium"](around:3000,${lat},${lon});
      node["amenity"="events_venue"](around:2000,${lat},${lon});
      way["amenity"="events_venue"](around:2000,${lat},${lon});

      way["railway"="rail"](around:800,${lat},${lon});
      way["railway"="subway"](around:800,${lat},${lon});
      way["railway"="tram"](around:500,${lat},${lon});
      node["railway"="station"](around:1500,${lat},${lon});

      way["highway"="motorway"](around:1200,${lat},${lon});
      way["highway"="trunk"](around:1000,${lat},${lon});
      way["highway"="primary"](around:800,${lat},${lon});
      way["highway"="secondary"](around:600,${lat},${lon});
      way["highway"="tertiary"](around:500,${lat},${lon});
      way["highway"="residential"](around:300,${lat},${lon});
      way["highway"="unclassified"](around:300,${lat},${lon});
      way["highway"="service"](around:250,${lat},${lon});
      way["junction"="roundabout"](around:600,${lat},${lon});
      node["highway"="bus_stop"](around:400,${lat},${lon});
      node["amenity"="bus_station"](around:800,${lat},${lon});

      way["highway"="footway"](around:500,${lat},${lon});
      way["highway"="path"](around:500,${lat},${lon});
      way["highway"="bridleway"](around:500,${lat},${lon});

      node["amenity"="hospital"](around:2500,${lat},${lon});
      way["amenity"="hospital"](around:2500,${lat},${lon});
      node["amenity"="police"](around:2500,${lat},${lon});
      way["amenity"="police"](around:2500,${lat},${lon});
      node["amenity"="fire_station"](around:2500,${lat},${lon});
      way["amenity"="fire_station"](around:2500,${lat},${lon});

      node["amenity"="school"](around:1000,${lat},${lon});
      way["amenity"="school"](around:1000,${lat},${lon});
      node["amenity"="kindergarten"](around:800,${lat},${lon});
      way["amenity"="kindergarten"](around:800,${lat},${lon});
      node["leisure"="playground"](around:800,${lat},${lon});
      way["leisure"="playground"](around:800,${lat},${lon});

      way["landuse"="industrial"](around:800,${lat},${lon});
      way["landuse"="construction"](around:800,${lat},${lon});
      way["man_made"="works"](around:800,${lat},${lon});

      node["amenity"="pharmacy"](around:3000,${lat},${lon});
      node["amenity"="fuel"](around:5000,${lat},${lon});
      node["amenity"="supermarket"](around:3000,${lat},${lon});
      node["amenity"="cafe"](around:1000,${lat},${lon});
      node["amenity"="restaurant"](around:1000,${lat},${lon});
      node["amenity"="toilets"](around:1000,${lat},${lon});
      node["amenity"="parking"](around:1000,${lat},${lon});
      way["amenity"="parking"](around:1000,${lat},${lon});
      relation["amenity"="parking"](around:1000,${lat},${lon});

      node["amenity"="parking_space"](around:600,${lat},${lon});
      way["amenity"="parking_space"](around:600,${lat},${lon});

      node["amenity"="charging_station"](around:1200,${lat},${lon});
      way["amenity"="charging_station"](around:1200,${lat},${lon});

      node["amenity"="loading_dock"](around:600,${lat},${lon});
      way["amenity"="loading_dock"](around:600,${lat},${lon});

      way["parking:lane:both"](around:500,${lat},${lon});
      way["parking:lane:left"](around:500,${lat},${lon});
      way["parking:lane:right"](around:500,${lat},${lon});
      way["parking:condition:both"](around:500,${lat},${lon});
      way["parking:condition:left"](around:500,${lat},${lon});
      way["parking:condition:right"](around:500,${lat},${lon});

      node["power"="tower"](around:400,${lat},${lon});
      way["power"="line"](around:400,${lat},${lon});

      way["natural"="coastline"](around:8000,${lat},${lon});
way["natural"="beach"](around:5000,${lat},${lon});
      way["waterway"="river"](around:1000,${lat},${lon});
      way["waterway"="stream"](around:500,${lat},${lon});
      way["natural"="water"](around:500,${lat},${lon});
      node["natural"="peak"](around:5000,${lat},${lon});

way["boundary"="national_park"](around:10000,${lat},${lon});
relation["boundary"="national_park"](around:10000,${lat},${lon});
way["boundary"="protected_area"](around:6000,${lat},${lon});
relation["boundary"="protected_area"](around:6000,${lat},${lon});
way["leisure"="park"](around:800,${lat},${lon});
way["leisure"="nature_reserve"](around:6000,${lat},${lon});
    );
    out body center;
  `;

  const json = await fetchOverpassWithFallback(query);
  const elements = json.elements || [];

  writeFeatureCache(lat, lon, elements);

  return elements;
}


/* ── DISTANCE CALCULATIONS ──────────────────────────────
   Haversine formula — km between two lat/lon points
   ───────────────────────────────────────────────────── */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


/* ── FIND NEAREST FEATURE ───────────────────────────────
   Finds the closest feature of a given type
   ───────────────────────────────────────────────────── */
function findNearest(features, lat, lon, tagKey, tagValue) {
  const matches = features.filter(f =>
    f.tags && f.tags[tagKey] === tagValue && f.lat && f.lon
  );
  if (!matches.length) return null;
  return matches.reduce((nearest, f) => {
    const dist = haversineDistance(lat, lon, f.lat, f.lon);
    if (!nearest || dist < nearest.dist) return { ...f, dist };
    return nearest;
  }, null);
}


/* ── LIGHT POLLUTION ────────────────────────────────────
   Estimates Bortle scale from settlement type + OSM data
   1 = pristine dark sky, 9 = inner city
   ───────────────────────────────────────────────────── */
function estimateLightPollution(features, address) {
  const city = address?.address?.city;
  const town = address?.address?.town;
  const village = address?.address?.village;
  const suburb = address?.address?.suburb;

  let score = 4;
  if (city) score = 7;
  if (suburb) score = 6;
  if (town) score = 5;
  if (village) score = 3;

  const hasIndustrial = features.some(f => f.tags?.landuse === 'industrial');
  if (hasIndustrial) score = Math.min(9, score + 1);

  const isCoastal = features.some(f => f.tags?.natural === 'coastline');
  const hasPeak = features.some(f => f.tags?.natural === 'peak');
  if (isCoastal || hasPeak) score = Math.max(1, score - 1);

  const bortleLabels = {
    1: 'Pristine dark sky', 2: 'Truly dark sky', 3: 'Rural sky',
    4: 'Rural / suburban transition', 5: 'Suburban sky',
    6: 'Bright suburban sky', 7: 'Suburban / urban transition',
    8: 'City sky', 9: 'Inner city'
  };

  return {
    score, label: bortleLabels[score] || 'Unknown',
    good: score <= 3, ok: score <= 5,
  };
}
