/* ════════════════════════════════════════════════════════
   LOCATION CHECK — parking.js
   Parking & unit base section.
   Car parks, street parking, overnight safety score,
   vehicle restrictions, CPZ detection, EV charging.
   ════════════════════════════════════════════════════════ */

async function buildParking(data) {
  const { lat, lon, features, address } = data;

  const wrapper = document.createElement('div');
  wrapper.appendChild(sectionHead('Parking, Vans & Unit Base'));

  // TEMP: Police API disabled (CORS + rate limit issues)
let crimeData = null;

  const streetParking = getStreetParkingBreakdown(features, address);
  const parkingScore = calcParkingSecurityScore(features, address, crimeData, streetParking);

  const card = document.createElement('div');
  card.className = 'card g1';
  card.innerHTML = `
    <div class="card-head">
      <span class="card-label">Parking, vans & unit base</span>
      <span class="card-badge b-${parkingScore.cls}">Parking risk overview</span>
    </div>
    <div class="card-body">
      ${buildParkingCards(parkingScore)}
      ${buildParkingStrategy(parkingScore, streetParking, crimeData, features)}
      ${buildParkingMap(features, lat, lon)}
      ${buildStreetParking(features, address, lat, lon)}
      ${buildCarParks(features, lat, lon)}
      ${buildVehicleRestrictions(features, lat, lon)}
      ${buildUnitBase(features, lat, lon)}
      ${buildEVCharging(features, lat, lon)}
    </div>`;

  wrapper.appendChild(card);
  return wrapper;
}

/* ── PARKING SECURITY SCORE ─────────────────────────────*/
function getParkingCrimeModel(crimeData, features = []) {
  if (!Array.isArray(crimeData) || typeof getCrimeCounts !== 'function') {
    return {
      available: false,
      counts: null,
      context: getCrimeContext?.(features) || 'urban',
      kitRisk: 0,
      personalRisk: 0,
      dayRisk: 0,
      nightRisk: 0,
      kitLevel: { cls: 'warn', label: 'Unknown' },
      personalLevel: { cls: 'warn', label: 'Unknown' },
      dayLevel: { cls: 'warn', label: 'Unknown' },
      nightLevel: { cls: 'warn', label: 'Unknown' },
    };
  }

  const counts = getCrimeCounts(crimeData);
  const context = getCrimeContext(features);
  const thresholds = getCrimeThresholds(context);

  let kitRisk = counts.vehicle + counts.robbery + Math.round(counts.theft * 0.4);
  let personalRisk = counts.robbery + counts.violent + Math.round(counts.antiSocial * 0.35);

  if (counts.shoplifting >= 20) kitRisk = Math.round(kitRisk * 1.1);
  if (counts.weapons >= 3) personalRisk = Math.round(personalRisk * 1.2);

  const nightRisk = Math.round(personalRisk * 1.25 + counts.vehicle * 0.75);
  const dayRisk = Math.round(personalRisk * 0.75 + counts.vehicle * 0.5);

  return {
    available: true,
    counts,
    context,
    kitRisk,
    personalRisk,
    dayRisk,
    nightRisk,
    kitLevel: riskLevel(kitRisk, thresholds.kit.warn, thresholds.kit.flag),
    personalLevel: riskLevel(personalRisk, thresholds.personal.warn, thresholds.personal.flag),
    dayLevel: riskLevel(dayRisk, thresholds.day.warn, thresholds.day.flag),
    nightLevel: riskLevel(nightRisk, thresholds.night.warn, thresholds.night.flag),
  };
}

function calcParkingSecurityScore(features, address, crimeData, streetParking) {
  const crime = getParkingCrimeModel(crimeData, features);
  let score = 8;
  const notes = [];

  if (!crime.available) {
    score -= 2;
    notes.push('Crime data unavailable — manually check vehicle security risk');
  } else {
    if (crime.kitLevel.label === 'Very high') { score -= 4; notes.push('Very high vehicle / kit theft signal'); }
    else if (crime.kitLevel.cls === 'flag') { score -= 3; notes.push('High vehicle / kit theft signal'); }
    else if (crime.kitLevel.cls === 'warn') { score -= 1; notes.push('Moderate vehicle / kit theft signal'); }
    else notes.push('Lower recorded vehicle / kit crime signal');

    if (crime.nightLevel.label === 'Very high') { score -= 3; notes.push('Very high nighttime operating risk'); }
    else if (crime.nightLevel.cls === 'flag') { score -= 2; notes.push('High nighttime operating risk'); }
    else if (crime.nightLevel.cls === 'warn') { score -= 1; notes.push('Moderate nighttime operating risk'); }
  }

  const hasLighting = features.some(f => f.tags?.lit === 'yes');
  if (hasLighting) {
    score += 1;
    notes.push('Street lighting detected nearby');
  } else {
    score -= 1;
    notes.push('Limited street lighting detected');
  }

  if (streetParking.hasPermitParking || streetParking.isLondon) {
    score -= 1;
    notes.push('Permit / controlled parking likely — plan council dispensation or bay suspension');
  }

  if (streetParking.hasPaidParking) {
    notes.push('Paid parking signal detected nearby');
  }

  if (streetParking.hasLoadingBay) {
    score += 1;
    notes.push('Loading bay signal detected nearby — check times and loading rules');
  }

  if (streetParking.isRemote) {
    score -= 1;
    notes.push('Quieter / remote area — fewer passers-by and less natural surveillance');
  }

  score = Math.max(1, Math.min(10, score));
  const cls = score >= 7 ? 'ok' : score >= 5 ? 'warn' : 'flag';

  return { score, cls, notes, crime };
}

