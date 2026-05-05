/* ════════════════════════════════════════════════════════
   LOCATION CHECK — map.js
   Interactive satellite map with sun direction overlay,
   multiple overlays, terrain data, congestion indicator.
   ════════════════════════════════════════════════════════ */

let _map = null;
let _satLayer = null;
let _streetLayer = null;
let _mapSunLayer = null;
let _mapMode = 'satellite';
let _renderSunOverlay = null;
let centerMarker = null;
let _mapSunVisible = true;
let _sunRedrawTimer = null;

let _overlays = {
  row:   { layer: null, visible: false, btn: 'ctrl-row' },
  flood: { layer: null, visible: false, btn: 'ctrl-flood' },
  park:  { layer: null, visible: false, btn: 'ctrl-park' },
  power: { layer: null, visible: false, btn: 'ctrl-power' },
};

function buildMap(data) {
  const { lat, lon, date, features, elevation, address } = data;

  const wrapper = document.createElement('div');
  wrapper.appendChild(sectionHead('Map & Location'));

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <span class="card-label">Location overview</span>
      <span class="card-badge b-neu">${new Date(date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })}</span>
    </div>

    <div class="card-body info-stack">
      <div class="map-card location-map-card">
        <div class="map-card-head">
          <span class="card-label">Location map</span>
        </div>

        <div class="map-frame location-map-frame">
          <div id="map"></div>
        </div>

        <div class="map-controls">
          <button class="map-ctrl-btn active" id="ctrl-satellite" onclick="setMapLayer('satellite')">Satellite</button>
          <button class="map-ctrl-btn" id="ctrl-street" onclick="setMapLayer('street')">Standard</button>
          <div class="map-ctrl-sep"></div>
          <button class="map-ctrl-btn active" id="ctrl-sun" onclick="toggleMapSunOverlay()">Sun dial</button>
        </div>
      </div>

      ${buildTerrainData(lat, lon, features, elevation, address)}
      ${buildCongestionIndicator(features, address)}
      ${buildQuickLinks(lat, lon)}
    </div>
  `;

  wrapper.appendChild(card);
  return wrapper;
}

function initMap(data) {
  const { lat, lon, date, features, weatherData } = data;

  if (_map) {
    _map.off();
    _map.remove();
    _map = null;
  }

  if (_sunRedrawTimer) {
    clearTimeout(_sunRedrawTimer);
    _sunRedrawTimer = null;
  }

  _mapSunLayer = null;
  centerMarker = null;
  _mapMode = 'satellite';
  _mapSunVisible = true;

  Object.keys(_overlays).forEach(k => {
    _overlays[k].layer = null;
    _overlays[k].visible = false;
  });

  _map = L.map('map', {
    center: [lat, lon],
    zoom: 18,
    zoomControl: true,
    scrollWheelZoom: true
  });

  _satLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri World Imagery', maxZoom: 19 }
  ).addTo(_map);

  _streetLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap', maxZoom: 19 }
  );

  const markerLabel = STATE.location || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  centerMarker = L.circleMarker([lat, lon], {
    radius: 9,
    fillColor: '#ffffff',
    fillOpacity: 1,
    color: '#111110',
    weight: 2.5
  }).bindTooltip(`📍 ${markerLabel}`).addTo(_map);

    _renderSunOverlay = function () {
    if (_sunRedrawTimer) {
      clearTimeout(_sunRedrawTimer);
    }

    _sunRedrawTimer = setTimeout(() => {
      if (!_map) return;
      drawMapSunArrows(_map, lat, lon, date, weatherData);
    }, 80);
  };

drawMapSunArrows(_map, lat, lon, date, weatherData);
  _map.on('zoomend resize moveend', _renderSunOverlay);

  _overlays.row.layer   = buildRowLayer(features);
  _overlays.flood.layer = buildFloodLayer(lat, lon, features);
  _overlays.park.layer  = buildParkLayer(features);
  _overlays.power.layer = buildPowerLayer(features);
}

function setMapLayer(type) {
  if (!_map) return;

  _mapMode = type;

  document.getElementById('ctrl-satellite')?.classList.toggle('active', type === 'satellite');
  document.getElementById('ctrl-street')?.classList.toggle('active', type === 'street');

  if (type === 'satellite') {
    if (_streetLayer && _map.hasLayer(_streetLayer)) _map.removeLayer(_streetLayer);
    if (_satLayer && !_map.hasLayer(_satLayer)) _satLayer.addTo(_map);
  } else {
    if (_satLayer && _map.hasLayer(_satLayer)) _map.removeLayer(_satLayer);
    if (_streetLayer && !_map.hasLayer(_streetLayer)) _streetLayer.addTo(_map);
  }

  if (centerMarker) {
    centerMarker.setStyle({
      fillColor: type === 'street' ? '#111110' : '#ffffff',
      color: type === 'street' ? '#ffffff' : '#111110'
    });
    centerMarker.bringToFront();
  }

  if (typeof _renderSunOverlay === 'function') {
    _renderSunOverlay();
  }
}

function toggleMapSunOverlay() {
  if (!_map) return;

  _mapSunVisible = !_mapSunVisible;
  document.getElementById('ctrl-sun')?.classList.toggle('active', _mapSunVisible);

    if (_mapSunVisible) {
    if (typeof _renderSunOverlay === 'function') {
      _renderSunOverlay();
    }
  } else if (_mapSunLayer) {
    _mapSunLayer.clearLayers();

    if (_map.hasLayer(_mapSunLayer)) {
      _map.removeLayer(_mapSunLayer);
    }

    _mapSunLayer = null;
  }
}

function toggleOverlay(key) {
  if (!_map) return;

  const ov = _overlays[key];
  if (!ov || !ov.layer) return;

  ov.visible = !ov.visible;
  document.getElementById(ov.btn)?.classList.toggle('active', ov.visible);

  if (ov.visible) {
    ov.layer.addTo(_map);
  } else {
    _map.removeLayer(ov.layer);
  }
}

function getMapSunHourlyWeather(weatherData, dateStr) {
  if (!weatherData?.hourly?.time) return null;

  const startIdx = weatherData.hourly.time.findIndex(t => t && t.startsWith(dateStr));
  if (startIdx < 0) return null;

  const hourly = [];

  for (let i = 0; i < 24; i++) {
    const idx = startIdx + i;

    hourly.push({
      cloud: weatherData.hourly.cloudcover?.[idx] ?? null,
      rainProb: weatherData.hourly.precipitation_probability?.[idx] ?? null,
      weatherCode: weatherData.hourly.weathercode?.[idx] ?? null
    });
  }

  return hourly;
}

function getMapSunWeatherIcon(hourWeather) {
  if (!hourWeather) return '';

  const code = hourWeather.weatherCode ?? 0;
  const wx = weatherCodeInfo(code, false);

  return wx.icon || '';
}

function getMapSunWeatherTooltip(hourWeather) {
  if (!hourWeather) return '';

  const parts = [];

  if (hourWeather.cloud !== null) {
    parts.push(`${hourWeather.cloud}% cloud`);
  }

  if (hourWeather.rainProb !== null && hourWeather.rainProb > 10) {
    parts.push(`${hourWeather.rainProb}% rain`);
  }

  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

/* ── SUN DIRECTION ARROWS (SunCalc style) ─────────────── */
function drawMapSunArrows(map, lat, lon, dateStr, weatherData) {
  if (!map) return;

  if (_mapSunLayer) {
    _mapSunLayer.clearLayers();

    if (map.hasLayer(_mapSunLayer)) {
      map.removeLayer(_mapSunLayer);
    }

    _mapSunLayer = null;
  }

  if (!_mapSunVisible) return;

  const hourlyWeather = getMapSunHourlyWeather(weatherData, dateStr);

  _mapSunLayer = L.layerGroup().addTo(map);
  const layers = _mapSunLayer;

  const center = L.latLng(lat, lon);
  const centerPt = map.latLngToContainerPoint(center);
  const mapSize = map.getSize();

  const radiusPx = Math.min(mapSize.x, mapSize.y) * 0.40;
  const lineRadiusPx = radiusPx * 0.90;
  const labelRadiusPx = radiusPx * 0.98;
  const minGapMinutes = 45;

  const baseDate = new Date(`${dateStr}T12:00:00`);
  const times = SunCalc.getTimes(baseDate, lat, lon);

  if (!times.sunrise || !times.sunset) return;

  const sunrise = times.sunrise;
  const sunset = times.sunset;
  const goldenStart = times.goldenHour && times.goldenHour < sunset ? times.goldenHour : null;

  const points = [];

  function minsBetween(a, b) {
    return Math.abs((b - a) / 60000);
  }

  function formatTime(d) {
    return d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false
    });
  }

  points.push({
    type: 'sunrise',
    date: sunrise,
    label: formatTime(sunrise)
  });

  const firstHourly = new Date(sunrise);
  firstHourly.setHours(firstHourly.getHours() + 1, 0, 0, 0);

  const hourlyCutoff = goldenStart || sunset;

  for (let d = new Date(firstHourly); d < hourlyCutoff; d.setHours(d.getHours() + 1)) {
    const pointDate = new Date(d);

    if (minsBetween(sunrise, pointDate) < minGapMinutes) continue;
    if (goldenStart && minsBetween(pointDate, goldenStart) < minGapMinutes) continue;
    if (!goldenStart && minsBetween(pointDate, sunset) < minGapMinutes) continue;

    points.push({
      type: 'hour',
      date: pointDate,
      label: formatTime(pointDate)
    });
  }

  if (goldenStart && minsBetween(goldenStart, sunset) >= minGapMinutes) {
    points.push({
      type: 'golden',
      date: goldenStart,
      label: formatTime(goldenStart)
    });
  }

  points.push({
    type: 'sunset',
    date: sunset,
    label: formatTime(sunset)
  });

  points.forEach(point => {
    const pointHour = point.date.getHours();
    const pointWeather = hourlyWeather?.[pointHour] || null;
    const wxIcon = getMapSunWeatherIcon(pointWeather);
    const wxTooltip = getMapSunWeatherTooltip(pointWeather);

    const pos = SunCalc.getPosition(point.date, lat, lon);
    const azDeg = (pos.azimuth * 180 / Math.PI + 180) % 360;
    const altDeg = pos.altitude * 180 / Math.PI;
    const azRad = azDeg * Math.PI / 180;

    const endPt = L.point(
      centerPt.x + lineRadiusPx * Math.sin(azRad),
      centerPt.y - lineRadiusPx * Math.cos(azRad)
    );

    const labelPt = L.point(
      centerPt.x + labelRadiusPx * Math.sin(azRad),
      centerPt.y - labelRadiusPx * Math.cos(azRad)
    );

    const endLatLng = map.containerPointToLatLng(endPt);
    const labelLatLng = map.containerPointToLatLng(labelPt);

    let color = _mapMode === 'street' ? '#111110' : '#ffffff';
    let weight = 1.5;
    let opacity = _mapMode === 'street' ? 0.9 : 0.7;

    // Satellite = white pill / black text. Standard = black pill / white text.
    let bg = _mapMode === 'street'
      ? 'rgba(0,0,0,0.82)'
      : 'rgba(255,255,255,0.92)';

    let fg = _mapMode === 'street'
      ? '#ffffff'
      : '#111110';

    if (point.type === 'sunrise' || point.type === 'golden') {
      color = '#e8b840';
      weight = 3;
      opacity = 0.95;
      bg = 'rgba(232,184,64,0.95)';
      fg = '#111';
    }

    if (point.type === 'sunset') {
      color = '#d96a2b';
      weight = 3;
      opacity = 0.95;
      bg = 'rgba(217,106,43,0.95)';
      fg = '#111';
    }

    L.polyline([center, endLatLng], {
      color,
      weight,
      opacity
    }).addTo(layers);

    const icon = L.divIcon({
      className: '',
      html: `<span style="
        background:${bg};
        color:${fg};
        font-size:10px;
        font-family:DM Mono, monospace;
        padding:2px 0;
        width:56px;
        text-align:center;
        border-radius:999px;
        white-space:nowrap;
        display:inline-block;
        box-sizing:border-box;
      ">${point.label}${wxIcon ? ' ' + wxIcon : ''}</span>`,
      iconSize: [56, 22],
      iconAnchor: [28, 11]
    });

    L.marker(labelLatLng, { icon })
      .bindTooltip(`${point.label} — ${compassDir(azDeg)} · ${Math.round(altDeg)}° elevation${wxTooltip}`)
      .addTo(layers);
  });

  if (centerMarker) {
    centerMarker.bringToFront();
  }
}

