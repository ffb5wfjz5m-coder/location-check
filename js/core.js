/* ════════════════════════════════════════════════════════
   LOCATION CHECK — core.js
   Foundation file — loads first, everything else depends on this.
   ════════════════════════════════════════════════════════ */

const API_KEYS = {
  google: 'AIzaSyAWSZCWIsayhp5qedWh3ZuPb7cRsLaCpXU'
};

const STATE = {
  units:    'met',
  viewMode: 'all',
  lat:      null,
  lon:      null,
  date:     null,
  location: null,
  placeInfo: null,
  selectedPlaceInfo: null,
  mapLat:   null,
  mapLon:   null,
};

/* ── GLOBAL LEAFLET ATTRIBUTION UX ──────────────────────*/
document.addEventListener('click', e => {
  const link = e.target.closest('.leaflet-control-attribution a');
  if (!link) return;

  e.preventDefault();
  window.open(link.href, '_blank', 'noopener,noreferrer');
});

/* ── INIT ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('shootDate').value = new Date().toISOString().split('T')[0];
  initSearchTabs();
  renderRecentLocations();
  loadGoogleMaps();
});

/* ── SEARCH TABS ──────────────────────────────────────── */
function initSearchTabs() {
  const tabs = document.querySelectorAll('.search-tab');
  const modes = document.querySelectorAll('.search-mode');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const activeTab = tab.dataset.tab;

      tabs.forEach(t => {
        t.classList.toggle('on', t.dataset.tab === activeTab);
      });

      modes.forEach(mode => {
        mode.style.display = mode.classList.contains('search-mode-' + activeTab) ? 'flex' : 'none';
      });

      clearError();
            
      if (activeTab === 'map') {
        setTimeout(initMapPicker, 50);
      }
    });
  });

  initCoordinatePaste();
}

let mapPickerMap = null;
let mapPickerMarker = null;
let mapPickerClickTimer = null;
let mapPickerStreetLayer = null;
let mapPickerSatelliteLayer = null;

function initMapPicker() {
  const mapEl = document.getElementById('mapPicker');
  const coordsEl = document.getElementById('mapCoords');

  if (!mapEl || typeof L === 'undefined') return;

  const startLat = STATE.lat || 54.5;
  const startLon = STATE.lon || -3.0;
  const startZoom = STATE.lat && STATE.lon ? 12 : 5;

  if (!mapPickerMap) {
    mapPickerMap = L.map('mapPicker', {
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true
    }).setView([startLat, startLon], startZoom);

    mapPickerStreetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(mapPickerMap);

mapPickerSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri'
});


        mapPickerMap.on('click', e => {
  clearTimeout(mapPickerClickTimer);

  mapPickerClickTimer = setTimeout(() => {
    setMapPickerLocation(e.latlng.lat, e.latlng.lng);
  }, 220);
});

mapPickerMap.on('dblclick', () => {
  clearTimeout(mapPickerClickTimer);
});
  }

  setTimeout(() => {
    mapPickerMap.invalidateSize();

    if (STATE.mapLat && STATE.mapLon) {
      mapPickerMap.setView([STATE.mapLat, STATE.mapLon], 14);
    }
  }, 100);
}

function setMapPickerLocation(lat, lon, zoomToLocation = false) {
  const coordsEl = document.getElementById('mapCoords');

  STATE.mapLat = lat;
  STATE.mapLon = lon;

  if (mapPickerMap) {
    if (zoomToLocation) {
      mapPickerMap.setView([lat, lon], 17);
    } else {
      mapPickerMap.panTo([lat, lon]);
    }

    if (mapPickerMarker) {
      mapPickerMarker.setLatLng([lat, lon]);
    } else {
      mapPickerMarker = L.marker([lat, lon], { draggable: true }).addTo(mapPickerMap);

mapPickerMarker.setZIndexOffset(1000);
mapPickerMarker.getElement()?.classList.add('marker-pop');

setTimeout(() => {
  mapPickerMarker.getElement()?.classList.remove('marker-pop');
}, 300);

      mapPickerMarker.on('dragend', e => {
        const pos = e.target.getLatLng();
        setMapPickerLocation(pos.lat, pos.lng);
      });
    }
  }

  if (coordsEl) {
    coordsEl.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    coordsEl.onclick = () => copyMapCoords();
  }

  clearError();
}

