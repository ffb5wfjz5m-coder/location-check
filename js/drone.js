/* ════════════════════════════════════════════════════════
   LOCATION CHECK — drone.js
   Drone & airspace section.
   Uses OSM features + OpenAIP for airspace zones.
   ════════════════════════════════════════════════════════ */

function buildDrone(data) {
  const { lat, lon, features, weatherData, address } = data;

  const wrapper = document.createElement('div');
  wrapper.appendChild(sectionHead('Drone & Airspace'));

  const airspace = calcAirspace(features);
  const todayIdx = typeof getTodayIndex === 'function' && weatherData
    ? getTodayIndex(weatherData, data.date) : 0;
  const windGusts = weatherData?.daily?.windgusts_10m_max?.[todayIdx] ?? 0;
  const windSpeed = weatherData?.daily?.windspeed_10m_max?.[todayIdx] ?? 0;
  const rain      = weatherData?.daily?.precipitation_sum?.[todayIdx] ?? 0;
  const temp      = weatherData?.daily?.temperature_2m_min?.[todayIdx] ?? 10;

  const card = document.createElement('div');
  card.className = 'card g1';
  card.innerHTML = `
    <div class="card-head">
      <span class="card-label">Airspace & drone conditions</span>
      <span id="drone-card-badge" class="card-badge b-${airspace.status}">${airspace.badge}</span>
    </div>
    <div class="card-body">
      ${buildAirspaceStatus(airspace, features, lat, lon)}
      ${buildDroneMap(lat, lon, features)}
      ${buildDroneSensitiveSites(lat, lon, features)}
      ${buildDroneUrbanCaution(address, features)}
      ${buildDroneWindMatrix(windGusts, windSpeed, rain, temp)}
      ${buildDroneLawSummary()}
      ${buildDroneQuickLinks(lat, lon)}
    </div>`;

  wrapper.appendChild(card);
  return wrapper;
}

/* ── AIRSPACE STATUS ────────────────────────────────────*/
function buildAirspaceStatus(airspace, features, lat, lon) {
  const aerodromes = features.filter(f =>
    (f.tags?.aeroway === 'aerodrome' || f.tags?.aeroway === 'helipad') && f.lat && f.lon
  );

  const aerodromesHTML = aerodromes.slice(0, 5).map(a => {
    const dist = haversineDistance(lat, lon, a.lat, a.lon);
    const name = a.tags?.name || a.tags?.aeroway || 'Aerodrome';
    const type = a.tags?.aeroway === 'helipad' ? 'Helipad' : 'Aerodrome';
    const frz  = a.tags?.aeroway === 'aerodrome' ? '— FRZ likely applies' : '— check NOTAMs';
    return `<div class="aerodrome-item">
      <span class="aerodrome-icon">${a.tags?.aeroway === 'helipad' ? '🚁' : '✈️'}</span>
      <span class="aerodrome-name">${name}</span>
      <span class="aerodrome-type">${type}</span>
      <span class="aerodrome-dist">${formatDist(dist)} ${frz}</span>
    </div>`;
  }).join('');

  return `
    <div class="airspace-status">
      <div class="as-main">
        <div class="as-badge-wrap">
          <span class="as-icon">${airspace.status === 'flag' ? '🔴' : airspace.status === 'warn' ? '🟡' : '🟢'}</span>
          <div>
            <div class="as-label" id="drone-airspace-label">${airspace.badge}</div>
            <div class="as-note" id="drone-airspace-note">${formatDroneTextDistances(airspace.note)}</div>
          </div>
        </div>
      </div>
      ${aerodromes.length ? `
        <div class="aerodrome-list">
          <div class="card-label" style="margin-bottom:0.5rem;margin-top:0.75rem">Nearby aerodromes & helipads</div>
          ${aerodromesHTML}
        </div>` : ''}
      <div class="as-disclaimer">⚠ Airspace checks combine nearby OSM features with local NATS-derived UAS restriction data where available. This is still indicative only: always verify on Drone Assist, the CAA Drone Map and NOTAMs before flying.</div>
    </div>`;
}

/* ── DRONE MAP ──────────────────────────────────────────*/
const NATS_UAS_DATA_LAST_UPDATED = '14 May 2026';

