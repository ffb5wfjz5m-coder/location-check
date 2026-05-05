/* ════════════════════════════════════════════════════════
   LOCATION CHECK — services.js
   Services & Emergency section.
   Emergency services, transport, food, tide tables.
   ════════════════════════════════════════════════════════ */

let _servicesMap = null;
let _servicesSatLayer = null;
let _servicesStreetLayer = null;
let _servicesLayerMode = 'street';
let _servicesGroups = {};
let _servicesMarkers = {};

async function buildServices(data) {
  const { lat, lon, features, address, weatherData } = data;

  const wrapper = document.createElement('div');
  wrapper.appendChild(sectionHead('Services & Emergency'));

  const card = document.createElement('div');
  card.className = 'card g1';

  // TEMP: Police API disabled (CORS + rate limit issues)
let crimeData = null;

  // Fetch wider emergency services separately so nearest services still show even if outside main map data
  const emergencyData = features
  .map(el => ({
    ...el,
    lat: el.lat || el.center?.lat,
    lon: el.lon || el.center?.lon,
    tags: el.tags || {}
  }))
  .filter(f =>
    f.lat &&
    f.lon &&
    (
      ['hospital', 'police', 'fire_station', 'ambulance_station'].includes(f.tags?.amenity) ||
      ['ambulance_station', 'mountain_rescue', 'coast_guard', 'lifeboat_station', 'water_rescue_station', 'rescue_station', 'lifeguard'].includes(f.tags?.emergency)
    )
  );

    // Reuse existing Overpass features, but categorise them for the services map/list
const servicesMapData = limitServiceMapItems(
  features
    .map(el => ({
      ...el,
      lat: el.lat || el.center?.lat,
      lon: el.lon || el.center?.lon,
      tags: el.tags || {}
    }))
    .filter(f => f.lat && f.lon)
    .map(f => {
      const category = getServiceMapCategory(f);
      return category ? {
        ...f,
        ...category,
        dist: haversineDistance(lat, lon, f.lat, f.lon)
      } : null;
    })
    .filter(Boolean)
).map((item, index) => ({
  ...item,
  serviceMapId: `svc-${index}`
}));

  

  // Check if coastal for tide tables
  const coastFeature = features.some(f =>
    f.tags?.natural === 'coastline' || f.tags?.natural === 'beach'
  );
  const coastDist = getCoastDistance(features, lat, lon);
  const showTides = coastDist !== null && coastDist < 80; // 50 miles ≈ 80km

  card.innerHTML = `
    <div class="card-head">
      <span class="card-label">Production services & emergency</span>
      <span class="card-badge b-neu">Live data</span>
    </div>
    <div class="card-body">
      ${buildEmergencyServices(emergencyData, lat, lon, features, address)}
      ${buildServicesMap(lat, lon, features)}
${buildFoodAndAmenities(servicesMapData, lat, lon)}
${buildTravelAccommodationTools(lat, lon)}
${buildDriveTimes(lat, lon)}
    </div>`;

  wrapper.appendChild(card);

  // Init services map after render
  setTimeout(() => initServicesMap({ ...data, features: servicesMapData }), 1000);

  return wrapper;
}

function formatServiceDist(km) {
  if (km === null || km === undefined || !Number.isFinite(km)) return '—';

  const miles = km * 0.621371;

  if (miles < 0.1) {
    const metres = Math.round(km * 1000);
    const feet = Math.round(metres * 3.28084);
    return `${metres} m / ${feet} ft`;
  }

  if (miles < 10) {
    return `${Math.round(miles * 10) / 10} miles`;
  }

  return `${Math.round(miles)} miles`;
}

function getCoastDistance(features, lat, lon) {
  let minDist = null;

  features.forEach(f => {
    if (f.tags?.natural === 'coastline' || f.tags?.natural === 'beach') {
      const pts = [];
      if (f.lat && f.lon) pts.push({ lat: f.lat, lon: f.lon });
      if (f.geometry) f.geometry.forEach(p => pts.push(p));

      pts.forEach(p => {
        const d = haversineDistance(lat, lon, p.lat, p.lon);
        if (minDist === null || d < minDist) minDist = d;
      });
    }
  });

  return minDist;
}





function hasEmergencyDepartment(f) {
  const tags = f.tags || {};
  const name = (tags.name || '').toLowerCase();

  return (
    tags.emergency === 'yes' ||
    tags.emergency === 'department' ||
    tags['healthcare:speciality'] === 'emergency' ||
    tags['healthcare:speciality']?.includes?.('emergency') ||
    tags['emergency_service'] === 'yes' ||
    name.includes('accident') ||
    name.includes('a&e') ||
    name.includes('emergency department') ||
    name.includes('urgent and emergency')
  );
}