function copyMapCoords() {
  const coordsEl = document.getElementById('mapCoords');
  if (!coordsEl || STATE.mapLat === null || STATE.mapLon === null) return;

  const coords = `${STATE.mapLat.toFixed(5)}, ${STATE.mapLon.toFixed(5)}`;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(coords).then(() => {
      coordsEl.textContent = 'Copied coordinates';

      setTimeout(() => {
        coordsEl.textContent = coords;
      }, 900);
    });

    return;
  }

  const temp = document.createElement('textarea');
  temp.value = coords;
  document.body.appendChild(temp);
  temp.select();
  document.execCommand('copy');
  document.body.removeChild(temp);

  coordsEl.textContent = 'Copied coordinates';

  setTimeout(() => {
    coordsEl.textContent = coords;
  }, 900);
}

function setMapPickerType(type) {
  if (!mapPickerMap || !mapPickerStreetLayer || !mapPickerSatelliteLayer) return;

  if (type === 'satellite') {
    mapPickerMap.removeLayer(mapPickerStreetLayer);
    mapPickerSatelliteLayer.addTo(mapPickerMap);
  } else {
    mapPickerMap.removeLayer(mapPickerSatelliteLayer);
    mapPickerStreetLayer.addTo(mapPickerMap);
  }

  document.querySelectorAll('.map-type-btn').forEach(btn => {
    btn.classList.toggle('on', btn.textContent.trim().toLowerCase() === type);
  });
}