/* ── OVERLAY BUILDERS ─────────────────────────────────── */
function buildRowLayer(features) {
  const layer = L.layerGroup();

  features.forEach(f => {
    const isFP = f.tags?.highway === 'footway' ||
                 f.tags?.highway === 'path' ||
                 f.tags?.designation === 'public_footpath';

    const isBW = f.tags?.highway === 'bridleway' ||
                 f.tags?.designation === 'public_bridleway';

    if (!isFP && !isBW) return;

    let coords = null;
    if (f.geometry && f.geometry.length > 1) {
      coords = f.geometry.map(p => [p.lat, p.lon]);
    }
    if (!coords) return;

    L.polyline(coords, {
      color: isFP ? '#2a6644' : '#8b6914',
      weight: 2,
      opacity: 0.85,
      dashArray: '6 4'
    }).bindTooltip(isFP ? 'Public footpath' : 'Bridleway').addTo(layer);
  });

  return layer;
}

function buildFloodLayer(lat, lon, features) {
  const layer = L.layerGroup();

  features
    .filter(f =>
      f.tags?.waterway === 'river' ||
      f.tags?.waterway === 'stream' ||
      f.tags?.natural === 'water'
    )
    .forEach(f => {
      if (f.geometry && f.geometry.length > 1) {
        L.polyline(
          f.geometry.map(p => [p.lat, p.lon]),
          { color: '#4a7ec8', weight: 3, opacity: 0.7 }
        ).bindTooltip(f.tags?.name || f.tags?.waterway || 'Water').addTo(layer);
      }
    });

  const icon = L.divIcon({
    className: '',
    html: `<div style="background:rgba(74,126,200,0.85);color:#fff;font-size:10px;font-family:DM Mono,monospace;padding:3px 8px;border-radius:4px;cursor:pointer" onclick="window.open('https://check-long-term-flood-risk.service.gov.uk/map','_blank')">EA flood map ↗</div>`,
    iconSize: [120, 22],
    iconAnchor: [60, 11]
  });

  L.marker([lat + 0.003, lon], { icon }).addTo(layer);
  return layer;
}