function isRemoteTerrain(features, lat, lon, showCoast) {
  const nearbyBuilt = features.filter(f =>
    (f.tags?.building || f.tags?.landuse === 'residential') &&
    f.lat && f.lon &&
    haversineDistance(lat, lon, f.lat, f.lon) < 2000
  );

  const nearNatural = features.some(f =>
  (f.tags?.natural === 'peak' ||
   f.tags?.natural === 'ridge' ||
   f.tags?.natural === 'moor' ||
   f.tags?.natural === 'heath' ||
   f.tags?.natural === 'fell') &&
    f.lat && f.lon &&
    haversineDistance(lat, lon, f.lat, f.lon) < 5000
  );

  const hasPeaks = features.some(f =>
  (f.tags?.natural === 'peak' ||
   f.tags?.natural === 'ridge') &&
  f.lat && f.lon &&
  haversineDistance(lat, lon, f.lat, f.lon) < 8000
);

const isVeryRemote = nearbyBuilt.length === 0;

return hasPeaks || (
  features.some(f =>
    (f.tags?.natural === 'moor' ||
     f.tags?.natural === 'fell') &&
    f.lat && f.lon &&
    haversineDistance(lat, lon, f.lat, f.lon) < 8000
  )
);
}

function isLikelyHospital(f) {
  return f.tags?.amenity === 'hospital' || f.tags?.healthcare === 'hospital';
}

function buildRescueGuidance(lat, lon, features, address) {
  return `
    <div class="emergency-guidance">
      <div class="rescue-note">
        <div class="rn-row">
          <span class="rn-icon">⚠️</span>
          <span class="rn-line">For coastal or mountain rescue, call <strong>999</strong> and ask for <strong>Coastguard or Mountain Rescue</strong>.</span>
        </div>
        <div class="rn-row">
          <span class="rn-icon">⚠️</span>
          <span class="rn-line">If signal is poor, try <strong>112</strong>.</span>
        </div>
      </div>



            <details class="emergency-details emergency-guide-box">
  <summary>
    <span class="eg-summary-left">
      <span class="eg-summary-icon">⚠️</span>
      <span>What to do in an emergency</span>
    </span>
    <span class="eg-toggle">+</span>
  </summary>

  <div class="emergency-guide">
    <div class="eg-list">
      <div class="eg-step">
        <span class="eg-num">1</span>
        <div>
          <strong>Make the situation safe if possible, then call 999.</strong>
          <p>Check for immediate dangers such as traffic, water, cliffs, machinery, fire, weather or unstable ground. Do not put yourself at risk.</p>
        </div>
      </div>

      <div class="eg-step">
        <span class="eg-num">2</span>
        <div>
          <strong>If signal is poor, try 112.</strong>
          <p>Move to higher ground or an open area if safe. If needed, send someone else to find signal.</p>
        </div>
      </div>

      <div class="eg-step">
        <span class="eg-num">3</span>
        <div>
          <strong>Share your location and explain the situation clearly.</strong>
          <p>Use What3Words, GPS coordinates, landmarks, road names or access points. Explain what happened, how many people are involved, and any injuries.</p>
        </div>
      </div>

      <div class="eg-step">
        <span class="eg-num">4</span>
        <div>
          <strong>Stay where you are if safe.</strong>
          <p>Keep the casualty warm, visible and protected. Avoid moving them unless necessary.</p>
        </div>
      </div>

      <div class="eg-step">
        <span class="eg-num">5</span>
        <div>
          <strong>Prepare for emergency services.</strong>
          <p>Send someone to meet them at the nearest road, gate, car park or access point if possible.</p>
        </div>
      </div>

      <div class="eg-step">
        <span class="eg-num">6</span>
        <div>
          <strong>Keep your phone available.</strong>
          <p>Stay reachable and keep your line free for call-backs.</p>
        </div>
      </div>
    </div>
  </div>
</details>
    </div>`;
}

/* ── EMERGENCY SERVICES ─────────────────────────────────*/

async function fetchEmergencyServicesData(lat, lon) {
  const radius = 40000; // 40km / approx 25 miles

  const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"hospital|police|fire_station|ambulance_station"](around:${radius},${lat},${lon});
      way["amenity"~"hospital|police|fire_station|ambulance_station"](around:${radius},${lat},${lon});
      relation["amenity"~"hospital|police|fire_station|ambulance_station"](around:${radius},${lat},${lon});

      node["emergency"~"ambulance_station|mountain_rescue|coast_guard|lifeboat_station|water_rescue_station|rescue_station|lifeguard"](around:${radius},${lat},${lon});
      way["emergency"~"ambulance_station|mountain_rescue|coast_guard|lifeboat_station|water_rescue_station|rescue_station|lifeguard"](around:${radius},${lat},${lon});
      relation["emergency"~"ambulance_station|mountain_rescue|coast_guard|lifeboat_station|water_rescue_station|rescue_station|lifeguard"](around:${radius},${lat},${lon});
    );
    out center tags;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    });

    if (!res.ok) return [];

    const data = await res.json();

    return (data.elements || [])
      .map(el => ({
        ...el,
        lat: el.lat || el.center?.lat,
        lon: el.lon || el.center?.lon,
        tags: el.tags || {}
      }))
      .filter(f => f.lat && f.lon);
  } catch (e) {
    return [];
  }
}