function buildDroneMap(lat, lon, features) {
  return `
    <div class="map-card drone-map-card">
      <div class="map-card-head">
        <span id="drone-map-label" class="card-label drone-map-label drone-map-label-clear">Airspace map</span>
        <span class="card-badge data-source">NATS data</span>
      </div>

      <div id="drone-zone-alert" class="drone-zone-alert"></div>

      <div class="map-frame drone-map-frame">
        <div id="drone-map"></div>
      </div>

      <div class="map-legend drone-map-legend">
        <span><i class="drone-legend-dot drone-legend-prohibited"></i>Prohibited</span>
        <span><i class="drone-legend-dot drone-legend-restricted"></i>Restricted / FRZ</span>
        <span><i class="drone-legend-dot drone-legend-danger"></i>Danger area</span>
        <span><i class="drone-legend-dot drone-legend-other"></i>Other UAS zone</span>
      </div>

      <div class="map-controls drone-map-controls">
        <button id="drone-map-advanced-btn" type="button" class="map-ctrl-btn">
          Advanced zones
        </button>
        <button id="drone-map-expand-btn" type="button" class="map-ctrl-btn">
          Expand map
        </button>
      </div>

      <div class="info-note drone-map-note">
        <strong>Map data last updated: ${NATS_UAS_DATA_LAST_UPDATED}.</strong>
        Permanent UAS zones are shown from local NATS-derived data where available.
        This map does not include live NOTAMs, temporary restrictions, emergency restrictions, or app-specific geozones.
        Always verify on
        <a class="ext-link" href="https://dronesafe.uk/drone-code/where-can-i-fly/" target="_blank">Drone Assist ↗</a>,
        <a class="ext-link" href="https://map.caa.co.uk/drone-map/" target="_blank">CAA Drone Map ↗</a>,
        and NOTAMs before flying.
      </div>
    </div>`;
}