function buildParkingCards(ps) {
  const crime = ps.crime || {};
  const day = crime.dayLevel || { cls: 'warn', label: 'Unknown' };
  const night = crime.nightLevel || { cls: 'warn', label: 'Unknown' };

  const dayScore = getParkingDisplayScore(day, 'day');
  const nightScore = getParkingDisplayScore(night, 'night');

  const dayNotes = [];
  const nightNotes = [];

  // ── DAY LOGIC ──
  if (crime.kitLevel?.cls === 'flag') {
    dayNotes.push('Higher risk of theft from vehicles during the day.');
    dayNotes.push('Keep kit out of sight and avoid leaving gear unattended.');
  } else if (crime.kitLevel?.cls === 'warn') {
    dayNotes.push('Some vehicle crime nearby.');
    dayNotes.push('Keep kit covered and avoid leaving bags visible.');
  } else {
    dayNotes.push('Lower vehicle-crime signal.');
    dayNotes.push('Standard precautions should be enough.');
  }

  // ── NIGHT LOGIC ──
  if (crime.kitLevel?.cls === 'flag') {
    nightNotes.push('Do not leave valuable kit in the vehicle overnight.');
  } else if (crime.kitLevel?.cls === 'warn') {
    nightNotes.push('Avoid leaving valuable kit in the vehicle overnight if possible.');
  } else {
    nightNotes.push('Overnight parking looks more manageable, but remove visible kit.');
  }

  if (night.cls === 'flag') {
    nightNotes.push('High risk after dark — use secure or attended parking.');
  } else if (night.cls === 'warn') {
    nightNotes.push('After dark, choose well-lit parking close to base.');
  }

  // Lighting → night only
  ps.notes.forEach(note => {
    if (note.toLowerCase().includes('lighting')) {
      nightNotes.push(note);
    }
  });

  return `
    <div class="parking-risk-grid">

      ${buildParkingCard({
        icon: '☀️',
        title: 'Day parking',
        score: dayScore,
        cls: day.cls,
        label: day.label,
        subtitle: 'Leaving the van nearby during filming.',
        notes: dayNotes
      })}

      ${buildParkingCard({
        icon: '🌙',
        title: 'Overnight parking',
        score: nightScore,
        cls: night.cls,
        label: night.label,
        subtitle: 'Vehicle left unattended after dark.',
        notes: nightNotes
      })}

    </div>`;
}


function buildParkingCard({ icon, title, score, cls, label, subtitle, notes }) {
  const pct = score / 10 * 100;

  return `
    <div class="card g1 parking-card">

      <div class="card-head">
        <span class="card-label">${icon} ${title}</span>
        <span class="card-badge b-${cls}">${label}</span>
      </div>

      <div class="card-body">

        <div class="os-head">
          <div class="os-num">${score}<span class="os-denom">/10</span></div>
          <div class="os-label">${subtitle}</div>
        </div>

        <div class="os-bar">
          <div class="os-fill" style="width:${pct}%;background:${score>=7?'var(--ok)':score>=5?'var(--warn)':'var(--flag)'}"></div>
        </div>

        <div class="os-notes">
          ${notes.map(n => `<div class="os-note">— ${n}</div>`).join('')}
        </div>

      </div>
    </div>`;
}

function getParkingDisplayScore(level, mode) {
  let score = 8;

  if (level.label === 'Very high') score = mode === 'night' ? 2 : 3;
  else if (level.cls === 'flag') score = mode === 'night' ? 3 : 4;
  else if (level.cls === 'warn') score = mode === 'night' ? 5 : 6;
  else score = mode === 'night' ? 7 : 8;

  return Math.max(1, Math.min(10, score));
}