function buildParkLayer(features) {
  const layer = L.layerGroup();

  features
    .filter(f =>
      f.tags?.boundary === 'national_park' ||
      f.tags?.boundary === 'protected_area' ||
      f.tags?.leisure === 'nature_reserve'
    )
    .forEach(f => {
      if (f.geometry && f.geometry.length > 2) {
        L.polygon(f.geometry.map(p => [p.lat, p.lon]), {
          color: '#2a6644',
          weight: 2,
          opacity: 0.8,
          fillColor: '#2a6644',
          fillOpacity: 0.1,
          dashArray: '8 4'
        }).bindTooltip(f.tags?.name || 'Protected area').addTo(layer);
      }
    });

  return layer;
}

function buildPowerLayer(features) {
  const layer = L.layerGroup();

  features
    .filter(f => f.tags?.power === 'tower' && f.lat && f.lon)
    .forEach(f => {
      L.circleMarker([f.lat, f.lon], {
        radius: 5,
        fillColor: '#8b2020',
        fillOpacity: 0.8,
        color: '#fff',
        weight: 1
      }).bindTooltip('Power tower / pylon').addTo(layer);
    });

  features
    .filter(f => f.tags?.power === 'line' && f.geometry && f.geometry.length > 1)
    .forEach(f => {
      L.polyline(
        f.geometry.map(p => [p.lat, p.lon]),
        { color: '#8b2020', weight: 2, opacity: 0.7, dashArray: '4 4' }
      ).bindTooltip('Power line').addTo(layer);
    });

  return layer;
}