function buildEmergencyServices(features, lat, lon, baseFeatures, address) {
  const hospitalCandidates = features
    .filter(f => isLikelyHospital(f) && f.lat && f.lon)
    .map(f => ({
      ...f,
      dist: haversineDistance(lat, lon, f.lat, f.lon),
      hasAE: hasEmergencyDepartment(f)
    }))
    .sort((a, b) => a.dist - b.dist);

  const aeHospitals = hospitalCandidates.filter(h => h.hasAE);
  const hospitals = aeHospitals.length
  ? aeHospitals.slice(0, 3)
  : hospitalCandidates.slice(0, 2);



  const police = features.filter(f => f.tags?.amenity === 'police' && f.lat && f.lon)
    .map(f => ({ ...f, dist: haversineDistance(lat, lon, f.lat, f.lon) }))
    .sort((a,b) => a.dist - b.dist).slice(0, 1);

  const fire = features.filter(f => f.tags?.amenity === 'fire_station' && f.lat && f.lon)
    .map(f => ({ ...f, dist: haversineDistance(lat, lon, f.lat, f.lon) }))
    .sort((a,b) => a.dist - b.dist).slice(0, 1);

  const hospitalRows = hospitals.map(h => `
    <div class="service-item">
      <span class="si-icon">🏥</span>
      <div class="si-info">
        <div class="si-name">${h.tags?.name || 'Hospital'}</div>
        <div class="si-dist">
          ${formatServiceDist(h.dist)} away · ${h.hasAE ? 'A&E / Emergency department likely' : 'No confirmed A&E — check before relying on this location'}
        </div>
      </div>
      <a class="si-link" href="https://maps.google.com/maps?q=${h.lat},${h.lon}" target="_blank">Directions ↗</a>
    </div>`).join('') || '<div class="si-none" style="font-size:0.9rem; opacity:0.8;">No hospitals found in current map data — use NHS A&E finder below</div>';

  const policeRow = police.map(p => `
    <div class="service-item">
      <span class="si-icon">🚔</span>
      <div class="si-info">
        <div class="si-name">${p.tags?.name || 'Police Station'}</div>
        <div class="si-dist">${formatServiceDist(p.dist)} away</div>
      </div>
      <a class="si-link" href="https://maps.google.com/maps?q=${p.lat},${p.lon}" target="_blank">Directions ↗</a>
    </div>`).join('') || '<div class="si-none">No police station found in current map data</div>';



  const fireRow = fire.map(f => `
    <div class="service-item">
      <span class="si-icon">🚒</span>
      <div class="si-info">
        <div class="si-name">${f.tags?.name || 'Fire Station'}</div>
        <div class="si-dist">${formatServiceDist(f.dist)} away</div>
      </div>
      <a class="si-link" href="https://maps.google.com/maps?q=${f.lat},${f.lon}" target="_blank">Directions ↗</a>
    </div>`).join('') || '<div class="si-none">No fire station found in current map data</div>';

  return `
    <div class="emergency-services">
      <div class="card-label" style="margin-bottom:0.5rem">Emergency services</div>
      <div class="emergency-warn">🚨 In an emergency always call 999</div>
      ${hospitalRows}
      ${policeRow}
      ${fireRow}
      ${buildWhat3WordsEmergency(lat, lon)}
      ${buildRescueGuidance(lat, lon, baseFeatures, address)}
      ${buildEmergencyQuickLinks()}
    </div>`;
}