function buildParkingStrategy(ps, streetParking, crimeData, features = []) {
  const crime = ps.crime || getParkingCrimeModel(crimeData, features);
  const strategy = [];

  const dayHigh = crime.dayLevel?.cls === 'flag';
  const dayModerate = crime.dayLevel?.cls === 'warn';
  const nightHigh = crime.nightLevel?.cls === 'flag';
  const nightModerate = crime.nightLevel?.cls === 'warn';
  const kitHigh = crime.kitLevel?.cls === 'flag';
  const kitModerate = crime.kitLevel?.cls === 'warn';

  if (dayHigh || kitHigh) {
    strategy.push({
      title: 'During filming',
      note: 'Keep the van close, visible and ideally within sight of crew. Avoid leaving camera, lighting, sound or grip kit unattended in the vehicle.',
    });
  } else if (dayModerate || kitModerate) {
    strategy.push({
      title: 'During filming',
      note: 'Use well-lit, visible parking where possible. Keep kit covered and avoid obvious bags, cases or valuables on show.',
    });
  } else {
    strategy.push({
      title: 'During filming',
      note: 'Normal precautions should be enough, but still keep kit out of sight and lock the vehicle between trips.',
    });
  }

  if (nightHigh) {
    strategy.push({
      title: 'Overnight',
      note: 'Do not leave valuable kit in the van overnight unless the vehicle is in secure, attended or monitored parking.',
    });
  } else if (nightModerate) {
    strategy.push({
      title: 'Overnight',
      note: 'Avoid leaving valuable kit in the van overnight if possible. If the van has to stay, choose well-lit parking close to accommodation or base.',
    });
  } else {
    strategy.push({
      title: 'Overnight',
      note: 'Overnight parking looks more manageable, but remove visible kit and avoid isolated spots.',
    });
  }

  if (crime.context === 'urban' && (kitHigh || kitModerate || nightHigh || nightModerate)) {
    strategy.push({
      title: 'Urban parking choice',
      note: 'Avoid hidden underground or multi-storey car parks if the van will be left for long periods. A visible street bay or attended car park may be safer.',
    });
  }

  if (streetParking.isLondon || streetParking.hasPermitParking || streetParking.hasControlledSignals) {
    strategy.push({
      title: 'Permits / suspensions',
      note: 'Controlled parking is likely. Check CPZ signs and consider a council parking dispensation or bay suspension if the van needs to stay near location.',
    });
  }

  if (streetParking.hasLoadingBay) {
    strategy.push({
      title: 'Loading',
      note: 'Use loading bays for kit drop-off only if the signs allow it. Check loading times, maximum stay and whether waiting is permitted.',
    });
  }

  return `
    <div class="risk-section parking-strategy">
      <div class="risk-head">
        <span class="card-label">Recommended parking strategy</span>
        <span class="card-badge b-${ps.cls}">${ps.cls === 'flag' ? 'High caution' : ps.cls === 'warn' ? 'Plan ahead' : 'Standard precautions'}</span>
      </div>

      <div class="info-list parking-strategy-list">
        ${strategy.map(item => `
          <div class="info-list-item parking-strategy-item">
            <span class="info-list-icon">→</span>
            <div class="info-list-main">
              <div class="info-list-title">${item.title}</div>
              <div class="info-list-detail">${item.note}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="info-note">
        Use this as a production parking prompt, not a replacement for checking signs, permits, local rules or security requirements on the day.
      </div>
    </div>`;
}

/* ── PARKING MAP ────────────────────────────────────────*/
let _parkingMapState = {
  map: null,
  layers: {
    parking: null,
    street: null,
    loadingEv: null,
  },
  visible: {
    parking: true,
    street: true,
    loadingEv: true,
  },
};

function buildParkingMap(features, lat, lon) {
  window._lastParkingFeatures = features || [];
  const parkingFeatures = getParkingMapFeatures(features, lat, lon);
  const cls = parkingFeatures.length ? 'ok' : 'warn';

  waitForParkingMap(() => {
    initParkingMap(lat, lon, parkingFeatures);
  });

  return `
    <div class="map-card parking-map-card">
      <div class="map-card-head">
        <span class="card-label">Parking map</span>
        <span class="card-badge data-source">OSM data</span>
      </div>

      <div class="map-frame parking-map-frame">
        <div id="parking-map"></div>
      </div>

      <div class="map-legend parking-map-legend">
        <span><b>🅿️</b> parking</span>
        <span><b>🛍️</b> customer</span>
        <span><b>💰</b> paid</span>
        <span><b>🚚</b> loading</span>
        <span><b>⚡️</b> EV</span>
      </div>

      <div class="map-controls parking-map-controls">
        <button class="map-ctrl-btn active" id="ctrl-parking-points" onclick="toggleParkingMapLayer('parking')">Car parks</button>
        <button class="map-ctrl-btn active" id="ctrl-parking-loading" onclick="toggleParkingMapLayer('loadingEv')">Loading / EV</button>
      </div>

  

      <div class="info-note">
        This map shows useful parking hints from OpenStreetMap, not live availability or official street restrictions. Always check signs, height limits, payment rules and local restrictions on the day.
      </div>
    </div>`;
}

function getParkingMapFeatures(features = [], lat, lon) {
  return features
    .filter(f => {
      const tags = f.tags || {};
      const keys = Object.keys(tags).join(' ').toLowerCase();
      const values = String(Object.values(tags).join(' ')).toLowerCase();

      const access = String(tags.access || '').toLowerCase();
      const parking = String(tags.parking || '').toLowerCase();
      const name = String(tags.name || '').toLowerCase();

            const isPrivateOrResidential =
        access === 'private' ||
        access === 'residents' ||
        parking === 'private' ||
        parking === 'residents' ||
        values.includes('residents only') ||
        values.includes('residents_only');

      const hasUsefulParkingDetail =
        !!tags.name ||
        !!tags.operator ||
        !!tags.capacity ||
        !!tags.fee ||
        !!tags.maxstay ||
        access === 'customers' ||
        access === 'yes' ||
        access === 'public';

      const isUsefulParking =
        tags.amenity === 'charging_station' ||
        tags.amenity === 'loading_dock' ||
        values.includes('loading') ||
        (
          tags.amenity === 'parking' &&
          hasUsefulParkingDetail
        );

      const isStreetParkingHint =
        tags['parking:lane:both'] ||
        tags['parking:lane:left'] ||
        tags['parking:lane:right'] ||
        tags['parking:condition'] ||
        tags['parking:condition:both'] ||
        tags['parking:condition:left'] ||
        tags['parking:condition:right'];

      return (
        !isPrivateOrResidential &&
        (
          isUsefulParking ||
          isStreetParkingHint
        )
      );
    })
    .map(f => {
      const point = getParkingFeaturePoint(f);
      if (!point) return null;

      return {
        ...f,
        mapLat: point.lat,
        mapLon: point.lon,
        dist: haversineDistance(lat, lon, point.lat, point.lon),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 30);
}

function getParkingFeaturePoint(f) {
  if (f.lat && f.lon) return { lat: f.lat, lon: f.lon };
  if (f.center?.lat && f.center?.lon) return { lat: f.center.lat, lon: f.center.lon };

  if (Array.isArray(f.geometry) && f.geometry.length) {
    const valid = f.geometry.filter(p => p?.lat && p?.lon);
    if (!valid.length) return null;

    const avgLat = valid.reduce((sum, p) => sum + p.lat, 0) / valid.length;
    const avgLon = valid.reduce((sum, p) => sum + p.lon, 0) / valid.length;

    return { lat: avgLat, lon: avgLon };
  }

  return null;
}

function waitForParkingMap(callback) {
  function tryInit() {
    const el = document.getElementById('parking-map');
    if (!el) return false;

    requestAnimationFrame(() => {
      setTimeout(callback, 150);
    });

    return true;
  }

  if (tryInit()) return;

  const observer = new MutationObserver(() => {
    if (tryInit()) {
      observer.disconnect();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function initParkingMap(lat, lon, parkingFeatures = []) {
  const el = document.getElementById('parking-map');
  if (!el || typeof L === 'undefined') return;

  if (_parkingMapState.map) {
    _parkingMapState.map.off();
    _parkingMapState.map.remove();
    _parkingMapState.map = null;
  }

  const map = L.map('parking-map', {
    center: [lat, lon],
    zoom: 17,
    zoomControl: true,
    scrollWheelZoom: true,
  });

  _parkingMapState.map = map;
  _parkingMapState.layers.parking = L.layerGroup();
  _parkingMapState.layers.loadingEv = L.layerGroup();

  _parkingMapState.visible.parking = true;
  _parkingMapState.visible.loadingEv = true;

  document.getElementById('ctrl-parking-points')?.classList.add('active');
  document.getElementById('ctrl-parking-loading')?.classList.add('active');

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap', maxZoom: 19 }
  ).addTo(map);

  const bounds = L.latLngBounds([[lat, lon]]);

  L.circleMarker([lat, lon], {
    radius: 9,
    fillColor: '#111110',
    fillOpacity: 1,
    color: '#ffffff',
    weight: 2.5,
  }).bindTooltip('📍 Selected location').addTo(map);



  parkingFeatures.forEach(f => {
    const type = getParkingMarkerType(f);
    const targetLayer = type.group === 'loadingEv'
      ? _parkingMapState.layers.loadingEv
      : _parkingMapState.layers.parking;

    const icon = L.divIcon({
      className: 'parking-map-emoji',
      html: type.icon,
      iconSize: [28, 28],
iconAnchor: [14, 14],
    });

    bounds.extend([f.mapLat, f.mapLon]);

    L.marker([f.mapLat, f.mapLon], { icon })
      .bindTooltip(buildParkingMarkerTooltip(f, type.label))
      .addTo(targetLayer);
  });

  _parkingMapState.layers.parking.addTo(map);
  _parkingMapState.layers.loadingEv.addTo(map);

  if (bounds.isValid() && parkingFeatures.length) {
    map.fitBounds(bounds, {
      padding: [32, 32],
      maxZoom: 17,
    });
  }

  setTimeout(() => {
    map.invalidateSize();
  }, 150);
}

function buildParkingStreetLayer(features = [], lat, lon, bounds) {
  const layer = L.layerGroup();

  features.forEach(f => {
    const tags = f.tags || {};
    const hasStreetParkingTags =
      tags['parking:lane:both'] ||
      tags['parking:lane:left'] ||
      tags['parking:lane:right'] ||
      tags['parking:condition'] ||
      tags['parking:condition:both'] ||
      tags['parking:condition:left'] ||
      tags['parking:condition:right'];

    if (!hasStreetParkingTags || !Array.isArray(f.geometry) || f.geometry.length < 2) return;

    const type = getStreetParkingLineType(tags);
    const coords = f.geometry.map(p => [p.lat, p.lon]).filter(p => p[0] && p[1]);

    if (coords.length < 2) return;

    coords.forEach(c => bounds.extend(c));

    L.polyline(coords, {
      color: type.color,
      weight: 5,
      opacity: 0.82,
      dashArray: type.dashArray,
    })
      .bindTooltip(buildStreetParkingTooltip(tags, type.label))
      .addTo(layer);
  });

  return layer;
}

function getStreetParkingLineType(tags = {}) {
  const values = String(Object.values(tags).join(' ')).toLowerCase();

  if (values.includes('resident') || values.includes('permit')) {
    return {
      label: 'Permit / resident parking hint',
      color: '#b2673a',
      dashArray: '7 5',
    };
  }

  if (tags.fee === 'yes' || values.includes('paid') || values.includes('ticket') || values.includes('pay_and_display')) {
    return {
      label: 'Paid street parking hint',
      color: '#111110',
      dashArray: null,
    };
  }

  if (values.includes('loading')) {
    return {
      label: 'Loading restriction / loading bay hint',
      color: '#8b6914',
      dashArray: '4 4',
    };
  }

  if (tags.fee === 'no' || values.includes('free')) {
    return {
      label: 'Free street parking hint',
      color: '#2a6644',
      dashArray: null,
    };
  }

  return {
    label: 'Street parking hint',
    color: '#66615a',
    dashArray: '3 5',
  };
}

function buildStreetParkingTooltip(tags = {}, label = 'Street parking hint') {
  const parts = [label];

  const condition =
    tags['parking:condition'] ||
    tags['parking:condition:both'] ||
    tags['parking:condition:left'] ||
    tags['parking:condition:right'];

  const lane =
    tags['parking:lane:both'] ||
    tags['parking:lane:left'] ||
    tags['parking:lane:right'];

  if (condition) parts.push(`Condition: ${condition}`);
  if (lane) parts.push(`Lane: ${lane}`);
  if (tags.maxstay) parts.push(`Max stay: ${tags.maxstay}`);
  if (tags.fee === 'yes') parts.push('Fee: paid');
  if (tags.fee === 'no') parts.push('Fee: free');

  return parts.join(' · ');
}

function getParkingMarkerType(f) {
  const tags = f.tags || {};
  const values = String(Object.values(tags).join(' ')).toLowerCase();

  if (tags.amenity === 'charging_station') {
    return { icon: '⚡️', label: 'EV charging', bg: '#2a6644', fg: '#ffffff', group: 'loadingEv' };
  }

  if (tags.amenity === 'loading_dock' || values.includes('loading')) {
    return { icon: '🚚', label: 'Loading / service access', bg: '#b2673a', fg: '#ffffff', group: 'loadingEv' };
  }

  if (tags.fee === 'yes' || values.includes('paid')) {
    return { icon: '💰', label: 'Paid parking', bg: '#111110', fg: '#ffffff', group: 'parking' };
  }

  if (tags.access === 'customers') {
    return { icon: '🛍️', label: 'Customer parking', bg: '#eae1d2', fg: '#111110', group: 'parking' };
  }

  return { icon: '🅿️', label: 'Parking', bg: '#eae1d2', fg: '#111110', group: 'parking' };
}

function toggleParkingMapLayer(key) {
  const state = _parkingMapState;
  if (!state.map || !state.layers[key]) return;

  state.visible[key] = !state.visible[key];

  const btnMap = {
    parking: 'ctrl-parking-points',
    loadingEv: 'ctrl-parking-loading',
  };

  document.getElementById(btnMap[key])?.classList.toggle('active', state.visible[key]);

  if (state.visible[key]) {
    state.layers[key].addTo(state.map);
  } else {
    state.map.removeLayer(state.layers[key]);
  }
}

function buildParkingMarkerTooltip(f, label) {
  const tags = f.tags || {};
  const name = tags.name || label;
  const fee = tags.fee === 'yes' ? 'Paid' : tags.fee === 'no' ? 'Free' : '';
  const capacity = tags.capacity ? `${tags.capacity} spaces` : '';
  const maxStay = tags.maxstay ? `Max ${tags.maxstay}` : '';
  const access = tags.access && tags.access !== 'yes' ? `Access: ${tags.access}` : '';

  const meta = [
    formatDist(f.dist),
    fee,
    capacity,
    maxStay,
    access,
  ].filter(Boolean).join(' · ');

  return `${name}${meta ? ' — ' + meta : ''}`;
}

/* ── CAR PARKS ──────────────────────────────────────────*/
function buildCarParks(features, lat, lon) {
  const carparks = features
    .filter(f => f.tags?.amenity === 'parking' && f.lat && f.lon)
    .map(f => ({ ...f, dist: haversineDistance(lat, lon, f.lat, f.lon) }))
    .sort((a,b) => a.dist - b.dist)
    .slice(0, 5);

  const rows = carparks.map(p => {
    const name     = p.tags?.name || 'Car park';
    const access   = p.tags?.access || '';
const fee      = p.tags?.fee === 'yes' ? 'Paid' : p.tags?.fee === 'no' ? 'Free' : '';
const capacity = p.tags?.capacity ? p.tags.capacity + ' spaces' : '';
const maxStay  = p.tags?.['maxstay'] || '';
    return `
      <div class="carpark-item">
        <div class="cp-info">
          <div class="cp-name">${name}</div>
          <div class="cp-meta">${[formatDist(p.dist), fee, access ? 'Access: ' + access : '', capacity, maxStay ? 'Max ' + maxStay : ''].filter(Boolean).join(' · ')}</div>
        </div>
        <a class="si-link" href="https://maps.google.com/maps?q=${p.lat},${p.lon}" target="_blank">Map ↗</a>
      </div>`;
  }).join('') || '<div class="si-none">No car parks found nearby</div>';

  return `
    <div class="carparks-section">
      <div class="card-label" style="margin-bottom:0.5rem">Car parks nearby</div>
      ${rows}
      ${quickLinks([
        { label: 'JustPark',    url: `https://www.justpark.com/search/?latitude=${lat}&longitude=${lon}` },
        { label: 'Parkopedia',  url: `https://en.parkopedia.co.uk/parking/map/#14/${lat}/${lon}` },
        { label: 'YourParkingSpace', url: `https://www.yourparkingspace.co.uk/parking-near-me` },
      ])}
    </div>`;
}

/* ── STREET PARKING ─────────────────────────────────────*/
function getStreetParkingBreakdown(features = [], address = {}) {
  const addr = address?.address || {};
  const placeText = [
    addr.city,
    addr.town,
    addr.village,
    addr.suburb,
    addr.borough,
    addr.county,
  ].filter(Boolean).join(' ').toLowerCase();

  const isLondon = placeText.includes('london');

  const parkingTagged = features.filter(f => {
    const tags = f.tags || {};
    return Object.keys(tags).some(k =>
      k.startsWith('parking:') ||
      k.includes('parking') ||
      k === 'maxstay' ||
      k === 'fee' ||
      k === 'access' ||
      k === 'loading' ||
      k === 'restriction'
    );
  });

  const hasPermitParking = parkingTagged.some(f => {
    const tags = f.tags || {};
    const values = Object.values(tags).join(' ').toLowerCase();
    return values.includes('resident') || values.includes('permit') || values.includes('residents_only');
  });

  const hasPaidParking = parkingTagged.some(f => {
    const tags = f.tags || {};
    const values = Object.values(tags).join(' ').toLowerCase();
    return tags.fee === 'yes' || values.includes('paid') || values.includes('pay_and_display') || values.includes('ticket');
  });

  const hasFreeParking = parkingTagged.some(f => {
    const tags = f.tags || {};
    const values = Object.values(tags).join(' ').toLowerCase();
    return tags.fee === 'no' || values.includes('free');
  });

  const hasLoadingBay = parkingTagged.some(f => {
    const tags = f.tags || {};
    const values = Object.values(tags).join(' ').toLowerCase();
    return values.includes('loading') || tags.amenity === 'loading_dock';
  });

  const hasStreetParking = parkingTagged.some(f => {
    const tags = f.tags || {};
    return (
      tags['parking:lane:both'] ||
      tags['parking:lane:left'] ||
      tags['parking:lane:right'] ||
      tags['parking:condition'] ||
      tags['parking:condition:both'] ||
      tags['parking:condition:left'] ||
      tags['parking:condition:right']
    );
  });

  const hasControlledSignals = isLondon || hasPermitParking || hasPaidParking || hasLoadingBay;

  const urbanSignals = features.filter(f => {
    const tags = f.tags || {};
    return (
      tags.building ||
      tags.shop ||
      tags.office ||
      tags.amenity ||
      ['residential', 'commercial', 'retail', 'industrial'].includes(tags.landuse) ||
      ['city', 'town', 'suburb', 'neighbourhood', 'quarter'].includes(tags.place)
    );
  }).length;

  const isRemote = urbanSignals < 4 && features.length < 35;

  const hints = [];

  if (isLondon) {
    hints.push({
      cls: 'warn',
      icon: '🔵',
      title: 'London / controlled parking likely',
      note: 'CPZs, resident bays, loading restrictions, ULEZ and Congestion Charge may apply.',
    });
  }

  if (hasPermitParking) {
    hints.push({
      cls: 'warn',
      icon: '🪪',
      title: 'Permit / resident parking signal',
      note: 'Map data suggests permit or resident restrictions nearby. Check signs and council rules before relying on street parking.',
    });
  }

  if (hasPaidParking) {
    hints.push({
      cls: 'info',
      icon: '💰',
      title: 'Paid parking signal',
      note: 'Nearby parking tags suggest paid parking or pay-and-display/pay-by-phone controls may exist.',
    });
  }

  if (hasFreeParking) {
    hints.push({
      cls: 'ok',
      icon: '✓',
      title: 'Free parking signal',
      note: 'Some nearby map data suggests free parking, but signs still take priority.',
    });
  }

  if (hasLoadingBay) {
    hints.push({
      cls: 'warn',
      icon: '🚚',
      title: 'Loading bay signal',
      note: 'Loading may be possible nearby. Check loading-only times, maximum stay and whether waiting is allowed.',
    });
  }

  if (hasStreetParking && !hasPermitParking && !hasPaidParking) {
    hints.push({
      cls: 'info',
      icon: '🅿️',
      title: 'Street parking mapped nearby',
      note: 'OpenStreetMap has some street-parking tags nearby, but restrictions may be incomplete.',
    });
  }

  if (!hints.length) {
    hints.push({
      cls: 'warn',
      icon: '❔',
      title: 'No reliable street-parking data detected',
      note: 'This does not mean parking is unrestricted. Check signs, council pages and parking apps manually.',
    });
  }

  return {
    isLondon,
    isRemote,
    parkingTagged,
    hasPermitParking,
    hasPaidParking,
    hasFreeParking,
    hasLoadingBay,
    hasStreetParking,
    hasControlledSignals,
    hints,
  };
}

function buildStreetParking(features, address, lat, lon) {
  const sp = getStreetParkingBreakdown(features, address);
  const councilName = getParkingCouncilName(address);

  const headlineCls =
    sp.hasControlledSignals ? 'warn'
    : sp.hasStreetParking ? 'ok'
    : 'warn';

  const summary = [];

  if (sp.isLondon) {
    summary.push('London location — CPZs, resident bays, loading rules, ULEZ and Congestion Charge are likely to matter.');
  }

  if (sp.hasPermitParking) {
    summary.push('Permit or resident parking is likely nearby.');
  }

  if (sp.hasPaidParking) {
    summary.push('Paid parking is likely in this area.');
  }

  if (sp.hasLoadingBay) {
    summary.push('Loading bays may be nearby — check times, maximum stay and waiting rules.');
  }

  if (sp.hasStreetParking && !sp.hasControlledSignals) {
    summary.push('Some street-parking data exists nearby, but restrictions may still be incomplete.');
  }

  if (!summary.length) {
    summary.push('No reliable street-parking data detected — this does not mean parking is unrestricted.');
  }

  const links = [
    councilName
      ? {
          label: 'Council parking permits',
          url: `https://www.google.com/search?q=${encodeURIComponent(councilName + ' parking dispensation bay suspension filming permit')}`
        }
      : null,
    { label: 'Parking dispensation', url: 'https://www.gov.uk/apply-for-temporary-parking-dispensation' },
    { label: 'AppyParking+', url: 'https://appyparking.com/plus/' },
    { label: 'Parkopedia', url: `https://en.parkopedia.co.uk/parking/map/#14/${lat}/${lon}` },
    { label: 'JustPark', url: `https://www.justpark.com/search/?latitude=${lat}&longitude=${lon}` },
    { label: 'RingGo', url: 'https://www.ringgo.co.uk/' },
  ].filter(Boolean);

  return `
    <div class="street-parking">
      <div class="risk-head">
        <span class="card-label">Street parking & restrictions</span>
        <span class="card-badge b-${headlineCls}">
          ${sp.hasControlledSignals ? 'Restrictions likely' : sp.hasStreetParking ? 'Check signs' : 'Check manually'}
        </span>
      </div>

      <div class="os-notes">
        ${summary.map(n => `<div class="os-note">— ${n}</div>`).join('')}
      </div>

      <div class="risk-note subtle">
        Street parking rules are not reliably available from map data. Check CPZ entry signs, bay plates, payment apps and council rules before leaving a vehicle.
      </div>

      ${quickLinks(links)}
    </div>`;
}