function formatElevBoth(elevation) {
  const metres = Number(elevation);
  if (!Number.isFinite(metres)) return '—';

  const feet = Math.round(metres * 3.28084);
  return `${Math.round(metres)}m / ${feet}ft`;
}

/* ── TERRAIN DATA ─────────────────────────────────────── */
function formatDistMiles(km) {
  if (km === null || km === undefined || !Number.isFinite(km)) return '—';

  const miles = km * 0.621371;

  if (miles < 0.5) {
    const metres = Math.round(km * 1000);
    const feet = Math.round(metres * 3.28084);
    return `${metres} m / ${feet} ft`;
  }

  if (miles < 10) {
    return `${Math.round(miles * 10) / 10} miles`;
  }

  return `${Math.round(miles)} miles`;
}

function buildTerrainData(lat, lon, features, elevation, address) {
  const addr = address?.address || {};

  const town =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.suburb ||
    '—';

  function getCountyFallback(addr, town) {
    const rawCounty =
      addr.county ||
      addr.state_district ||
      '';

    if (rawCounty && rawCounty !== 'England') return rawCounty;

    const place = (
      addr.city ||
      addr.town ||
      addr.village ||
      town ||
      ''
    ).toLowerCase();

    const unitaryCountyMap = {
      'southampton': 'Hampshire',
      'portsmouth': 'Hampshire',
      'bournemouth': 'Dorset',
      'poole': 'Dorset',
      'christchurch': 'Dorset',
      'brighton': 'East Sussex',
      'hove': 'East Sussex',
      'reading': 'Berkshire',
      'bristol': 'Bristol',
      'bath': 'Somerset',
      'york': 'North Yorkshire',
      'nottingham': 'Nottinghamshire',
      'leicester': 'Leicestershire',
      'derby': 'Derbyshire'
    };

    return unitaryCountyMap[place] || '';
  }

  const county = getCountyFallback(addr, town);

  


  const locationPostcodeMatch = (STATE.location || '').match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i);

  const postcode = locationPostcodeMatch
    ? locationPostcodeMatch[0].toUpperCase()
    : (addr.postcode || '');

  const councilName =
    addr.borough ||
    addr.city ||
    addr.town ||
    addr.municipality ||
    addr.city_district ||
    addr.district ||
    addr.county ||
    addr.state_district ||
    '—';

  const councilSearch = councilName
    ? `https://www.google.com/search?q=${encodeURIComponent(councilName + ' council')}`
    : '';

  const filmingSearch = councilName
    ? `https://www.google.com/search?q=${encodeURIComponent(councilName + ' filming permits media office')}`
    : '';

  const coastalWaters = [];
  const inlandWaters = [];

  function cleanWaterName(name) {
  if (!name) return '';
  const lower = String(name).toLowerCase();

  if (
    lower === 'water' ||
    lower === 'river' ||
    lower === 'stream' ||
    lower === 'canal' ||
    lower === 'coastline' ||
    lower === 'beach' ||
    lower.startsWith('eilean ')
  ) {
    return '';
  }

  return String(name);
}

  function addUniqueWater(list, name, dist) {
    const cleanName = cleanWaterName(name);
    if (!cleanName || dist === null || dist === undefined || !Number.isFinite(dist)) return;

    const existing = list.find(w => w.name.toLowerCase() === cleanName.toLowerCase());

    if (!existing) {
      list.push({ name: cleanName, dist });
    } else if (dist < existing.dist) {
      existing.dist = dist;
    }
  }

  features.forEach(f => {
    const tags = f.tags || {};

    const rawName =
      tags.name ||
      tags['name:en'] ||
      '';

    const isNamed = !!rawName;

    const waterType = String(tags.water || '').toLowerCase();
    const naturalType = String(tags.natural || '').toLowerCase();
    const waterwayType = String(tags.waterway || '').toLowerCase();
    const placeType = String(tags.place || '').toLowerCase();
    const manMadeType = String(tags.man_made || '').toLowerCase();
    const landuseType = String(tags.landuse || '').toLowerCase();

    const isCoastal =
  naturalType === 'coastline' ||
  naturalType === 'beach' ||
  naturalType === 'bay' ||
  placeType === 'sea' ||
  placeType === 'bay' ||
  waterType === 'sea' ||
  waterType === 'tidal' ||
  waterType === 'estuary' ||
  waterwayType === 'dock' ||
  waterwayType === 'harbour' ||
  manMadeType === 'dock' ||
  landuseType === 'harbour';

    const isInland =
  waterwayType === 'river' ||
  waterwayType === 'canal' ||
  waterwayType === 'stream' ||
  waterwayType === 'tidal_channel' ||
  waterType === 'river' ||
  waterType === 'canal' ||
  waterType === 'lake' ||
  waterType === 'reservoir' ||
  waterType === 'pond' ||
  waterType === 'loch';

    const pts = [];

    if (f.lat && f.lon) {
      pts.push({ lat: f.lat, lon: f.lon });
    }

    if (f.center?.lat && f.center?.lon) {
      pts.push({ lat: f.center.lat, lon: f.center.lon });
    }

    if (f.geometry) {
      f.geometry.forEach(p => pts.push(p));
    }

    pts.forEach(p => {
      if (!p.lat || !p.lon) return;

      const d = haversineDistance(lat, lon, p.lat, p.lon);

      if (isNamed && isCoastal) {
        addUniqueWater(coastalWaters, rawName, d);
      }

      if (isNamed && isInland && !isCoastal) {
        addUniqueWater(inlandWaters, rawName, d);
      }
    });
  });


  coastalWaters.sort((a, b) => {
    if (a.dist === null && b.dist === null) return 0;
    if (a.dist === null) return 1;
    if (b.dist === null) return -1;
    return a.dist - b.dist;
  });

  inlandWaters.sort((a, b) => {
    if (a.dist === null && b.dist === null) return 0;
    if (a.dist === null) return 1;
    if (b.dist === null) return -1;
    return a.dist - b.dist;
  });

  const topCoastal = coastalWaters.slice(0, 2);

  const topInland = inlandWaters
    .filter(w => !/stream/i.test(w.name) || (w.dist !== null && w.dist < 0.2))
    .slice(0, 2);

  function renderWaterList(items) {
    return items
      .map(w => `${w.dist !== null ? formatDistMiles(w.dist) + ' · ' : ''}${w.name}`)
      .join('<br>');
  }

    return `<div class="terrain-grid info-grid-2">
    ${elevation !== null ? `<div class="terrain-item info-tile"><span class="terrain-label">Elevation</span><strong>${formatElevBoth(elevation)}</strong></div>` : ''}

    <div class="terrain-item info-tile">
      <span class="terrain-label">Coordinates</span>
      <strong>
        <span class="copy-coords" title="Copy coordinates" onclick="navigator.clipboard.writeText('${lat.toFixed(5)}, ${lon.toFixed(5)}').then(()=>{this.textContent='✓ Copied';setTimeout(()=>this.textContent='${lat.toFixed(5)}, ${lon.toFixed(5)}',1600)})">${lat.toFixed(5)}, ${lon.toFixed(5)}</span>
        · <a class="ext-link" href="https://what3words.com/${lat.toFixed(5)},${lon.toFixed(5)}" target="_blank">What3Words ↗</a>
      </strong>
    </div>

    <div class="terrain-item info-tile">
      <span class="terrain-label">Nearest town / county</span>
      <strong>${town}${county ? ', ' + county : ''}</strong>
    </div>

    ${postcode ? `<div class="terrain-item info-tile"><span class="terrain-label">Postcode</span><strong>${postcode}</strong></div>` : ''}

    <div class="terrain-item info-tile">
      <span class="terrain-label">Local authority</span>
      <strong>${councilName}</strong>
    </div>

    ${councilName !== '—' ? `<div class="terrain-item info-tile"><span class="terrain-label">Council links</span><strong><a class="ext-link" href="${councilSearch}" target="_blank">Council ↗</a> · <a class="ext-link" href="${filmingSearch}" target="_blank">Filming / media ↗</a></strong></div>` : ''}

    ${topCoastal.length ? `<div class="terrain-item info-tile"><span class="terrain-label">Coast / tidal water</span><strong>${renderWaterList(topCoastal)}</strong></div>` : ''}

    ${topInland.length ? `<div class="terrain-item info-tile"><span class="terrain-label">Nearest waterway / inland water</span><strong>${renderWaterList(topInland)}</strong></div>` : ''}
  </div>`;
}