async function fetchServicesMapData(lat, lon) {
  const radius = 5000; // 5km / approx 3 miles

  const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"hospital|police|fire_station|pharmacy|fuel|supermarket|cafe|restaurant|toilets|parking|charging_station"](around:${radius},${lat},${lon});
      way["amenity"~"hospital|police|fire_station|pharmacy|fuel|supermarket|cafe|restaurant|toilets|parking|charging_station"](around:${radius},${lat},${lon});
      relation["amenity"~"hospital|police|fire_station|pharmacy|fuel|supermarket|cafe|restaurant|toilets|parking|charging_station"](around:${radius},${lat},${lon});

      node["railway"="station"](around:${radius},${lat},${lon});
      way["railway"="station"](around:${radius},${lat},${lon});
      relation["railway"="station"](around:${radius},${lat},${lon});

      node["tourism"="hotel"](around:${radius},${lat},${lon});
      way["tourism"="hotel"](around:${radius},${lat},${lon});
      relation["tourism"="hotel"](around:${radius},${lat},${lon});

      node["shop"~"hardware|supermarket|convenience"](around:${radius},${lat},${lon});
      way["shop"~"hardware|supermarket|convenience"](around:${radius},${lat},${lon});
      relation["shop"~"hardware|supermarket|convenience"](around:${radius},${lat},${lon});

      node["aeroway"~"aerodrome|airport"](around:${radius},${lat},${lon});
      way["aeroway"~"aerodrome|airport"](around:${radius},${lat},${lon});
      relation["aeroway"~"aerodrome|airport"](around:${radius},${lat},${lon});

      node["amenity"="ferry_terminal"](around:${radius},${lat},${lon});
      way["amenity"="ferry_terminal"](around:${radius},${lat},${lon});
      relation["amenity"="ferry_terminal"](around:${radius},${lat},${lon});

      node["harbour"="yes"](around:${radius},${lat},${lon});
      way["harbour"="yes"](around:${radius},${lat},${lon});
      relation["harbour"="yes"](around:${radius},${lat},${lon});

      node["leisure"="marina"](around:${radius},${lat},${lon});
      way["leisure"="marina"](around:${radius},${lat},${lon});
      relation["leisure"="marina"](around:${radius},${lat},${lon});
    );
    out center tags;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    });

    if (!res.ok) return [];

    const data = await res.json();

    const items = (data.elements || [])
      .map(el => ({
        ...el,
        lat: el.lat || el.center?.lat,
        lon: el.lon || el.center?.lon,
        tags: el.tags || {}
      }))
      .filter(f => f.lat && f.lon)
      .map(f => {
        const category = getServiceMapCategory(f);
        return category ? {
          ...f,
          ...category,
          dist: haversineDistance(lat, lon, f.lat, f.lon)
        } : null;
      })
      .filter(Boolean);

    return limitServiceMapItems(items).map((item, index) => ({
      ...item,
      serviceMapId: `svc-${index}`
    }));
  } catch (e) {
    return [];
  }
}

function getServiceMapCategory(f) {
  const tags = f.tags || {};

  if (tags.amenity === 'hospital' || tags.healthcare === 'hospital') {
    return { serviceCategory: 'hospital', serviceIcon: '🏥', serviceLabel: 'Hospital' };
  }

  if (tags.amenity === 'police') {
    return { serviceCategory: 'police', serviceIcon: '🚔', serviceLabel: 'Police' };
  }

  if (tags.amenity === 'fire_station') {
    return { serviceCategory: 'fire', serviceIcon: '🚒', serviceLabel: 'Fire station' };
  }

  if (tags.amenity === 'pharmacy') {
    return { serviceCategory: 'pharmacy', serviceIcon: '💊', serviceLabel: 'Pharmacy' };
  }

  if (tags.amenity === 'fuel') {
    return { serviceCategory: 'fuel', serviceIcon: '⛽', serviceLabel: 'Fuel' };
  }

  if (tags.amenity === 'supermarket' || tags.shop === 'supermarket' || tags.shop === 'convenience') {
  return { serviceCategory: 'supermarket', serviceIcon: '🛒', serviceLabel: tags.shop === 'convenience' ? 'Convenience store' : 'Supermarket' };
}

  if (tags.amenity === 'cafe') {
    return { serviceCategory: 'cafe', serviceIcon: '☕', serviceLabel: 'Cafe' };
  }

  if (tags.amenity === 'restaurant') {
    return { serviceCategory: 'restaurant', serviceIcon: '🍽', serviceLabel: 'Restaurant' };
  }

  if (tags.amenity === 'toilets') {
    return { serviceCategory: 'toilets', serviceIcon: '🚽', serviceLabel: 'Public toilets' };
  }

  if (tags.amenity === 'parking') {
    return { serviceCategory: 'parking', serviceIcon: '🅿️', serviceLabel: 'Parking' };
  }

  if (tags.amenity === 'charging_station') {
    return { serviceCategory: 'ev', serviceIcon: '⚡', serviceLabel: 'EV charging' };
  }

  if (tags.railway === 'station') {
    return { serviceCategory: 'station', serviceIcon: '🚂', serviceLabel: 'Train station' };
  }

  if (tags.tourism === 'hotel') {
    return { serviceCategory: 'hotel', serviceIcon: '🏨', serviceLabel: 'Hotel' };
  }

  if (tags.shop === 'hardware') {
    return { serviceCategory: 'hardware', serviceIcon: '🛠️', serviceLabel: 'Hardware store', serviceGroup: 'logistics' };
  }

  if (tags.aeroway === 'aerodrome' || tags.aeroway === 'airport') {
    return { serviceCategory: 'airport', serviceIcon: '✈️', serviceLabel: 'Airport / airfield', serviceGroup: 'travel' };
  }

  if (tags.amenity === 'ferry_terminal') {
    return { serviceCategory: 'ferry', serviceIcon: '⛴️', serviceLabel: 'Ferry terminal', serviceGroup: 'travel' };
  }

  if (tags.harbour === 'yes' || tags.leisure === 'marina') {
    return { serviceCategory: 'harbour', serviceIcon: '⚓', serviceLabel: 'Harbour / marina', serviceGroup: 'travel' };
  }

  return null;
}