// Called after DOM renders
function initDroneMap(data) {
  const { lat, lon, features } = data;
  const mapEl = document.getElementById('drone-map');
if (!mapEl || !window.L) return;

// 🔧 FIX: remove existing map instance if it exists
if (mapEl._leaflet_id) {
  mapEl._leaflet_id = null;
  mapEl.innerHTML = '';
}

const dmap = L.map('drone-map', {
    center: [lat, lon],
    zoom: 12,
    zoomControl: true,
    scrollWheelZoom: false
  });

  const expandBtn = document.getElementById('drone-map-expand-btn');
  const mapFrame = mapEl.closest('.drone-map-frame');

  if (expandBtn && mapFrame) {
    expandBtn.addEventListener('click', () => {
      const isExpanded = mapFrame.classList.toggle('drone-map-expanded');

      expandBtn.classList.toggle('active', isExpanded);
      expandBtn.textContent = isExpanded ? 'Shrink map' : 'Expand map';

      setTimeout(() => {
        dmap.invalidateSize();
      }, 250);
    });
  }

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 18
  }).addTo(dmap);

  // Location pin
  L.circleMarker([lat, lon], {
    radius: 8, fillColor: '#ffffff', fillOpacity: 1,
    color: '#111110', weight: 2.5
  }).bindTooltip('📍 Your location').addTo(dmap);

  // Draw FRZ circles around aerodromes
  const aerodromes = features.filter(f =>
    f.tags?.aeroway === 'aerodrome' && f.lat && f.lon
  );

  aerodromes.forEach(a => {
    // FRZ = 5km radius for most UK aerodromes
    L.circle([a.lat, a.lon], {
      radius: 5000,
      color: '#c84820', fillColor: '#c84820',
      fillOpacity: 0.1, weight: 2, dashArray: '6 4'
    }).bindTooltip(`FRZ — ${a.tags?.name || 'Aerodrome'} (indicative 5km)`).addTo(dmap);

    L.circleMarker([a.lat, a.lon], {
      radius: 6, fillColor: '#c84820', fillOpacity: 1,
      color: '#fff', weight: 1
    }).bindTooltip(`✈️ ${a.tags?.name || 'Aerodrome'}`).addTo(dmap);
  });

  // Helipads
  features.filter(f => f.tags?.aeroway === 'helipad' && f.lat && f.lon).forEach(h => {
    L.circleMarker([h.lat, h.lon], {
      radius: 5, fillColor: '#e8b840', fillOpacity: 1,
      color: '#fff', weight: 1
    }).bindTooltip(`🚁 ${h.tags?.name || 'Helipad'}`).addTo(dmap);
  });

  // Official permanent UAS restriction zones from local NATS-derived GeoJSON
  fetch('data/nats-uas-zones.geojson')
    .then(res => {
      if (!res.ok) throw new Error('NATS UAS GeoJSON not found');
      return res.json();
    })
    .then(geojson => {


      // Split into core + advanced zones
const coreFeatures = geojson.features.filter(f => {
  const name = String(
    f.properties?.name ||
    f.properties?.Name ||
    f.properties?.TXT_NAME ||
    f.properties?.designator ||
    f.properties?.Designator ||
    ''
  ).toUpperCase();

  return (
    name.startsWith('EGP') ||     // Prohibited
    name.startsWith('EGR') ||     // Restricted / FRZ
    name.startsWith('EGD')        // Danger
  ) && !name.includes('CORRIDOR');
});

const advancedFeatures = geojson.features.filter(f => !coreFeatures.includes(f));

const coreGeojson = { ...geojson, features: coreFeatures };
const advancedGeojson = { ...geojson, features: advancedFeatures };

const matchingZones = findNatsZonesAtPoint(coreGeojson, lat, lon);
const nearbyZones = findNatsZonesNearPoint(coreGeojson, lat, lon, 1000);

const matchingZoneFamilies = new Set(matchingZones.map(z => z.family));
const nearbyZoneFamilies = new Set(nearbyZones.map(z => z.family));

const advancedBtn = document.getElementById('drone-map-advanced-btn');
let advancedLayer = null;
let advancedVisible = false;

if (advancedBtn) {
  advancedBtn.addEventListener('click', () => {
    if (!advancedVisible) {
      advancedLayer = L.geoJSON(advancedGeojson, {
        style: feature => {
          const zone = getNatsZoneInfo(feature);

          return {
            color: zone.color,
            weight: 1.5,
            fillColor: zone.color,
            fillOpacity: 0.08,
            dashArray: '4 4'
          };
        },
        onEachFeature: (feature, layer) => {
          const zone = getNatsZoneInfo(feature);
          layer.bindTooltip(`
            ⚪ Advanced airspace zone<br>
            <strong>${zone.displayName || zone.name}</strong><br>
            <span style="font-size:0.72rem;color:#666;">${zone.name}</span>
          `);
        }
      }).addTo(dmap);

      advancedBtn.classList.add('active');
      advancedBtn.textContent = 'Advanced zones';
      advancedVisible = true;
    } else {
      if (advancedLayer) dmap.removeLayer(advancedLayer);
      advancedBtn.classList.remove('active');
      advancedBtn.textContent = 'Advanced zones';
      advancedVisible = false;
    }
  });
}

const natsLayer = L.geoJSON(coreGeojson, {
        style: feature => {
          const zone = getNatsZoneInfo(feature);
          const isMatching = matchingZoneFamilies.has(zone.family);
          const isNearby = nearbyZoneFamilies.has(zone.family);

          return {
            color: isMatching ? zone.activeColor : isNearby ? zone.activeColor : zone.color,
            weight: isMatching ? 4 : isNearby ? 3 : 2,
            fillColor: isMatching ? zone.activeColor : isNearby ? zone.activeColor : zone.color,
            fillOpacity: isMatching ? 0.26 : isNearby ? 0.18 : zone.fillOpacity,
            dashArray: isMatching || isNearby ? null : zone.dashArray
          };
        },
        onEachFeature: (feature, layer) => {
          const zone = getNatsZoneInfo(feature);

          const icon =
            zone.severity === 'high' ? '🔴' :
            zone.severity === 'medium' ? '🟠' :
            '⚪';

          layer.bindTooltip(`
            ${icon} ${zone.type}<br>
            <strong>${zone.displayName}</strong><br>
            <span style="font-size:0.72rem;color:#666;">${zone.name}</span>
          `);
        }
      }).addTo(dmap);

      const alertEl = document.getElementById('drone-zone-alert');

      if (alertEl && !matchingZones.length && nearbyZones.length) {
        const closestZone = nearbyZones[0];
        const nearbyNames = nearbyZones.slice(0, 3).map(z => `${z.displayName} <span style="font-size:0.76rem;color:#8a5b45;">(${z.name})</span>`).join(', ');

        alertEl.style.display = 'block';
        alertEl.innerHTML = `
          <strong>🟡 Nearby UAS restriction zone</strong><br>
          This point is approximately <strong>${formatDroneMetersDistance(closestZone.distanceMeters)}</strong> from the nearest mapped boundary of:
          <strong>${nearbyNames}</strong>.<br>
          Boundaries can be complex around airports, so treat nearby areas with caution. Verify with Drone Assist, the CAA Drone Map and NOTAMs before flying.
        `;
      }

      if (alertEl && matchingZones.length) {
        const zonesWithInfo = matchingZones.map(z => {
          const feature = geojson.features.find(f => {
            const props = f.properties || {};
            const name =
              props.name ||
              props.Name ||
              props.TXT_NAME ||
              props.designator ||
              props.Designator ||
              props.id ||
              'UAS restriction zone';
            return name === z.name;
          });
          return feature ? getNatsZoneInfo(feature) : { name: z.name, severity: 'high', type: 'UAS restriction' };
        });

        const highestSeverity = zonesWithInfo.some(z => z.severity === 'high')
          ? 'high'
          : zonesWithInfo.some(z => z.severity === 'medium')
          ? 'medium'
          : 'info';

        const icon =
          highestSeverity === 'high' ? '🔴' :
          highestSeverity === 'medium' ? '🟠' :
          '⚪';

        const headline =
          highestSeverity === 'high'
            ? 'Restricted / prohibited airspace detected'
            : highestSeverity === 'medium'
            ? 'Danger area detected'
            : 'Airspace of interest detected';

        const zoneNames = zonesWithInfo.slice(0, 3).map(z => `${z.displayName} <span style="font-size:0.76rem;color:#8a5b45;">(${z.name})</span>`).join(', ');

        alertEl.style.display = 'block';
        alertEl.innerHTML = `
          <strong>${icon} ${headline}</strong><br>
          This point appears to be inside: <strong>${zoneNames}</strong>.<br>
          Treat this as permission-required airspace unless confirmed otherwise. Always verify with Drone Assist, the CAA Drone Map and NOTAMs before flying.
        `;
      }

            updateDroneAirspaceStatusFromNats(matchingZones, nearbyZones);

      if (natsLayer.getBounds && natsLayer.getBounds().isValid()) {
        console.info('NATS UAS zones loaded');
      }
    })
    .catch(err => {
      console.warn('NATS UAS zones not loaded:', err.message);
    });
}