function useMyLocation() {
  if (!navigator.geolocation) {
    showError('Your browser does not support location detection.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      setMapPickerLocation(pos.coords.latitude, pos.coords.longitude, true);
    },
    () => {
      showError('Could not get your location. Please allow location access or click the map manually.');
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

function initCoordinatePaste() {
  const latInput = document.getElementById('latInput');
  const lonInput = document.getElementById('lonInput');

  if (!latInput || !lonInput) return;

  [latInput, lonInput].forEach(input => {
    input.addEventListener('paste', e => {
      const text = e.clipboardData?.getData('text')?.trim();
      if (!text) return;

      const match = text.match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
      if (!match) return;

      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);

      if (
        Number.isNaN(lat) ||
        Number.isNaN(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        return;
      }

      e.preventDefault();

      latInput.value = lat;
      lonInput.value = lon;
      clearError();
    });
  });
}

/* ── LOAD GOOGLE MAPS ─────────────────────────────────── */
function loadGoogleMaps() {
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEYS.google}&libraries=places&v=weekly&callback=initAutocomplete`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

/* ── AUTOCOMPLETE INIT ────────────────────────────────── */
window.initAutocomplete = function() {
  const input = document.getElementById('addr');

  const autocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'gb' },
    fields: ['geometry', 'formatted_address', 'name', 'place_id', 'types', 'website', 'formatted_phone_number'],
  });

  const placesService = new google.maps.places.PlacesService(document.createElement('div'));

  // Remove Google's border/background from the input

  autocomplete.addListener('place_changed', async () => {
    const place = autocomplete.getPlace();

    if (!place.geometry || !place.geometry.location) {
      showError('Could not find that location — please try a more specific address or postcode.');
      return;
    }

    STATE.lat = place.geometry.location.lat();
    STATE.lon = place.geometry.location.lng();
    STATE.location = place.formatted_address || place.name || input.value;

    STATE.placeInfo = {
      name: place.name || '',
      address: place.formatted_address || '',
      placeId: place.place_id || '',
      types: place.types || [],
      website: '',
      phone: ''
    };

    STATE.selectedPlaceInfo = { ...STATE.placeInfo };

    if (place.place_id) {
      try {
        const details = await fetchGooglePlaceDetails(placesService, place.place_id);

        STATE.placeInfo = {
          ...STATE.placeInfo,
          name: details.name || STATE.placeInfo.name,
          address: details.formatted_address || STATE.placeInfo.address,
          types: details.types || STATE.placeInfo.types,
          website: details.website || '',
          phone: details.formatted_phone_number || ''
        };

        STATE.selectedPlaceInfo = { ...STATE.placeInfo };
      } catch (err) {
        console.warn('Place details unavailable:', err);
      }
    }

    input.value = STATE.location;
    clearError();
  });

  input.addEventListener('input', () => {
    STATE.lat = null;
    STATE.lon = null;
    STATE.location = null;
    STATE.placeInfo = null;
    STATE.selectedPlaceInfo = null;
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runCheck();
    }
  });
};

/* ── MAP PIN LAND CONTEXT ─────────────────────────────── */
function getPinLandContext(lat, lon, features = [], address = {}, locationName = '') {
  const a = address?.address || {};

  const pointLat = Number(lat);
  const pointLon = Number(lon);

  const featurePoint = f => {
    if (f?.lat != null && f?.lon != null) return { lat: Number(f.lat), lon: Number(f.lon) };
    if (f?.center?.lat != null && f?.center?.lon != null) return { lat: Number(f.center.lat), lon: Number(f.center.lon) };
    return null;
  };

  const metresBetween = (aLat, aLon, bLat, bLon) => {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) *
      Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  const closeFeatures = features.filter(f => {
    const pt = featurePoint(f);
    if (!pt || !Number.isFinite(pointLat) || !Number.isFinite(pointLon)) return false;
    return metresBetween(pointLat, pointLon, pt.lat, pt.lon) <= 30;
  });

  const displayParts = String(address?.display_name || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  const addressName = address?.name || '';

  const hasCloseTag = (key, value) => closeFeatures.some(f => {
    const tagVal = String(f.tags?.[key] || '').toLowerCase();
    if (!tagVal) return false;
    return value ? tagVal === value : true;
  });

  const firstCloseNamed = (...tests) => {
    const match = closeFeatures.find(f =>
      f.tags?.name &&
      tests.some(test => test(f.tags || {}))
    );
    return match?.tags?.name || '';
  };

  const namedAddressPart = regex =>
    displayParts.find(p => regex.test(p)) || '';

  const exactAddressLooksLikePark =
    /park|recreation ground|common|gardens$/i.test(addressName) ||
    namedAddressPart(/\b(park|recreation ground|common|gardens)\b/i);

  const exactAddressLooksLikeIndustrial =
    /industrial estate|business park|trading estate|commercial park|enterprise park/i.test(addressName) ||
    namedAddressPart(/\b(industrial estate|business park|trading estate|commercial park|enterprise park)\b/i);

  const parkName =
    firstCloseNamed(
      t => t.leisure === 'park',
      t => t.leisure === 'recreation_ground',
      t => t.landuse === 'recreation_ground'
    ) ||
    (exactAddressLooksLikePark ? addressName || namedAddressPart(/\b(park|recreation ground|common|gardens)\b/i) : '');

  const industrialName =
    firstCloseNamed(
      t => t.landuse === 'industrial',
      t => t.landuse === 'commercial',
      t => t.landuse === 'retail'
    ) ||
    (exactAddressLooksLikeIndustrial ? addressName || namedAddressPart(/\b(industrial estate|business park|trading estate|commercial park|enterprise park)\b/i) : '');

  const educationName =
    firstCloseNamed(t => ['school', 'college', 'university'].includes(t.amenity)) ||
    (['school', 'college', 'university'].includes(String(a.amenity || '').toLowerCase()) ? addressName : '');

  const railName =
    firstCloseNamed(
      t => ['station', 'platform'].includes(t.railway),
      t => t.landuse === 'railway'
    ) ||
    (String(a.railway || '').toLowerCase() ? addressName : '');

  const waterName =
    firstCloseNamed(
      t => ['beach', 'water'].includes(t.natural),
      t => t.waterway
    ) ||
    (['beach', 'water'].includes(String(a.natural || '').toLowerCase()) ? addressName : '');

  const ruralName =
    firstCloseNamed(
      t => ['wood', 'heath', 'moor', 'grassland'].includes(t.natural),
      t => ['forest', 'farmland', 'meadow'].includes(t.landuse)
    ) ||
    (['wood', 'heath', 'moor', 'grassland'].includes(String(a.natural || '').toLowerCase()) ? addressName : '');

  const looksLikePark =
    Boolean(parkName) ||
    hasCloseTag('leisure', 'park') ||
    hasCloseTag('leisure', 'recreation_ground') ||
    hasCloseTag('landuse', 'recreation_ground');

  const looksLikeIndustrial =
    Boolean(industrialName) ||
    hasCloseTag('landuse', 'industrial') ||
    hasCloseTag('landuse', 'commercial') ||
    hasCloseTag('landuse', 'retail');

  const looksLikeSchool =
    Boolean(educationName) ||
    hasCloseTag('amenity', 'school') ||
    hasCloseTag('amenity', 'college') ||
    hasCloseTag('amenity', 'university');

  const looksLikeRail =
    Boolean(railName) ||
    hasCloseTag('railway', 'station') ||
    hasCloseTag('railway', 'platform') ||
    hasCloseTag('landuse', 'railway');

  const looksLikeCoastOrWater =
    Boolean(waterName) ||
    hasCloseTag('natural', 'coastline') ||
    hasCloseTag('natural', 'beach') ||
    hasCloseTag('natural', 'water') ||
    hasCloseTag('waterway');

  const looksLikeWoodlandOrRural =
    Boolean(ruralName) ||
    hasCloseTag('natural', 'wood') ||
    hasCloseTag('landuse', 'forest') ||
    hasCloseTag('landuse', 'farmland') ||
    hasCloseTag('landuse', 'meadow') ||
    hasCloseTag('natural', 'heath') ||
    hasCloseTag('natural', 'moor');

  if (looksLikePark) {
    return { isStrong: true, type: 'park', name: parkName || 'Park / managed open space' };
  }

  if (looksLikeIndustrial) {
    return { isStrong: true, type: 'industrial', name: industrialName || 'Industrial / commercial site' };
  }

  if (looksLikeSchool) {
    return { isStrong: true, type: 'education', name: educationName || 'Education site' };
  }

  if (looksLikeRail) {
    return { isStrong: true, type: 'rail', name: railName || 'Railway site' };
  }

  if (looksLikeCoastOrWater) {
    return { isStrong: true, type: 'coast-water', name: waterName || 'Water / coastal site' };
  }

  if (looksLikeWoodlandOrRural) {
    return { isStrong: true, type: 'rural', name: ruralName || 'Rural / natural land' };
  }

  return { isStrong: false, type: '', name: '' };
}

/* ── OSM LAND CONTEXT / POINT-IN-POLYGON ─────────────── */
function getLandContextCacheKey(lat, lon) {
  return `locationCheckLandContext:${LAND_CONTEXT_CACHE_VERSION}:${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
}

function readLandContextCache(lat, lon) {
  const exactKey = getLandContextCacheKey(lat, lon);

  try {
    const cached = JSON.parse(localStorage.getItem(exactKey) || 'null');

    if (cached && Date.now() - cached.savedAt < FEATURE_CACHE_MAX_AGE_MS) {
      console.log('Using cached land context');
      return cached.value;
    }
  } catch (err) {
    console.warn('Land context cache read failed:', err);
  }

  try {
    const prefix = `locationCheckLandContext:${LAND_CONTEXT_CACHE_VERSION}:`;
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

      if (dist <= LAND_CONTEXT_CACHE_NEARBY_RADIUS_KM && (!best || dist < best.dist)) {
        best = { dist, value: cached.value };
      }
    }

    if (best) {
      console.log(`Using nearby cached land context (${Math.round(best.dist * 1000)}m away)`);
      return best.value;
    }
  } catch (err) {
    console.warn('Nearby land context cache lookup failed:', err);
  }

  return null;
}

function writeLandContextCache(lat, lon, value) {
  const key = getLandContextCacheKey(lat, lon);

  try {
    localStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      value
    }));
  } catch (err) {
    console.warn('Land context cache write failed:', err);
  }
}