function limitServiceMapItems(items) {
  const limits = {
    hospital: 3,
    police: 2,
    fire: 2,
    pharmacy: 4,
    fuel: 4,
    supermarket: 5,
    cafe: 8,
    restaurant: 8,
    toilets: 5,
    parking: 8,
    ev: 5,
    station: 4,
    hotel: 5,
    hardware: 3,
    airport: 3,
    ferry: 3,
    harbour: 3
  };

  const grouped = {};

  items.forEach(item => {
    if (!grouped[item.serviceCategory]) grouped[item.serviceCategory] = [];
    grouped[item.serviceCategory].push(item);
  });

  return Object.entries(grouped).flatMap(([category, categoryItems]) => {
    return categoryItems
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limits[category] || 5);
  });
}

/* ── SERVICES MAP ───────────────────────────────────────*/
function buildServicesMap(lat, lon, features) {
  return `
    <div class="map-card services-map-card">
      <div class="map-card-head">
        <span class="card-label">Services map</span>
        <span class="card-badge data-source">OSM data</span>
      </div>

      <div class="map-frame services-map-frame">
        <div id="services-map"></div>
      </div>

      <div class="map-legend services-map-legend">
        <span>🏥 Hospital</span>
        <span>🚔 Police</span>
        <span>🚒 Fire</span>
        <span>💊 Pharmacy</span>
        <span>🚂 Train</span>
        <span>✈️ Airport</span>
        <span>⛴️ Ferry</span>
        <span>⚓ Harbour</span>
        <span>🚽 Toilets</span>
        <span>☕ Cafe</span>
        <span>🍽 Food</span>
        <span>🛒 Groceries</span>
        <span>⛽ Fuel</span>
        <span>⚡ EV</span>
        <span>🅿️ Parking</span>
        <span>🏨 Hotel</span>
        <span>🛠️ Hardware</span>
      </div>

      <div class="map-controls services-map-controls">
        <button class="map-ctrl-btn" id="services-ctrl-satellite" onclick="setServicesMapLayer('satellite')">Satellite</button>
        <button class="map-ctrl-btn active" id="services-ctrl-street" onclick="setServicesMapLayer('street')">Standard</button>
        <div class="map-ctrl-sep"></div>
        <button class="map-ctrl-btn active" id="services-ctrl-emergency" onclick="toggleServicesGroup('emergency')">Emergency</button>
        <button class="map-ctrl-btn active" id="services-ctrl-food" onclick="toggleServicesGroup('food')">Food</button>
        <button class="map-ctrl-btn active" id="services-ctrl-logistics" onclick="toggleServicesGroup('logistics')">Logistics</button>
        <button class="map-ctrl-btn active" id="services-ctrl-travel" onclick="toggleServicesGroup('travel')">Travel</button>
        <button class="map-ctrl-btn active" id="services-ctrl-toilets" onclick="toggleServicesGroup('toilets')">Toilets</button>
      </div>

      <div class="info-note">
        Nearby services are based on OpenStreetMap features available around the selected location. Always verify opening times, access and suitability before relying on them.
      </div>
    </div>`;
}

function getServicesGroupForCategory(category) {
  if (['hospital', 'police', 'fire', 'pharmacy'].includes(category)) return 'emergency';
  if (['cafe', 'restaurant', 'supermarket'].includes(category)) return 'food';
  if (['fuel', 'parking', 'ev', 'hardware'].includes(category)) return 'logistics';
  if (['station', 'hotel', 'airport', 'ferry', 'harbour'].includes(category)) return 'travel';
  if (category === 'toilets') return 'toilets';
  return 'other';
}