/* ── NATS ZONE CLASSIFICATION ───────────────────────────*/
function getNatsZoneInfo(feature) {
  const props = feature?.properties || {};
  const rawName =
    props.name ||
    props.Name ||
    props.TXT_NAME ||
    props.designator ||
    props.Designator ||
    props.id ||
    'UAS restriction zone';

    const name = String(rawName);
  const upper = name.toUpperCase();
  const family = getNatsZoneFamily(name);
  const displayName = getNatsZoneDisplayName(name, family);

  if (upper.startsWith('EGP') || upper.includes('PROHIBITED')) {
    return {
      name,
      family,
      displayName,
      type: 'Prohibited area',
      severity: 'high',
      color: '#b91c1c',
      activeColor: '#7f1d1d',
      fillOpacity: 0.18,
      dashArray: null
    };
  }

  if (upper.startsWith('EGR') || upper.includes('RESTRICTED') || upper.includes('FRZ')) {
    return {
      name,
      family,
      displayName,
      type: 'Restricted / FRZ area',
      severity: 'high',
      color: '#c84820',
      activeColor: '#9f2f13',
      fillOpacity: 0.16,
      dashArray: null
    };
  }

  if (upper.startsWith('EGD') || upper.includes('DANGER')) {
    return {
      name,
      family,
      type: 'Danger area',
      severity: 'medium',
      color: '#e8a11a',
      activeColor: '#b7791f',
      fillOpacity: 0.14,
      dashArray: '6 4'
    };
  }

  return {
    name,
    family,
    displayName,
    type: 'Other UAS restriction',
    severity: 'info',
    color: '#64748b',
    activeColor: '#334155',
    fillOpacity: 0.1,
    dashArray: '4 4'
  };
}