function getParkingCouncilName(address = {}) {
  const addr = address?.address || {};

  return (
    addr.borough ||
    addr.city ||
    addr.town ||
    addr.municipality ||
    addr.city_district ||
    addr.district ||
    addr.county ||
    addr.state_district ||
    ''
  );
}

/* ── VEHICLE RESTRICTIONS ───────────────────────────────*/
function buildVehicleRestrictions(features, lat, lon) {
  const lowBridges = features.filter(f =>
    f.tags?.maxheight && parseFloat(f.tags.maxheight) < 4.5 && f.lat && f.lon
  ).map(f => ({ ...f, dist: haversineDistance(lat, lon, f.lat, f.lon) }))
   .sort((a,b) => a.dist - b.dist).slice(0, 3);

  const weightRestrictions = features.filter(f =>
    f.tags?.maxweight && parseFloat(f.tags.maxweight) < 7.5 && f.lat && f.lon
  ).map(f => ({ ...f, dist: haversineDistance(lat, lon, f.lat, f.lon) }))
   .sort((a,b) => a.dist - b.dist).slice(0, 3);

  const bridgeRows = lowBridges.map(b => `
    <div class="restriction-item">
      <span class="ri-icon">⚠️</span>
      <div>
        <div class="ri-title">Low bridge — ${b.tags.maxheight}m max height</div>
        <div class="ri-note">${formatDist(b.dist)} away · ${b.tags?.name || 'Unnamed bridge'}</div>
      </div>
    </div>`).join('');

  const weightRows = weightRestrictions.map(w => `
    <div class="restriction-item">
      <span class="ri-icon">⚠️</span>
      <div>
        <div class="ri-title">Weight restriction — ${w.tags.maxweight}t max</div>
        <div class="ri-note">${formatDist(w.dist)} away</div>
      </div>
    </div>`).join('');

  if (!lowBridges.length && !weightRestrictions.length) return `
    <div class="vehicle-restrictions">
      <div class="card-label" style="margin-bottom:0.5rem">Vehicle restrictions</div>
      <div class="si-none">No height or weight restrictions detected on nearby roads</div>
    </div>`;

  return `
    <div class="vehicle-restrictions">
      <div class="card-label" style="margin-bottom:0.5rem">Vehicle restrictions</div>
      ${bridgeRows}
      ${weightRows}
    </div>`;
}