function buildServicePopup(f, originLat, originLon) {
  const tags = f.tags || {};
  const name = tags.name || f.serviceLabel || 'Service';
  const dist = typeof f.dist === 'number' ? formatServiceDist(f.dist) : '';
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLon}&destination=${f.lat},${f.lon}`;
  

  const website = tags.website || tags['contact:website'] || '';
  const phone = tags.phone || tags['contact:phone'] || '';
  const opening = tags.opening_hours || '';

  const addressParts = [
    tags['addr:housename'],
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:postcode']
  ].filter(Boolean);

  const address = addressParts.join(', ');

  return `
    <div class="service-popup">
      <strong>${name}</strong>
      <div class="service-popup-type">${f.serviceLabel}${dist ? ` · ${dist}` : ''}</div>
      ${address ? `<div class="service-popup-detail">${address}</div>` : ''}
      ${opening ? `<div class="service-popup-detail"><strong>Hours:</strong> ${opening}</div>` : ''}
      ${phone ? `<div class="service-popup-detail"><strong>Phone:</strong> ${phone}</div>` : ''}

      <div class="service-popup-links">
        <a href="${directionsUrl}" target="_blank">Directions ↗</a>
        ${website ? `<a href="${website}" target="_blank">Website ↗</a>` : ''}
        ${phone ? `<a href="tel:${phone}">Call ↗</a>` : ''}
      </div>
    </div>
  `;
}

function initServicesMap(data) {
  const { lat, lon, features } = data;
  const mapEl = document.getElementById('services-map');
  if (!mapEl || !window.L) return;

  if (_servicesMap) {
    _servicesMap.off();
    _servicesMap.remove();
    _servicesMap = null;
  }

  _servicesGroups = {};
  _servicesMarkers = {};
  _servicesLayerMode = 'street';

  _servicesMap = L.map('services-map', {
    center: [lat, lon],
    zoom: 14,
    zoomControl: true,
    scrollWheelZoom: false
  });

  _servicesSatLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri World Imagery', maxZoom: 19 }
  );

  _servicesStreetLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap', maxZoom: 19 }
  ).addTo(_servicesMap);

  L.circleMarker([lat, lon], {
    radius: 8,
    fillColor: '#111110',
    fillOpacity: 1,
    color: '#ffffff',
    weight: 2
  }).bindTooltip('📍 Location').addTo(_servicesMap);

  ['emergency', 'food', 'logistics', 'travel', 'toilets', 'other'].forEach(group => {
    _servicesGroups[group] = {
      visible: true,
      layer: L.layerGroup().addTo(_servicesMap)
    };
  });

  features.forEach(f => {
    if (!f.lat || !f.lon || !f.serviceIcon) return;

    const group = getServicesGroupForCategory(f.serviceCategory);
    const targetLayer = _servicesGroups[group]?.layer || _servicesGroups.other.layer;

    const icon = L.divIcon({
      className: '',
      html: `<div class="service-map-pin">${f.serviceIcon}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14]
    });

    const name = f.tags?.name || f.serviceLabel || 'Service';
    const dist = typeof f.dist === 'number' ? ` · ${formatServiceDist(f.dist)}` : '';

    const marker = L.marker([f.lat, f.lon], { icon })
      .bindTooltip(`${name}${dist}`)
      .bindPopup(buildServicePopup(f, lat, lon))
      .addTo(targetLayer);

    if (f.serviceMapId) {
      _servicesMarkers[f.serviceMapId] = marker;
    }
  });
}

function setServicesMapLayer(type) {
  if (!_servicesMap) return;

  _servicesLayerMode = type;

  document.getElementById('services-ctrl-satellite')?.classList.toggle('active', type === 'satellite');
  document.getElementById('services-ctrl-street')?.classList.toggle('active', type === 'street');

  if (type === 'satellite') {
    if (_servicesStreetLayer && _servicesMap.hasLayer(_servicesStreetLayer)) {
      _servicesMap.removeLayer(_servicesStreetLayer);
    }
    if (_servicesSatLayer && !_servicesMap.hasLayer(_servicesSatLayer)) {
      _servicesSatLayer.addTo(_servicesMap);
    }
  } else {
    if (_servicesSatLayer && _servicesMap.hasLayer(_servicesSatLayer)) {
      _servicesMap.removeLayer(_servicesSatLayer);
    }
    if (_servicesStreetLayer && !_servicesMap.hasLayer(_servicesStreetLayer)) {
      _servicesStreetLayer.addTo(_servicesMap);
    }
  }
}

function toggleServicesGroup(group) {
  if (!_servicesMap || !_servicesGroups[group]) return;

  const item = _servicesGroups[group];
  item.visible = !item.visible;

  document.getElementById(`services-ctrl-${group}`)?.classList.toggle('active', item.visible);

  if (item.visible) {
    item.layer.addTo(_servicesMap);
  } else {
    _servicesMap.removeLayer(item.layer);
  }
}