/* ── NATS ZONE POINT CHECK ──────────────────────────────*/
function getNatsZoneDisplayName(name, family) {
  const cleanName = String(name || '').toUpperCase();
  const cleanFamily = String(family || '').toUpperCase();

  if (cleanFamily === 'HEATHROW') return 'London Heathrow restricted airspace';
  if (cleanFamily === 'NORTHOLT') return 'RAF Northolt restricted airspace';
  if (cleanFamily === 'CITY') return 'London City restricted airspace';
  if (cleanFamily === 'GATWICK') return 'London Gatwick restricted airspace';
  if (cleanFamily === 'STANSTED') return 'London Stansted restricted airspace';
  if (cleanFamily === 'LUTON') return 'London Luton restricted airspace';
  if (cleanFamily === 'BIGGIN HILL') return 'London Biggin Hill restricted airspace';

  return String(name || 'UAS restriction zone')
    .replace(/^EG[A-Z0-9]+\s+/i, '')
    .replace(/\s+RWY\s+\d{2}[LRC]?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNatsZoneFamily(name) {
  const clean = String(name || 'UAS restriction zone')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

  // Group runway-specific Heathrow zones so the whole related FRZ family highlights together.
  // Example: "EGRIU028B LONDON HEATHROW RWY 09L" → "LONDON HEATHROW"
  const airportMatch = clean.match(/LONDON\s+(HEATHROW|CITY|GATWICK|STANSTED|LUTON|BIGGIN HILL)/);
  if (airportMatch) return airportMatch[0];

  return clean
    .replace(/\s+RWY\s+\d{2}[LRC]?/g, '')
    .replace(/\s+RUNWAY\s+\d{2}[LRC]?/g, '')
    .replace(/\s+[A-Z]$/, '')
    .trim();
}

function updateDroneAirspaceStatusFromNats(matchingZones, nearbyZones) {
  const cardBadge = document.getElementById('drone-card-badge');
  const mapLabel = document.getElementById('drone-map-label');
  const label = document.getElementById('drone-airspace-label');
  const note = document.getElementById('drone-airspace-note');
  const icon = document.querySelector('.as-icon');

  if (!cardBadge || !label || !note || !icon) return;

  if (mapLabel) {
    mapLabel.classList.remove('drone-map-label-clear', 'drone-map-label-warn', 'drone-map-label-flag');
  }

  if (matchingZones.length) {
    const highestSeverity = matchingZones.some(z => z.severity === 'high')
      ? 'high'
      : matchingZones.some(z => z.severity === 'medium')
      ? 'medium'
      : 'info';

    const zoneNames = matchingZones.slice(0, 2).map(z => z.name).join(', ');

    cardBadge.className = highestSeverity === 'high' ? 'card-badge b-flag' : 'card-badge b-warn';
        if (mapLabel) {
      mapLabel.classList.add(highestSeverity === 'high' ? 'drone-map-label-flag' : 'drone-map-label-warn');
    }
    cardBadge.textContent = highestSeverity === 'high' ? 'Restricted' : 'Caution';

    icon.textContent = highestSeverity === 'high' ? '🔴' : '🟠';
    label.textContent = highestSeverity === 'high'
  ? 'Restricted airspace detected'
  : 'Nearby airspace caution';

    const displayNames = matchingZones.slice(0, 2).map(z => z.displayName || z.name).join(', ');
    note.textContent = `Selected point appears to be inside ${displayNames}. Permission is likely required — verify on Drone Assist, the CAA Drone Map and NOTAMs before flying.`;
    return;
  }

  if (nearbyZones.length) {
    const closestZone = nearbyZones[0];

    cardBadge.className = 'card-badge b-warn';
        if (mapLabel) {
      mapLabel.classList.add('drone-map-label-warn');
    }
    cardBadge.textContent = 'Caution';

    icon.textContent = '🟡';
    label.textContent = 'Nearby UAS restriction zone';
    note.textContent = `Selected point is approximately ${formatDroneMetersDistance(closestZone.distanceMeters)} from ${closestZone.displayName || closestZone.name}. Check exact boundaries — nearby airport airspace can be complex.`;
    return;
  }

  if (mapLabel) {
    const hasExistingWarning =
      cardBadge.classList.contains('b-warn') ||
      cardBadge.classList.contains('b-flag');

    mapLabel.classList.add(hasExistingWarning ? 'drone-map-label-warn' : 'drone-map-label-clear');
  }
}

function findNatsZonesAtPoint(geojson, lat, lon) {
  if (!geojson || !Array.isArray(geojson.features)) return [];

  return geojson.features
    .filter(feature => isPointInsideGeoJSONFeature(lon, lat, feature))
    .map(feature => getNatsZoneInfo(feature));
}

function isPointInsideGeoJSONFeature(lon, lat, feature) {
  const geometry = feature?.geometry;
  if (!geometry) return false;

  if (geometry.type === 'Polygon') {
    return pointInPolygonWithHoles(lon, lat, geometry.coordinates);
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(polygon =>
      pointInPolygonWithHoles(lon, lat, polygon)
    );
  }

  return false;
}

function pointInPolygonWithHoles(lon, lat, rings) {
  if (!Array.isArray(rings) || !rings.length) return false;

  const insideOuterRing = pointInRingSet(lon, lat, rings[0]);
  if (!insideOuterRing) return false;

  const insideHole = rings.slice(1).some(ring => pointInRingSet(lon, lat, ring));
  return !insideHole;
}

function findNatsZonesNearPoint(geojson, lat, lon, thresholdMeters = 1000) {
  if (!geojson || !Array.isArray(geojson.features)) return [];

  return geojson.features
    .map(feature => {
      if (isPointInsideGeoJSONFeature(lon, lat, feature)) return null;

      const distanceMeters = distanceToGeoJSONFeatureMeters(lon, lat, feature);
      if (distanceMeters > thresholdMeters) return null;

      return {
        ...getNatsZoneInfo(feature),
        distanceMeters
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function distanceToGeoJSONFeatureMeters(lon, lat, feature) {
  const geometry = feature?.geometry;
  if (!geometry) return Infinity;

  if (geometry.type === 'Polygon') {
    return distanceToPolygonMeters(lon, lat, geometry.coordinates);
  }

  if (geometry.type === 'MultiPolygon') {
    return Math.min(...geometry.coordinates.map(polygon =>
      distanceToPolygonMeters(lon, lat, polygon)
    ));
  }

  return Infinity;
}

function distanceToPolygonMeters(lon, lat, rings) {
  if (!Array.isArray(rings) || !rings.length) return Infinity;

  return Math.min(...rings.map(ring => distanceToRingMeters(lon, lat, ring)));
}

function distanceToRingMeters(lon, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 2) return Infinity;

  let minDistance = Infinity;

  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];

    if (!a || !b) continue;

    const dist = distancePointToSegmentMeters(
      lat,
      lon,
      a[1],
      a[0],
      b[1],
      b[0]
    );

    minDistance = Math.min(minDistance, dist);
  }

  return minDistance;
}

function distancePointToSegmentMeters(lat, lon, lat1, lon1, lat2, lon2) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos(lat * Math.PI / 180);

  const px = lon * metersPerDegreeLon;
  const py = lat * metersPerDegreeLat;
  const ax = lon1 * metersPerDegreeLon;
  const ay = lat1 * metersPerDegreeLat;
  const bx = lon2 * metersPerDegreeLon;
  const by = lat2 * metersPerDegreeLat;

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));

  const closestX = ax + t * dx;
  const closestY = ay + t * dy;

  return Math.hypot(px - closestX, py - closestY);
}