/* ── CONGESTION ───────────────────────────────────────── */
function buildCongestionIndicator(features, address) {
  const city = address?.address?.city;
  const town = address?.address?.town;
  const village = address?.address?.village;
  const suburb = address?.address?.suburb;
  const hasMway = features.some(f => f.tags?.highway === 'motorway');

  let op, rh, label, cls;

  if (city) {
    op = '6–8 min'; rh = '18–25 min'; label = 'Very high'; cls = 'flag';
  } else if (suburb) {
    op = '4–6 min'; rh = '10–15 min'; label = 'High'; cls = 'warn';
  } else if (town) {
    op = '3–4 min'; rh = '7–10 min'; label = 'Moderate'; cls = 'warn';
  } else if (village) {
    op = '1–2 min'; rh = '2–4 min'; label = 'Low'; cls = 'ok';
  } else {
    op = '1–2 min'; rh = '1–3 min'; label = 'Very low'; cls = 'ok';
  }

  if (hasMway && (city || suburb)) rh = '20–30 min';

  return `<div class="congestion-block split-panel-wrap">
    <div class="congestion-head">
      <span class="card-label">Traffic congestion — per mile</span>
      <span class="card-badge b-${cls}">${label}</span>
    </div>

    <div class="congestion-cols split-panel">
      <div class="congestion-col split-col">
        <span class="cong-label">Off-peak</span>
        <span class="cong-val">${op}/mile</span>
      </div>

      <div class="congestion-divider split-divider"></div>

      <div class="congestion-col split-col">
        <span class="cong-label">Rush hour</span>
        <span class="cong-val cong-rush">${rh}/mile</span>
      </div>
    </div>

    <div class="congestion-note info-note">
      Peak hour estimate — <a class="ext-link" href="https://www.google.com/maps/@${address?.lat || 0},${address?.lon || 0},15z/data=!5m1!1e1" target="_blank">check Google Maps traffic ↗</a>
    </div>
  </div>`;
}