/* ── TRANSPORT ──────────────────────────────────────────*/
function buildTransport(features, lat, lon) {
  const stations = features.filter(f => f.tags?.railway === 'station' && f.lat && f.lon)
    .map(f => ({ ...f, dist: haversineDistance(lat, lon, f.lat, f.lon) }))
    .sort((a,b) => a.dist - b.dist).slice(0, 3);

  const stationRows = stations.map(s => `
    <div class="service-item">
      <span class="si-icon">🚂</span>
      <div class="si-info">
        <div class="si-name">${s.tags?.name || 'Station'}</div>
        <div class="si-dist">${formatServiceDist(s.dist)} away</div>
      </div>
      <a class="si-link" href="https://maps.google.com/maps?q=${s.lat},${s.lon}" target="_blank">Directions ↗</a>
    </div>`).join('') || '<div class="si-none">No stations found nearby</div>';

  return `
    <div class="transport-section">
      <div class="card-label" style="margin-bottom:0.5rem">Transport links</div>
      ${stationRows}
      ${quickLinks([
        { label: 'National Rail',  url: `https://www.nationalrail.co.uk/` },
        { label: 'TfL (London)',   url: `https://tfl.gov.uk/` },
        { label: 'Traveline',      url: `https://www.traveline.info/` },
        { label: 'Google Transit', url: `https://maps.google.com/maps?q=${lat},${lon}&layer=transit` },
      ])}
    </div>`;
}

function buildTravelAccommodationTools(lat, lon) {
  return `
    <div class="travel-tools">
      <div class="card-label" style="margin-bottom:0.5rem">Travel & accommodation tools</div>

      <div class="tool-link-group">
        <div class="tool-link-label">Transport</div>
        ${quickLinks([
          { label: 'National Rail', url: `https://www.nationalrail.co.uk/` },
          { label: 'Trainline', url: `https://www.thetrainline.com/` },
          { label: 'Citymapper', url: `https://citymapper.com/` },
          { label: 'Google Transit', url: `https://maps.google.com/maps?q=${lat},${lon}&layer=transit` },
          { label: 'Google Flights', url: `https://www.google.com/travel/flights` }
        ])}
      </div>

      <div class="tool-link-group">
        <div class="tool-link-label">Accommodation</div>
        ${quickLinks([
          { label: 'Booking.com', url: `https://www.booking.com/searchresults.html?ss=${lat},${lon}` },
          { label: 'Airbnb', url: `https://www.airbnb.co.uk/s/${lat},${lon}` }
        ])}
      </div>
    </div>
  `;
}

function buildEmergencyQuickLinks() {
  return `
    <div class="emergency-links">
      <div class="card-label" style="margin-bottom:0.5rem">Emergency links</div>
      ${quickLinks([
        { label: 'NHS A&E finder', url: 'https://www.nhs.uk/service-search/other-services/Accident-and-emergency-services/LocationSearch/428' },
        { label: 'Find a pharmacy', url: 'https://www.nhs.uk/service-search/pharmacy/find-a-pharmacy' },
        { label: 'Mountain Rescue England & Wales', url: 'https://www.mountain.rescue.org.uk/' },
        { label: 'HM Coastguard', url: 'https://www.gov.uk/government/organisations/maritime-and-coastguard-agency' },
        { label: 'RNLI', url: 'https://rnli.org/' }
      ])}
    </div>
  `;
}

/* ── FOOD & AMENITIES ───────────────────────────────────*/
function buildFoodAndAmenities(features, lat, lon) {
  const groups = [
    {
      key: 'food',
      label: 'Food & drink',
      icon: '☕',
      categories: ['cafe', 'restaurant', 'supermarket']
    },
    {
      key: 'emergency',
      label: 'Emergency & health',
      icon: '🏥',
      categories: ['hospital', 'pharmacy', 'police', 'fire']
    },
    {
      key: 'logistics',
      label: 'Logistics',
      icon: '🅿️',
      categories: ['parking', 'fuel', 'ev', 'hardware']
    },
    {
      key: 'travel',
      label: 'Travel',
      icon: '🚂',
      categories: ['station', 'hotel', 'airport', 'ferry', 'harbour']
    },
    {
      key: 'toilets',
      label: 'Toilets',
      icon: '🚽',
      categories: ['toilets']
    }
  ];

  const renderLinks = (f) => {
    const tags = f.tags || {};
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${f.lat},${f.lon}`;
    const website = tags.website || tags['contact:website'] || '';
    const phone = tags.phone || tags['contact:phone'] || '';

    return `
      <div class="svc-table-links">
        <a href="${directionsUrl}" target="_blank">Directions ↗</a>
        ${website ? `<a href="${website}" target="_blank">Website ↗</a>` : ''}
        ${phone ? `<a href="tel:${phone}">Call ↗</a>` : ''}
      </div>
    `;
  };

  const renderTable = (group, active) => {
    const items = features
      .filter(f => group.categories.includes(f.serviceCategory))
      .sort((a, b) => (a.dist || 0) - (b.dist || 0));

    const rows = items.length
      ? items.map(f => {
          const tags = f.tags || {};
          const name = tags.name || f.serviceLabel || 'Service';
          const opening = tags.opening_hours || '';
          const detailParts = [];

          if (opening) detailParts.push(`Hours: ${opening}`);

          return `
            <tr class="svc-row" onclick="focusServiceMapMarker(event, '${f.serviceMapId || ''}')">
              <td class="svc-name">
                <span class="svc-row-icon">${f.serviceIcon}</span>
                <span>${name}</span>
              </td>
              <td>${f.serviceLabel || '—'}</td>
              <td>${typeof f.dist === 'number' ? formatServiceDist(f.dist) : '—'}</td>
              <td>${detailParts.length ? detailParts.join('<br>') : '—'}</td>
              <td>${renderLinks(f)}</td>
            </tr>
          `;
        }).join('')
      : `
        <tr>
          <td colspan="5" class="svc-empty">None found nearby</td>
        </tr>
      `;

    return `
      <div class="svc-table-panel ${active ? 'active' : ''}" data-svc-panel="${group.key}">
        <div class="svc-table-scroll">
          <table class="data-table svc-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Distance</th>
                <th>Info</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  };

  const tabs = groups.map((group, index) => {
    const count = features.filter(f => group.categories.includes(f.serviceCategory)).length;

    return `
      <button
        type="button"
        class="svc-tab ${index === 0 ? 'active' : ''}"
        onclick="setServicesListTab('${group.key}')"
      >
        ${group.icon} ${group.label}
        <span>${count}</span>
      </button>
    `;
  }).join('');

  const panels = groups.map((group, index) => renderTable(group, index === 0)).join('');

  return `
    <div class="amenities-section">
      <div class="card-label" style="margin-bottom:0.5rem">Nearby services & amenities</div>
      <div class="svc-table-note">Select a category, then click a row to highlight it on the map.</div>
      <div class="svc-tabs">${tabs}</div>
      ${panels}
    </div>`;
}

function setServicesListTab(key) {
  document.querySelectorAll('.svc-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${key}'`));
  });

  document.querySelectorAll('.svc-table-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.svcPanel === key);
  });
}