function pointInRingSet(lon, lat, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersects =
      ((yi > lat) !== (yj > lat)) &&
      (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);

    if (intersects) inside = !inside;
  }

  return inside;
}

function formatWindMsAsMph(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const mph = ms * 2.23694;
  return `${Math.round(mph)}mph`;
}

function formatDroneWindKmh(kmh) {
  if (kmh === null || kmh === undefined || !Number.isFinite(kmh)) return '—';

  const mph = kmh * 0.621371;

  return `${Math.round(mph)}mph (${Math.round(kmh)}km/h)`;
}

function formatDroneTextDistances(text) {
  if (!text) return '';

  return String(text)
    // Convert km → miles
    .replace(/(\d+(?:\.\d+)?)\s*km\b/gi, (_, value) => {
      return formatDroneDistance(Number(value));
    })
    // Convert m → m + ft
    .replace(/(\d+(?:\.\d+)?)\s*m\b/gi, (_, value) => {
      const metres = Number(value);
      const feet = Math.round(metres * 3.28084);
      return `${Math.round(metres)}m / ${feet}ft`;
    });
}

function formatDroneMetersDistance(metres) {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return '—';

  const roundedMetres = Math.round(metres);

  if (roundedMetres < 1609) {
    const feet = Math.round(roundedMetres * 3.28084);
    return `${roundedMetres}m / ${feet}ft`;
  }

  const miles = roundedMetres / 1609.344;

  if (miles < 10) {
    return `${Math.round(miles * 10) / 10} miles`;
  }

  return `${Math.round(miles)} miles`;
}

function formatDroneDistance(km) {
  if (km === null || km === undefined || !Number.isFinite(km)) return '—';

  const metres = Math.round(km * 1000);

  if (metres < 1000) {
    const feet = Math.round(metres * 3.28084);
    return `${metres}m / ${feet}ft`;
  }

  const miles = km * 0.621371;

  if (miles < 10) {
    return `${Math.round(miles * 10) / 10} miles`;
  }

  return `${Math.round(miles)} miles`;
}