/* ── QUICK LINKS ──────────────────────────────────────── */
function buildQuickLinks(lat, lon) {
  const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  return `
    <div class="quick-links info-actions">
      <a class="quick-link" href="https://maps.google.com/maps?t=k&q=${lat},${lon}" target="_blank">Google Maps ↗</a>
      <a class="quick-link" href="https://maps.google.com/?q=&layer=c&cbll=${lat},${lon}&cbp=11,90,0,0,0" target="_blank">Street View ↗</a>
      <a class="quick-link" href="https://explore.osmaps.com/?lat=${lat}&lon=${lon}&zoom=14" target="_blank">OS Maps ↗</a>
      <a class="quick-link" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=15" target="_blank">OpenStreetMap ↗</a>
    </div>

    <div class="w3w-hint info-note">
      <span class="w3w-label">What3Words — copy coordinates then paste into search:</span>
      <span class="w3w-coords" onclick="navigator.clipboard.writeText('${coords}').then(()=>{this.textContent='✓ Copied!';setTimeout(()=>this.textContent='${coords}',2000)})">${coords}</span>
      <a class="ext-link" href="https://what3words.com" target="_blank">Open What3Words ↗</a>
    </div>
  `;
}

/* ── MAP CONTROLS SEPARATOR ─────────────────────────────
   .map-ctrl-sep is defined in style.css
   ────────────────────────────────────────────────────── */