async function fetchOSMLandContext(lat, lon) {
  const cached = readLandContextCache(lat, lon);
  if (cached) return cached;
  const query = `
    [out:json][timeout:14];
        is_in(${lat},${lon})->.containingAreas;

    (
      area.containingAreas["leisure"~"^(park|recreation_ground|garden|nature_reserve)$"];
      area.containingAreas["landuse"~"^(industrial|commercial|retail|recreation_ground|forest|farmland|meadow|railway|residential|grass)$"];
      area.containingAreas["amenity"~"^(school|college|university|hospital)$"];
      area.containingAreas["natural"~"^(wood|water|beach|heath|moor|grassland|coastline)$"];

      way(around:80,${lat},${lon})["building"];
      relation(around:80,${lat},${lon})["building"];

      way(around:80,${lat},${lon})["railway"];
      way(around:40,${lat},${lon})["highway"];
    );
    out body center geom;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: query
    });

    if (!res.ok) throw new Error(`Overpass ${res.status}`);

    const json = await res.json();
    const elements = Array.isArray(json.elements) ? json.elements : [];

    const matches = elements
  .map(el => scoreOSMLandElement(el, lat, lon, {}))
  .filter(Boolean)
  .sort((a, b) => b.score - a.score);

console.log('OSM land context debug', {
  lat,
  lon,
  elementsReturned: elements.length,
  matchesReturned: matches.length,
  rawElements: elements.slice(0, 10),
  matches: matches.slice(0, 10)
});

const best = matches[0];

    if (!best) {
      return { isStrong: false, type: '', name: '' };
    }

        const value = {
      isStrong: true,
      type: best.type,
      name: best.name,
      confidence: best.confidence,
      source: 'osm_polygon',
      website: best.tags?.website || best.tags?.['contact:website'] || '',
      phone: best.tags?.phone || best.tags?.['contact:phone'] || '',
      operator: best.tags?.operator || '',
      tags: best.tags || {}
    };

    writeLandContextCache(lat, lon, value);

    return value;
  } catch (err) {
    console.warn('OSM land context unavailable:', err);
    return { isStrong: false, type: '', name: '' };
  }
}

function scoreOSMLandElement(el, lat, lon, address = {}) {
  const tags = el.tags || {};
  const geom = Array.isArray(el.geometry) ? el.geometry : [];
  const type = classifyOSMLandType(tags);

  if (!type) return null;

  const name = tags.name || fallbackLandName(type);

  const lineTypes = ['rail', 'road'];
  const areaTypes = ['building', 'education', 'healthcare', 'industrial', 'park', 'water', 'rural', 'residential'];

  let contains = el.type === 'area';
  let nearLine = false;

  // Important: OSM area geometry does not always return with first/last points
  // perfectly repeated, so treat area-like features with 3+ points as polygons.
  if (!contains && areaTypes.includes(type) && geom.length >= 3) {
    contains = pointInPolygon(lat, lon, geom);
  }

  if (lineTypes.includes(type) && geom.length >= 2) {
    const dist = distanceToPolylineMetres(lat, lon, geom);
    nearLine =
      (type === 'rail' && dist <= 12) ||
      (type === 'road' && dist <= 8);
  }

  if (!contains && !nearLine) return null;

  const baseScores = {
    rail: 100,
        building: 97,
    education: 95,
    healthcare: 92,
    industrial: 90,
    park: 84,
    water: 78,
    rural: 70,
    road: 62,
    residential: 45
  };

  return {
    type,
    name,
    tags,
    score: baseScores[type] || 30,
    confidence: contains ? 'High' : 'Medium'
  };
}

function classifyOSMLandType(tags = {}) {
  const leisure = String(tags.leisure || '').toLowerCase();
  const landuse = String(tags.landuse || '').toLowerCase();
  const amenity = String(tags.amenity || '').toLowerCase();
  const natural = String(tags.natural || '').toLowerCase();
  const railway = String(tags.railway || '').toLowerCase();
  const highway = String(tags.highway || '').toLowerCase();
  const building = String(tags.building || '').toLowerCase();

    if (building) return 'building';
  if (railway || landuse === 'railway') return 'rail';
  if (['school', 'college', 'university'].includes(amenity)) return 'education';
  if (amenity === 'hospital') return 'healthcare';
  if (['industrial', 'commercial', 'retail'].includes(landuse)) return 'industrial';
  if (['park', 'recreation_ground', 'garden', 'nature_reserve'].includes(leisure) || landuse === 'recreation_ground') return 'park';
  if (['water', 'beach', 'coastline'].includes(natural)) return 'water';
  if (['wood', 'heath', 'moor', 'grassland'].includes(natural) || ['forest', 'farmland', 'meadow'].includes(landuse)) return 'rural';
  if (highway) return 'road';
  if (landuse === 'residential') return 'residential';

  return '';
}

function fallbackLandName(type) {
  const labels = {
    rail: 'Railway land / infrastructure',
        building: 'Building / site',
    education: 'Education site',
    healthcare: 'Healthcare site',
    industrial: 'Industrial / commercial land',
    park: 'Park / managed open space',
    water: 'Water / coastal site',
    rural: 'Rural / natural land',
    road: 'Public highway / road',
    residential: 'Residential area'
  };

  return labels[type] || 'Land under pin';
}

function pointInPolygon(lat, lon, polygon) {
  let inside = false;
  const x = lon;
  const y = lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon;
    const yi = polygon[i].lat;
    const xj = polygon[j].lon;
    const yj = polygon[j].lat;

    const intersects =
      ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 0.0000001) + xi);

    if (intersects) inside = !inside;
  }

  return inside;
}

function distanceToPolylineMetres(lat, lon, geom) {
  let best = Infinity;

  for (let i = 0; i < geom.length - 1; i++) {
    const d = distanceToSegmentMetres(
      lat,
      lon,
      geom[i].lat,
      geom[i].lon,
      geom[i + 1].lat,
      geom[i + 1].lon
    );

    if (d < best) best = d;
  }

  return best;
}

function distanceToSegmentMetres(lat, lon, lat1, lon1, lat2, lon2) {
  const metresPerDegLat = 111320;
  const metresPerDegLon = 111320 * Math.cos(lat * Math.PI / 180);

  const px = lon * metresPerDegLon;
  const py = lat * metresPerDegLat;
  const ax = lon1 * metresPerDegLon;
  const ay = lat1 * metresPerDegLat;
  const bx = lon2 * metresPerDegLon;
  const by = lat2 * metresPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));

  const cx = ax + t * dx;
  const cy = ay + t * dy;

  return Math.hypot(px - cx, py - cy);
}

/* ── GOOGLE PLACE LOOKUP FOR RESULTS ──────────────────── */
async function fetchGooglePlaceInfoForLocation(lat, lon, locationName) {
  if (!window.google?.maps?.places) return null;

  const service = new google.maps.places.PlacesService(document.createElement('div'));
  const cleanName = String(locationName || '').trim();

  const badTypes = [
    'political',
    'locality',
    'sublocality',
    'sublocality_level_1',
    'sublocality_level_2',
    'postal_code',
    'route',
    'street_address'
  ];

  const isUsefulPlace = place => {
    const types = place?.types || [];
    const id = place?.place_id || place?.placeId;

    if (!id || !place?.name) return false;
    if (types.some(t => badTypes.includes(t))) return false;

    return true;
  };

  const textSearch = request => new Promise((resolve, reject) => {
    service.textSearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
        resolve(results);
      } else {
        reject(new Error(status || 'Text place not found'));
      }
    });
  });

  try {
    const results = await textSearch({
      query: cleanName,
      location: new google.maps.LatLng(lat, lon),
      radius: 500
    });

    const best = results.find(isUsefulPlace) || results[0];
    if (!best?.place_id) return null;

    const details = await fetchGooglePlaceDetails(service, best.place_id);

    return {
      name: details.name || best.name || '',
      address: details.formatted_address || best.formatted_address || '',
      placeId: best.place_id || '',
      types: details.types || best.types || [],
      website: details.website || '',
      phone: details.formatted_phone_number || ''
    };
  } catch (err) {
    console.warn('Google text place lookup unavailable:', err.message || err);
    return null;
  }
}

/* ── GOOGLE PLACE DETAILS ─────────────────────────────── */
function fetchGooglePlaceDetails(placesService, placeId) {
  return new Promise((resolve, reject) => {
    placesService.getDetails(
      {
        placeId,
        fields: ['name', 'formatted_address', 'types', 'website', 'formatted_phone_number']
      },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          resolve(place);
        } else {
          reject(new Error(status || 'Place details not found'));
        }
      }
    );
  });
}

/* ── GEOCODE FALLBACK ─────────────────────────────────── */
async function geocodeFallback(query) {
  return new Promise((resolve, reject) => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode(
      { address: query + ', UK', region: 'gb' },
      (results, status) => {
        if (status === 'OK' && results[0]) {
          resolve({
            lat:  results[0].geometry.location.lat(),
            lon:  results[0].geometry.location.lng(),
            name: results[0].formatted_address
          });
        } else {
          reject(new Error('Location not found — please try a more specific address or postcode'));
        }
      }
    );
  });
}

/* ── MAIN RUN FUNCTION ────────────────────────────────── */
async function runCheck() {
  const activeTab = document.querySelector('.search-tab.on')?.dataset.tab || 'address';
  const addr = document.getElementById('addr').value.trim();
  const date = document.getElementById('shootDate').value;

  if (!date) {
    showError('Please select a shoot date.');
    return;
  }

    if (activeTab === 'coords') {
    const lat = parseFloat(document.getElementById('latInput').value.trim());
    const lon = parseFloat(document.getElementById('lonInput').value.trim());

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      showError('Please enter valid latitude and longitude values.');
      return;
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      showError('Latitude must be between -90 and 90. Longitude must be between -180 and 180.');
      return;
    }

    await runCheckWithCoords(lat, lon, `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    return;
  }

  if (activeTab === 'map') {
    if (STATE.mapLat === null || STATE.mapLon === null) {
      showError('Please click the map to choose a location.');
      return;
    }

    await runCheckWithCoords(
      STATE.mapLat,
      STATE.mapLon,
      `${STATE.mapLat.toFixed(5)}, ${STATE.mapLon.toFixed(5)}`
    );
    return;
  }

  if (!addr) {
    showError('Please enter an address or postcode.');
    return;
  }

  if (!date) {
    showError('Please select a shoot date.');
    return;
  }

  clearError();
  setBusy(true);
  hideResults();

  try {
    // If user selected from autocomplete and the input still matches that selection, use it
    if (STATE.lat && STATE.lon && STATE.location && addr === STATE.location) {
      await runCheckWithCoords(STATE.lat, STATE.lon, STATE.location, STATE.selectedPlaceInfo || STATE.placeInfo);
      return;
    }

    setStatus('Looking up address...', 'geocoding');
    const result = await geocodeFallback(addr);

    STATE.lat = result.lat;
    STATE.lon = result.lon;
    STATE.location = result.name;

    await runCheckWithCoords(result.lat, result.lon, result.name, null);
  } catch (e) {
    showError(e.message || 'Address not found — please try a postcode or more specific location');
    setBusy(false);
  }
}