function focusServiceMapMarker(event, serviceMapId) {
  if (event.target.closest('a')) return;
  if (!_servicesMap || !serviceMapId || !_servicesMarkers[serviceMapId]) return;

  const marker = _servicesMarkers[serviceMapId];
  const latLng = marker.getLatLng();

  _servicesMap.panTo(latLng);
  marker.openPopup();
}

/* ── DRIVE TIMES ────────────────────────────────────────*/
function buildDriveTimes(lat, lon) {
  const cities = [
    { name: 'London',     lat: 51.5074, lon: -0.1278 },
    { name: 'Manchester', lat: 53.4808, lon: -2.2426 },
    { name: 'Birmingham', lat: 52.4862, lon: -1.8904 },
    { name: 'Bristol',    lat: 51.4545, lon: -2.5879 },
    { name: 'Edinburgh',  lat: 55.9533, lon: -3.1883 },
    { name: 'Glasgow',    lat: 55.8642, lon: -4.2518 },
  ];

  const rows = cities.map(c => {
    const dist = haversineDistance(lat, lon, c.lat, c.lon);
    // Rough drive time estimate: 80km/h average UK speed
    const hours = dist / 80;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    const timeStr = h > 0 ? `~${h}h ${m}m` : `~${m}m`;
    const gmapsUrl = `https://maps.google.com/maps?saddr=${c.lat},${c.lon}&daddr=${lat},${lon}`;

    return `<div class="drive-item">
      <span class="drive-city">${c.name}</span>
      <span class="drive-dist">${formatServiceDist(dist)}</span>
      <span class="drive-time">${timeStr}</span>
      <a class="si-link" href="${gmapsUrl}" target="_blank">Route ↗</a>
    </div>`;
  }).join('');

  return `
    <div class="drive-times">
      <div class="card-label" style="margin-bottom:0.5rem">Drive times from major cities</div>
      <div class="drive-note">Estimates based on straight-line distance — check Google Maps for actual routes</div>
      <div class="drive-header">
        <span>City</span><span>Distance</span><span>Est. time</span><span></span>
      </div>
      ${rows}
    </div>`;
}

/* ── TIDE TABLES ────────────────────────────────────────*/
function buildTideTables(lat, lon, coastDist) {
  return `
    <div class="tide-section">
      <div class="tide-head">
        <span class="card-label">Tide information</span>
        <span class="card-badge b-neu">${formatServiceDist(coastDist)} from coast</span>
      </div>
      <div class="tide-note">This location is within ${formatServiceDist(coastDist)} of the coast — check tide times before shooting near water.</div>
      ${quickLinks([
        { label: 'UKHO Easy Tide',     url: `https://easytide.admiralty.co.uk/` },
        { label: 'BBC Weather Tides',  url: `https://www.bbc.co.uk/weather/coast-and-sea/tide-tables` },
        { label: 'Tides Near Me',      url: `https://www.tidesnearme.com/${lat},${lon}/` },
        { label: 'MCA Safety',         url: 'https://www.gov.uk/government/organisations/maritime-and-coastguard-agency' },
      ])}
    </div>`;
}

/* ── WHAT3WORDS EMERGENCY ───────────────────────────────*/
function buildWhat3WordsEmergency(lat, lon) {
  const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  return `
    <div class="w3w-emergency">
      <div class="card-label" style="margin-bottom:0.25rem">Emergency location sharing</div>
      <div class="w3w-em-note">In an emergency, give your What3Words address or coordinates to emergency services.</div>
      <div class="w3w-em-coords">
        <span>Coordinates: </span>
        <span class="w3w-coords" onclick="navigator.clipboard.writeText('${coords}').then(()=>{this.textContent='✓ Copied!';setTimeout(()=>this.textContent='${coords}',2000)})">${coords}</span>
      </div>
      <div class="w3w-actions">
  <a class="quick-link w3w-primary-link" href="https://what3words.com" target="_blank">Open What3Words ↗</a>
</div>
    </div>`;
}