/* ── UNIT BASE ──────────────────────────────────────────*/
function buildUnitBase(features, lat, lon) {
  // Look for large flat areas suitable for unit base
  const hasCarPark    = features.some(f => f.tags?.amenity === 'parking');
  const hasIndustrial = features.some(f => f.tags?.landuse === 'industrial');
  const hasPark       = features.some(f => f.tags?.leisure === 'park');

  let suggestion = 'No obvious unit base area detected nearby — scout on location';
  let cls = 'warn';

  if (hasCarPark)    { suggestion = 'Car park nearby — potential unit base. Check with owner for production vehicle access.'; cls = 'ok'; }
  if (hasIndustrial) { suggestion = 'Industrial area nearby — potential unit base with owner permission.'; cls = 'ok'; }

  return `
    <div class="unit-base">
      <div class="ub-head">
        <span class="card-label">Unit base suggestion</span>
        <span class="card-badge b-${cls}">${cls === 'ok' ? 'Options nearby' : 'Scout required'}</span>
      </div>
      <div class="ub-note">${suggestion}</div>
      <div class="ub-note" style="margin-top:4px">Unit base requirements: flat hard standing, power access, safe turning circle for HGVs, proximity to location without blocking access.</div>
    </div>`;
}

/* ── EV CHARGING ────────────────────────────────────────*/
function buildEVCharging(features, lat, lon) {
  const evPoints = features
    .filter(f => f.tags?.amenity === 'charging_station' && f.lat && f.lon)
    .map(f => ({ ...f, dist: haversineDistance(lat, lon, f.lat, f.lon) }))
    .sort((a,b) => a.dist - b.dist).slice(0, 3);

  if (!evPoints.length) return `
    <div class="ev-charging">
      <div class="card-label" style="margin-bottom:0.25rem">EV charging</div>
      <div class="si-none">No EV charging points detected nearby</div>
      ${quickLinks([{ label: 'Zap-Map EV finder', url: `https://www.zap-map.com/map/#${lat},${lon},14` }])}
    </div>`;

  return `
    <div class="ev-charging">
      <div class="card-label" style="margin-bottom:0.5rem">EV charging nearby</div>
      ${evPoints.map(e => `
        <div class="service-item">
          <span class="si-icon">⚡</span>
          <div class="si-info">
            <div class="si-name">${e.tags?.name || 'EV Charging'}</div>
            <div class="si-dist">${formatDist(e.dist)} away${e.tags?.capacity ? ' · ' + e.tags.capacity + ' points' : ''}</div>
          </div>
          <a class="si-link" href="https://maps.google.com/maps?q=${e.lat},${e.lon}" target="_blank">Map ↗</a>
        </div>`).join('')}
      ${quickLinks([{ label: 'Zap-Map', url: `https://www.zap-map.com/map/#${lat},${lon},14` }])}
    </div>`;
}