/* ── RUN WITH COORDS ──────────────────────────────────── */
async function runCheckWithCoords(lat, lon, locationName, placeInfo = null) {
  

  const date = document.getElementById('shootDate').value;
  if (!date) { showError('Please select a shoot date.'); return; }

  STATE.lat      = lat;
  STATE.lon      = lon;
  STATE.date     = date;
  STATE.location = locationName;
    STATE.placeInfo = placeInfo || STATE.selectedPlaceInfo || null;
  placeInfo = STATE.placeInfo;

  saveRecentLocation(lat, lon, locationName);

  clearError();
  setBusy(true);
  hideResults();

  try {
    setStatus('Fetching core data...', 'weather, sun, location');



const [weatherData, sunData, elevation, address] = await Promise.all([
  fetchWeather(lat, lon),
  fetchSun(lat, lon, date),
  fetchElevation(lat, lon),
  fetchAddress(lat, lon)
]);



setStatus('Scanning local features...', 'openstreetmap overpass');


const features = await fetchFeatures(lat, lon);


const enrichedLocationName = enrichLocationName(locationName, address);

const isPinSearch = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(String(locationName || '').trim());

let landContext = null;

if (isPinSearch) {
  setStatus('Checking land under pin...', 'openstreetmap polygons');
  landContext = await fetchOSMLandContext(lat, lon);
}

if ((!placeInfo || !placeInfo.name) && landContext?.isStrong) {
  placeInfo = {
    name: landContext.name || '',
    address: address?.display_name || '',
    placeId: '',
    types: landContext.type ? [landContext.type, 'land_context'] : ['land_context'],
    website: landContext.website || '',
    phone: landContext.phone || '',
    operator: landContext.operator || '',
    source: 'land_context'
  };
}

if ((!placeInfo || !placeInfo.name) && !isPinSearch) {
  placeInfo = await fetchGooglePlaceInfoForLocation(lat, lon, enrichedLocationName);
}

setStatus('Building your report...', 'almost there');



await renderResults({
  lat,
  lon,
  date,
  locationName: enrichedLocationName,
  weatherData,
  sunData,
  features,
  elevation,
  address,
  placeInfo
});




  } catch (e) {
    showError(e.message || 'Something went wrong — please try again.');
  } finally {
    setBusy(false);
  }
}