/* ── DRONE URBAN / BUILT-UP CAUTION ─────────────────────*/
function buildDroneUrbanCaution(address, features) {
  const addr = address?.address || address || {};

  const hasUrbanAddress =
    addr.city ||
    addr.town ||
    addr.suburb ||
    addr.city_district ||
    addr.borough ||
    addr.neighbourhood ||
    addr.quarter;

  const urbanFeatureCount = (features || []).filter(f => {
    const tags = f.tags || {};

    return (
      tags.highway === 'residential' ||
      tags.highway === 'primary' ||
      tags.highway === 'secondary' ||
      tags.highway === 'tertiary' ||
      tags.landuse === 'residential' ||
      tags.landuse === 'commercial' ||
      tags.landuse === 'retail' ||
      tags.building
    );
  }).length;

  const isUrban = hasUrbanAddress || urbanFeatureCount >= 8;

  if (!isUrban) return '';

  return `
    <div class="drone-urban">
      <div class="card-label">🏙 Built-up area</div>
      <div class="drone-urban-note">
        Urban or suburban location detected. Drone operations may require the appropriate category, safe separation from people, and permission for take-off and landing.
      </div>
    </div>
  `;
}

/* ── DRONE SENSITIVE SITES ──────────────────────────────*/
function buildDroneSensitiveSites(lat, lon, features) {
  const sensitive = [];

  features.forEach(f => {
    const tags = f.tags || {};
    const points = [];

    if (f.lat && f.lon) points.push({ lat: f.lat, lon: f.lon });
    if (f.center?.lat && f.center?.lon) points.push({ lat: f.center.lat, lon: f.center.lon });
    if (Array.isArray(f.geometry)) points.push(...f.geometry);

    if (!points.length) return;

    let type = '';
    let icon = '';
    let priority = 99;

    if (tags.amenity === 'prison') {
      type = 'Prison / secure facility';
      icon = '🚨';
      priority = 1;
    } else if (tags.landuse === 'military' || tags.military) {
      type = 'Military site';
      icon = '🪖';
      priority = 2;
    } else if (tags.aeroway === 'helipad') {
      type = 'Helipad';
      icon = '🚁';
      priority = 3;
    } else if (tags.amenity === 'hospital') {
      type = 'Hospital';
      icon = '🏥';
      priority = 4;
    } else if (tags.power === 'plant' || tags.generator_source === 'nuclear') {
      type = 'Power / critical infrastructure';
      icon = '⚡';
      priority = 5;
    } else if (tags.amenity === 'police') {
      type = 'Police site';
      icon = '👮';
      priority = 6;
    }

    if (!type) return;

    const nearest = points.reduce((best, p) => {
      if (!p.lat || !p.lon) return best;
      const dist = haversineDistance(lat, lon, p.lat, p.lon);
      return dist < best ? dist : best;
    }, Infinity);

    if (!Number.isFinite(nearest) || nearest > 1.5) return;

    sensitive.push({
      type,
      icon,
      priority,
      name: tags.name || type,
      dist: nearest
    });
  });

  const unique = [];
  sensitive
    .sort((a, b) => a.priority - b.priority || a.dist - b.dist)
    .forEach(item => {
      const key = `${item.type}-${String(item.name).toLowerCase()}`;
      if (!unique.some(u => u.key === key)) {
        unique.push({ ...item, key });
      }
    });

  if (!unique.length) return '';

  const rows = unique.slice(0, 5).map(item => `
    <div class="drone-sensitive-item">
      <span>${item.icon}</span>
      <span><strong>${item.type}</strong> — ${item.name}</span>
      <span>${formatDroneDistance(item.dist)}</span>
    </div>
  `).join('');

  return `
    <div class="drone-sensitive-sites">
      <div class="card-label">Nearby sensitive sites</div>
      <div class="drone-sensitive-note">
        These are not always no-fly zones, but may need extra caution, permissions, privacy checks, or operational planning.
      </div>
      ${rows}
    </div>`;
}