/* ── UNIT TOGGLE ──────────────────────────────────────── */
function setUnits(u) {
  if (typeof u === 'object') {
    localStorage.setItem('wx_units', JSON.stringify(u));

    if (typeof applyWeatherUnits === 'function') {
      applyWeatherUnits();
    }

    return;
  }

  STATE.units = u;

  ['met', 'imp'].forEach(x => {
    document.getElementById('u-' + x)?.classList.toggle('on', x === u);
  });
}

function setViewMode(mode) {
  STATE.viewMode = mode;

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.mode === mode);
  });

  if (typeof applyResultMode === 'function') {
    applyResultMode(mode);
  }
}

/* ── UNIT CONVERSIONS ─────────────────────────────────── */
function formatWind(kmh) {
  const v = kmh || 0;
  if (STATE.units === 'imp') return Math.round(v * 0.621) + ' mph';
  if (STATE.units === 'avn') return Math.round(v * 0.540) + ' kts';
  return Math.round(v) + ' km/h';
}
function formatTemp(c) {
  if (STATE.units === 'imp') return Math.round(c * 9/5 + 32) + '°F';
  return Math.round(c) + '°C';
}
function formatDist(km) {
  if (STATE.units === 'imp') return (km * 0.621).toFixed(1) + ' mi';
  return km.toFixed(1) + ' km';
}
function formatElev(m) {
  if (STATE.units !== 'met') return Math.round(m * 3.281) + ' ft';
  return Math.round(m) + ' m';
}
function formatVis(km) {
  if (STATE.units === 'imp') return Math.round(km * 0.621) + ' mi';
  return Math.round(km) + ' km';
}
function formatRain(mm) {
  if (STATE.units === 'imp') return ((mm || 0) * 0.0394).toFixed(2) + ' in';
  return (mm || 0).toFixed(1) + ' mm';
}
function beaufortNum(kmh) {
  const l = [2,6,12,20,29,38,50,62,75,89,103,118];
  for (let i = 0; i < l.length; i++) { if (kmh <= l[i]) return i; }
  return 12;
}
function beaufortLabel(kmh) {
  const labels = ['Calm','Light air','Light breeze','Gentle breeze','Moderate breeze',
    'Fresh breeze','Strong breeze','Near gale','Gale','Severe gale','Storm','Violent storm','Hurricane'];
  return labels[beaufortNum(kmh)] || 'Hurricane';
}

/* ── LOCATION NAME HELPERS ────────────────────────────── */
function enrichLocationName(locationName, address) {
  const isCoordsOnly = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(String(locationName || '').trim());

  if (!isCoordsOnly) return locationName;

  const a = address?.address || {};

  const parts = [
    address?.name,
    a.amenity,
    a.tourism,
    a.leisure,
    a.road,
    a.neighbourhood,
    a.suburb,
    a.city || a.town || a.village || a.hamlet,
    a.county
  ].filter(Boolean);

  return [...new Set(parts)].slice(0, 3).join(', ') || locationName;
}

/* ── SHARED UTILITIES ─────────────────────────────────── */
function compassDir(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}
function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
  });
}
function weatherCodeInfo(code, isNight = false) {
  let desc = 'Unknown';
  let icon = isNight ? '✨' : '☀️';

  if (code === 0) {
    desc = 'Clear';
    icon = isNight ? '✨' : '☀️';
  } else if (code === 1) {
    desc = 'Mostly clear';
    icon = isNight ? '✨' : '🌤️';
  } else if (code === 2) {
    desc = 'Partly cloudy';
    icon = isNight ? '✨☁️' : '🌤️';
  } else if (code === 3) {
    desc = 'Overcast';
    icon = '☁️';
  } else if (code === 45 || code === 48) {
    desc = 'Foggy';
    icon = '🌫️';
  } else if (code >= 51 && code <= 57) {
    desc = 'Drizzle';
    icon = '🌦️';
  } else if (code >= 61 && code <= 67) {
    desc = 'Rain';
    icon = '🌧️';
  } else if (code >= 71 && code <= 77) {
    desc = 'Snow';
    icon = '🌨️';
  } else if (code >= 80 && code <= 82) {
    desc = 'Showers';
    icon = '🌦️';
  } else if (code >= 85 && code <= 86) {
    desc = 'Snow showers';
    icon = '🌨️';
  } else if (code >= 95 && code <= 99) {
    desc = 'Thunderstorm';
    icon = '⛈️';
  }

  return { desc, icon };
}
function shortName(name) {
  return name.split(',').slice(0, 3).join(',').trim();
}
function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ── RECENT LOCATIONS ─────────────────────────────────── */
function saveRecentLocation(lat, lon, label) {
  const recent = JSON.parse(localStorage.getItem('locationCheckRecent') || '[]');
  const date = document.getElementById('shootDate')?.value || '';

  const item = {
    lat,
    lon,
    label: shortName(label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`),
    date
  };

  const filtered = recent.filter(r =>
    Math.abs(r.lat - lat) > 0.00001 || Math.abs(r.lon - lon) > 0.00001
  );

  filtered.unshift(item);

  localStorage.setItem('locationCheckRecent', JSON.stringify(filtered.slice(0, 5)));
  renderRecentLocations();
}

function updateRecentFade() {
  const scroll = document.querySelector('.recent-scroll');
  if (!scroll) return;

  const atStart = scroll.scrollLeft <= 2;
  const atEnd = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 2;

  scroll.classList.toggle('fade-left', !atStart);
  scroll.classList.toggle('fade-right', !atEnd);
}

function renderRecentLocations() {
  const box = document.getElementById('recentLocations');
  if (!box) return;

  const recent = JSON.parse(localStorage.getItem('locationCheckRecent') || '[]');

  if (!recent.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

    box.style.display = 'flex';
  box.innerHTML = `
    <span class="recent-label">Recent:</span>
    <div class="recent-scroll">
      ${recent.map(item => `
        <button class="recent-btn" type="button" data-lat="${item.lat}" data-lon="${item.lon}" data-label="${item.label}" data-date="${item.date || ''}">
          📍 ${item.label}
        </button>
      `).join('')}
    </div>
  `;

    requestAnimationFrame(updateRecentFade);

  const recentScroll = box.querySelector('.recent-scroll');
  if (recentScroll) {
    recentScroll.addEventListener('scroll', updateRecentFade, { passive: true });
  }

  box.querySelectorAll('.recent-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
  const lat = parseFloat(btn.dataset.lat);
  const lon = parseFloat(btn.dataset.lon);
  const label = btn.dataset.label;
const date = btn.dataset.date;

if (date) {
  document.getElementById('shootDate').value = date;
}

clearError();

await runCheckWithCoords(lat, lon, label);
});
  });
}

/* ── UI CONTROLS ──────────────────────────────────────── */
function setBusy(busy) {
  document.getElementById('runBtn').disabled = busy;
  document.getElementById('statusBar').classList.toggle('show', busy);
}
function setStatus(main, sub) {
  document.getElementById('statusMain').textContent = main;
  document.getElementById('statusSub').textContent  = sub || '';
}
function showError(msg) {
  const b = document.getElementById('errorBar');
  b.textContent = msg;
  b.classList.add('show');
}
function clearError() {
  document.getElementById('errorBar').classList.remove('show');
}
function showResults() {
  const el = document.getElementById('results');
  el.classList.add('show');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function hideResults() {
  const el = document.getElementById('results');
  el.classList.remove('show');
  el.innerHTML = '';
}