/* ── DRONE WIND MATRIX ──────────────────────────────────*/
function buildDroneWindMatrix(gusts, windSpeed, rain, temp) {
  const models = [
    { name: 'DJI Mini 4 Pro',  maxWind: 10.7, maxTemp: 40, minTemp: -10, waterproof: false },
    { name: 'DJI Mini 3 Pro',  maxWind: 10.7, maxTemp: 40, minTemp: -10, waterproof: false },
    { name: 'DJI Air 3',       maxWind: 12,   maxTemp: 40, minTemp: -10, waterproof: false },
    { name: 'DJI Mavic 3',     maxWind: 12,   maxTemp: 40, minTemp: -10, waterproof: false },
    { name: 'DJI Mavic 3 Pro', maxWind: 12,   maxTemp: 40, minTemp: -10, waterproof: false },
    { name: 'DJI Inspire 3',   maxWind: 12,   maxTemp: 40, minTemp: -10, waterproof: false },
    { name: 'Autel Evo Lite+', maxWind: 10,   maxTemp: 40, minTemp: -10, waterproof: false },
    { name: 'Autel Evo II Pro', maxWind: 12,  maxTemp: 40, minTemp: -10, waterproof: false },
  ];

  const gustsMs = gusts / 3.6;
  const isRaining = rain > 0;

  const rows = models.map(m => {
    const windOk = gustsMs < m.maxWind;
    const tempOk = temp >= m.minTemp && temp <= m.maxTemp;
    const rainOk = !isRaining || m.waterproof;
    const allOk = windOk && tempOk && rainOk;
    const marginal = !allOk && gustsMs < m.maxWind * 1.2 && tempOk;

    const status = allOk ? 'ok' : marginal ? 'warn' : 'flag';
    const label = allOk ? '✓ Flyable' : marginal ? '⚠ Marginal' : '✗ Not recommended';

    const issues = [];
    if (!windOk) issues.push(`Gusts ${gustsMs.toFixed(1)}m/s > max ${m.maxWind}m/s`);
    if (!tempOk) issues.push('Temp out of range');
    if (!rainOk) issues.push('Rain — not waterproof');

    return `<tr>
      <td class="dm-name">${m.name}</td>
      <td>${m.maxWind}m/s</td>
      <td class="dm-status dm-${status}">${label}</td>
      <td>${issues.join(', ') || '—'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="drone-matrix">
      <div class="card-label" style="margin-bottom:0.5rem">Drone wind limits — selected shoot date</div>
      <div class="dm-conditions">
        Peak gusts: ${formatDroneWindKmh(gusts)} · Sustained wind: ${formatDroneWindKmh(windSpeed)} · ${rain > 0 ? '🌧 Rain' : '✓ Dry'} · ${formatTemp(temp)} min temp
      </div>

      <div class="data-table-wrap">
        <div class="data-table-scroll">
          <table class="data-table drone-wind-table">
            <thead>
              <tr><th>Model</th><th>Max wind</th><th>Status</th><th>Issues</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

/* ── UK DRONE LAW SUMMARY ───────────────────────────────*/
function buildDroneLawSummary() {
  const rules = [
    { icon: '📏', rule: 'Max altitude 120m (400ft) above ground level' },
    { icon: '👁', rule: 'Visual line of sight (VLOS) must be maintained at all times' },
    { icon: '👥', rule: 'Do not fly over uninvolved people without A2 CofC or higher' },
    { icon: '🏙', rule: 'Built-up areas require specific authorisation (A2 CofC minimum)' },
    { icon: '✈️', rule: 'Never fly in FRZ or controlled airspace without ATC permission' },
    { icon: '🌙', rule: 'Night flying requires specific authorisation' },
    { icon: '📋', rule: 'CAA Operator ID required — must be displayed on drone (£10.33/yr)' },
    { icon: '🎓', rule: 'Flyer ID required — free online theory test' },
    { icon: '📸', rule: 'Commercial operations require GVC or equivalent qualification' },
    { icon: '🔒', rule: 'GDPR applies — filming people requires consideration of privacy' },
  ];

  const rulesHTML = rules.map(r => `
    <div class="drone-rule">
      <span class="dr-icon">${r.icon}</span>
      <span class="dr-text">${r.rule}</span>
    </div>`).join('');

  return `
    <div class="drone-law-wrap">
      <div class="drone-law-head" onclick="this.parentElement.classList.toggle('open')">
        <span class="card-label">UK drone law — quick reference</span>
        <span class="expand-arrow">▼</span>
      </div>
      <div class="drone-law-body">
        ${rulesHTML}
        <div class="drone-law-disclaimer">This is a simplified summary only. Always check the latest CAA guidance before flying. Rules change — verify at caa.co.uk/drones</div>
      </div>
    </div>`;
}

/* ── QUICK LINKS ────────────────────────────────────────*/
function buildDroneQuickLinks(lat, lon) {
  return quickLinks([
    { label: 'Drone Assist',    url: 'https://dronesafe.uk/' },
    { label: 'DJI Fly Safe',   url: `https://fly-safe.dji.com/map#lat=${lat}&lng=${lon}` },
    { label: 'CAA Drone Map',  url: 'https://map.caa.co.uk/drone-map/' },
    { label: 'NATS NOTAMs',    url: 'https://www.notaminfo.com/ukmap' },
    { label: 'OpenAIP',        url: `https://www.openaip.net/map#12/${lat}/${lon}` },
    { label: 'CAA Operator ID',url: 'https://register.caa.co.uk/' },
  ]);
}
