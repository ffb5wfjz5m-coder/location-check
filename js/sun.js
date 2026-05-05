/* ════════════════════════════════════════════════════════
   LOCATION CHECK — sun.js
   Full light & sun section with sun map, moon map,
   light quality bar, HbH table, aurora, light pollution.
   ════════════════════════════════════════════════════════ */

/* ── MAP STATE ──────────────────────────────────────────*/
let _sunMap = null, _sunSatLayer = null, _sunStreetLayer = null;
let _moonMap = null, _moonSatLayer = null, _moonStreetLayer = null;

let _sunCurrentLayer = 'satellite';
let _moonCurrentLayer = 'satellite';

let _sunDialVisible = true;
let _sunDialLayer = null;
let _sunCenterMarker = null;
let _sunSectionRedrawTimer = null;

let _moonLayer = null;
let _moonCenterMarker = null;
let _moonNight = 'before'; // 'before' or 'after'

let _sunOverlays = {
  shadows: { layer: null, visible: false, btn: 'sun-ctrl-shadows' },
  noon: { layer: null, visible: false, btn: 'sun-ctrl-noon' },
};



/* ── MAIN BUILD ─────────────────────────────────────────*/
function buildSun(data) {
  const { lat, lon, date, sunData, weatherData, features, address } = data;
  if (!sunData) return null;

  const wrapper = document.createElement('div');
  wrapper.appendChild(sectionHead('Light & Sun'));

  const todayIdx = typeof getTodayIndex === 'function' && weatherData
    ? getTodayIndex(weatherData, date) : 0;
  const hourlyStart = todayIdx * 24;
  const cloudByHour = weatherData?.hourly?.cloudcover || [];
  const weatherCodes = weatherData?.hourly?.weathercode || [];

  const srH = new Date(sunData.sunrise).getHours() + new Date(sunData.sunrise).getMinutes() / 60;
  const ssH = new Date(sunData.sunset).getHours() + new Date(sunData.sunset).getMinutes() / 60;
  const srSp = calcSunPos(lat, lon, date, srH);
  const ssSp = calcSunPos(lat, lon, date, ssH);
  const noonSp = calcSunPos(lat, lon, date, 13);

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <span class="card-label">Sun dial — light & shadow overlay</span>
      <span class="card-badge b-neu">${new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
    </div>
    <div class="sun-bearing-summary">
      <div class="sbs-item"><span class="sbs-label">Sunrise</span><span class="sbs-val">${compassDir(srSp.az)} (${srSp.az}°) · ${formatTime(sunData.sunrise)}</span></div>
      <div class="sbs-item"><span class="sbs-label">Solar noon</span><span class="sbs-val">${compassDir(noonSp.az)} · ${formatTime(sunData.solar_noon)} · ${noonSp.alt}° elev</span></div>
      <div class="sbs-item"><span class="sbs-label">Sunset</span><span class="sbs-val">${compassDir(ssSp.az)} (${ssSp.az}°) · ${formatTime(sunData.sunset)}</span></div>
    </div>

    <div class="card-body info-stack">
      <div class="map-card sun-map-card">
        <div class="map-card-head">
          <span class="card-label">Sun path map</span>
        </div>

        <div class="map-frame sun-map-frame">
          <div id="sun-map"></div>
        </div>

        <div class="map-controls">
          <button class="map-ctrl-btn active" id="sun-ctrl-satellite" onclick="setSunMapLayer('satellite')">Satellite</button>
          <button class="map-ctrl-btn" id="sun-ctrl-street" onclick="setSunMapLayer('street')">Street</button>
          <div class="map-ctrl-sep"></div>
          <button class="map-ctrl-btn active" id="sun-ctrl-dial" onclick="toggleSunDial()">Sun dial</button>
          <button class="map-ctrl-btn" id="sun-ctrl-shadows" onclick="toggleSunOverlay('shadows')">Shadows (10m object)</button>
          <button class="map-ctrl-btn" id="sun-ctrl-noon" onclick="toggleSunOverlay('noon')">Solar noon</button>
        </div>
      </div>
      ${buildSunTimes(sunData)}
      ${buildLightQualityBar(sunData, cloudByHour, hourlyStart)}
      ${buildHourByHourLight(lat, lon, date, sunData, cloudByHour, weatherCodes, hourlyStart)}

      <!-- MOON MAP -->
      <div class="map-card moon-map-card">
        <div class="map-card-head">
          <span class="card-label">Moon path map</span>
        </div>

        <div class="map-frame moon-map-frame">
          <div id="moon-map"></div>
        </div>

        <div class="map-controls moon-map-controls">
          <button class="map-ctrl-btn active" id="moon-ctrl-satellite" onclick="setMoonMapLayer('satellite')">Satellite</button>
          <button class="map-ctrl-btn" id="moon-ctrl-street" onclick="setMoonMapLayer('street')">Street</button>
          <div class="map-ctrl-sep"></div>
          <button class="map-ctrl-btn active" id="moon-night-before" onclick="switchMoonNight('before')">Night before</button>
          <button class="map-ctrl-btn" id="moon-night-after" onclick="switchMoonNight('after')">Night after</button>
        </div>
      </div>

      ${buildMoonSection(sunData, date, cloudByHour, hourlyStart, lat, lon)}
      ${buildAurora(lat, lon)}
      ${buildLightPollution(features, address, lat, lon)}
    </div>`;

  wrapper.appendChild(card);
  return wrapper;
}

/* ── SUN / MOON WEATHER HELPERS ─────────────────────────*/
function getDialHourlyWeather(weatherData, dateStr) {
  if (!weatherData?.hourly?.time || !dateStr) return null;

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

function getDialWeatherForDateTime(weatherData, dateObj) {
  if (!weatherData || !dateObj) return null;

  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const hourly = getDialHourlyWeather(weatherData, dateStr);
  if (!hourly) return null;

  return hourly[dateObj.getHours()] || null;
}

function getDialWeatherIcon(hourWeather, isNight = false) {
  if (!hourWeather) return isNight ? '🌙' : '';

  const code = hourWeather.weatherCode ?? 0;
  const wx = weatherCodeInfo(code, isNight);

  return wx.icon || '';
}

function getMoonDialWeatherIcon(hourWeather) {
  if (!hourWeather) return '';

  const code = hourWeather.weatherCode ?? 0;

  // Moon dial uses sky-condition icons, not sun/moon icons.
  if (code === 0 || code === 1) return '✨';
  if (code === 2) return '✨☁️';

  const wx = weatherCodeInfo(code, false);

  if (wx.icon === '☀️' || wx.icon === '🌙') {
    return '✨';
  }

  return wx.icon || '';
}

function getDialWeatherTooltip(hourWeather) {
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

/* ── SUN MAP INIT ───────────────────────────────────────*/
function initSunMap(data) {
  const { lat, lon, date, weatherData } = data;
  const mapEl = document.getElementById('sun-map');
  if (!mapEl || !window.L) return;

  if (_sunMap) {
    _sunMap.off();
    _sunMap.remove();
    _sunMap = null;
  }

  if (_sunSectionRedrawTimer) {
    clearTimeout(_sunSectionRedrawTimer);
    _sunSectionRedrawTimer = null;
  }

  _sunDialLayer = null;
  _sunCenterMarker = null;
  _sunCurrentLayer = 'satellite';
  _sunDialVisible = true;

  Object.keys(_sunOverlays).forEach(k => {
    _sunOverlays[k].layer = null;
    _sunOverlays[k].visible = false;
  });

  _sunMap = L.map('sun-map', {
    center: [lat, lon],
    zoom: 18,
    zoomControl: true,
    scrollWheelZoom: true
  });

  

  _sunSatLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri World Imagery', maxZoom: 19 }
  ).addTo(_sunMap);

  _sunStreetLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap', maxZoom: 19 }
  );

  const markerLabel = STATE.location || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  _sunCenterMarker = L.circleMarker([lat, lon], {
    radius: 9,
    fillColor: '#ffffff',
    fillOpacity: 1,
    color: '#111110',
    weight: 2.5
  }).bindTooltip(`📍 ${markerLabel}`).addTo(_sunMap);

  _sunMap._sunLat = lat;
  _sunMap._sunLon = lon;
  _sunMap._sunDate = date;
  _sunMap._sunWeatherData = weatherData;

  drawSunSectionArrows(_sunMap, lat, lon, date, weatherData);

  _sunMap.whenReady(() => {
    _sunOverlays.shadows.layer = buildShadowOverlay(lat, lon, date);
    _sunOverlays.noon.layer = buildNoonOverlay(lat, lon, date);
  });

  _sunMap.on('zoomend resize moveend', () => {
    if (_sunSectionRedrawTimer) {
      clearTimeout(_sunSectionRedrawTimer);
    }

    _sunSectionRedrawTimer = setTimeout(() => {
      if (!_sunMap) return;

      drawSunSectionArrows(_sunMap, lat, lon, date, weatherData);

      if (_sunOverlays.shadows.layer) {
        if (_sunMap.hasLayer(_sunOverlays.shadows.layer)) {
          _sunMap.removeLayer(_sunOverlays.shadows.layer);
        }
        _sunOverlays.shadows.layer = buildShadowOverlay(lat, lon, date);
        if (_sunOverlays.shadows.visible) _sunOverlays.shadows.layer.addTo(_sunMap);
      }

      if (_sunOverlays.noon.layer) {
        if (_sunMap.hasLayer(_sunOverlays.noon.layer)) {
          _sunMap.removeLayer(_sunOverlays.noon.layer);
        }
        _sunOverlays.noon.layer = buildNoonOverlay(lat, lon, date);
        if (_sunOverlays.noon.visible) _sunOverlays.noon.layer.addTo(_sunMap);
      }
    }, 80);
  });
}

function setSunMapLayer(type) {
  if (!_sunMap) return;

  _sunCurrentLayer = type;

  document.getElementById('sun-ctrl-satellite')?.classList.toggle('active', type === 'satellite');
  document.getElementById('sun-ctrl-street')?.classList.toggle('active', type === 'street');

  if (type === 'satellite') {
    if (_sunStreetLayer && _sunMap.hasLayer(_sunStreetLayer)) _sunMap.removeLayer(_sunStreetLayer);
    if (_sunSatLayer && !_sunMap.hasLayer(_sunSatLayer)) _sunSatLayer.addTo(_sunMap);
  } else {
    if (_sunSatLayer && _sunMap.hasLayer(_sunSatLayer)) _sunMap.removeLayer(_sunSatLayer);
    if (_sunStreetLayer && !_sunMap.hasLayer(_sunStreetLayer)) _sunStreetLayer.addTo(_sunMap);
  }

  if (_sunCenterMarker) {
    _sunCenterMarker.setStyle({
      fillColor: type === 'street' ? '#111110' : '#ffffff',
      color: type === 'street' ? '#ffffff' : '#111110'
    });
    _sunCenterMarker.bringToFront();
  }

  drawSunSectionArrows(
    _sunMap,
    _sunMap._sunLat,
    _sunMap._sunLon,
    _sunMap._sunDate,
    _sunMap._sunWeatherData
  );
}

function toggleSunOverlay(key) {
  if (!_sunMap) return;

  const ov = _sunOverlays[key];
  if (!ov || !ov.layer) return;

  ov.visible = !ov.visible;
  document.getElementById(ov.btn)?.classList.toggle('active', ov.visible);

  if (ov.visible) {
    ov.layer.addTo(_sunMap);
  } else {
    _sunMap.removeLayer(ov.layer);
  }

  if (_sunCenterMarker) {
    _sunCenterMarker.bringToFront();
  }
}

function toggleSunDial() {
  if (!_sunMap) return;

  _sunDialVisible = !_sunDialVisible;
  document.getElementById('sun-ctrl-dial')?.classList.toggle('active', _sunDialVisible);

  if (_sunDialVisible) {
    drawSunSectionArrows(
      _sunMap,
      _sunMap._sunLat,
      _sunMap._sunLon,
      _sunMap._sunDate,
      _sunMap._sunWeatherData
    );
  } else if (_sunDialLayer) {
    _sunDialLayer.clearLayers();

    if (_sunMap.hasLayer(_sunDialLayer)) {
      _sunMap.removeLayer(_sunDialLayer);
    }

    _sunDialLayer = null;
  }
}

/* ── SUN SECTION ARROWS ─────────────────────────────────*/
function drawSunSectionArrows(map, lat, lon, dateStr, weatherData) {
  if (!map) return;

  if (_sunDialLayer) {
    _sunDialLayer.clearLayers();

    if (map.hasLayer(_sunDialLayer)) {
      map.removeLayer(_sunDialLayer);
    }

    _sunDialLayer = null;
  }

  if (!_sunDialVisible) return;

  const hourlyWeather = getDialHourlyWeather(weatherData, dateStr);

  _sunDialLayer = L.layerGroup().addTo(map);
  const layers = _sunDialLayer;

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

  function formatDialTime(d) {
    return d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false
    });
  }

  points.push({
    type: 'sunrise',
    date: sunrise,
    label: formatDialTime(sunrise)
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
      label: formatDialTime(pointDate)
    });
  }

  if (goldenStart && minsBetween(goldenStart, sunset) >= minGapMinutes) {
    points.push({
      type: 'golden',
      date: goldenStart,
      label: formatDialTime(goldenStart)
    });
  }

  points.push({
    type: 'sunset',
    date: sunset,
    label: formatDialTime(sunset)
  });

  points.forEach(point => {
    const pointHour = point.date.getHours();
    const pointWeather = hourlyWeather?.[pointHour] || null;
    const isNightPoint = point.date.getHours() < 6 || point.date.getHours() > 20;
    const wxIcon = getDialWeatherIcon(pointWeather, isNightPoint);
    const wxTooltip = getDialWeatherTooltip(pointWeather);

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

    let color = _sunCurrentLayer === 'street' ? '#111110' : '#ffffff';
    let weight = 1.5;
    let opacity = _sunCurrentLayer === 'street' ? 0.9 : 0.7;

    let bg = _sunCurrentLayer === 'street'
      ? 'rgba(0,0,0,0.82)'
      : 'rgba(255,255,255,0.92)';

    let fg = _sunCurrentLayer === 'street'
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

  if (_sunCenterMarker) {
    _sunCenterMarker.bringToFront();
  }
}

/* ── MOON MAP INIT ──────────────────────────────────────*/
function initMoonMap(data) {
  const { lat, lon, date, weatherData } = data;
  const mapEl = document.getElementById('moon-map');
  if (!mapEl || !window.L) return;

  if (_moonMap) {
    _moonMap.off();
    _moonMap.remove();
    _moonMap = null;
  }

  _moonLayer = null;
  _moonCenterMarker = null;
  _moonCurrentLayer = 'satellite';

  _moonMap = L.map('moon-map', {
    center: [lat, lon],
    zoom: 18,
    zoomControl: true,
    scrollWheelZoom: true
  });

  _moonMap._moonLat = lat;
  _moonMap._moonLon = lon;
  _moonMap._moonDate = date;
  _moonMap._moonWeatherData = weatherData;

  _moonSatLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri World Imagery', maxZoom: 19 }
  ).addTo(_moonMap);

  _moonStreetLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap', maxZoom: 19 }
  );

  const markerLabel = STATE.location || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  _moonCenterMarker = L.circleMarker([lat, lon], {
    radius: 9,
    fillColor: '#ffffff',
    fillOpacity: 1,
    color: '#111110',
    weight: 2.5
  }).bindTooltip(`📍 ${markerLabel}`).addTo(_moonMap);

  drawMoonArrows(_moonMap, lat, lon, date, _moonNight, weatherData);

  setTimeout(() => {
    if (_moonMap) {
      _moonMap.invalidateSize();
      drawMoonArrows(_moonMap, lat, lon, date, _moonNight, weatherData);
    }
  }, 150);

  _moonMap.on('zoomend resize moveend', () => {
    drawMoonArrows(_moonMap, lat, lon, date, _moonNight, weatherData);
  });
}

function setMoonMapLayer(type) {
  if (!_moonMap) return;

  _moonCurrentLayer = type;

  document.getElementById('moon-ctrl-satellite')?.classList.toggle('active', type === 'satellite');
  document.getElementById('moon-ctrl-street')?.classList.toggle('active', type === 'street');

  if (type === 'satellite') {
    if (_moonStreetLayer && _moonMap.hasLayer(_moonStreetLayer)) _moonMap.removeLayer(_moonStreetLayer);
    if (_moonSatLayer && !_moonMap.hasLayer(_moonSatLayer)) _moonSatLayer.addTo(_moonMap);
  } else {
    if (_moonSatLayer && _moonMap.hasLayer(_moonSatLayer)) _moonMap.removeLayer(_moonSatLayer);
    if (_moonStreetLayer && !_moonMap.hasLayer(_moonStreetLayer)) _moonStreetLayer.addTo(_moonMap);
  }

  if (_moonCenterMarker) {
    _moonCenterMarker.setStyle({
      fillColor: type === 'street' ? '#111110' : '#ffffff',
      color: type === 'street' ? '#ffffff' : '#111110'
    });
    _moonCenterMarker.bringToFront();
  }

  drawMoonArrows(
    _moonMap,
    _moonMap._moonLat,
    _moonMap._moonLon,
    _moonMap._moonDate,
    _moonNight,
    _moonMap._moonWeatherData
  );
}

function switchMoonNight(night) {
  if (!_moonMap) return;

  _moonNight = night;

  document.getElementById('moon-night-before')?.classList.toggle('active', night === 'before');
  document.getElementById('moon-night-after')?.classList.toggle('active', night === 'after');

  drawMoonArrows(
    _moonMap,
    _moonMap._moonLat,
    _moonMap._moonLon,
    _moonMap._moonDate,
    night,
    _moonMap._moonWeatherData
  );
}

/* ── MOON ARROWS ────────────────────────────────────────*/
function drawMoonArrows(map, lat, lon, date, night, weatherData) {
  if (!map) return;

  if (_moonLayer) {
    _moonLayer.clearLayers();

    if (map.hasLayer(_moonLayer)) {
      map.removeLayer(_moonLayer);
    }

    _moonLayer = null;
  }

  _moonLayer = L.layerGroup().addTo(map);
  const layers = _moonLayer;

  const center = L.latLng(lat, lon);
  const centerPt = map.latLngToContainerPoint(center);
  const mapSize = map.getSize();
  const radiusPx = Math.min(mapSize.x, mapSize.y) * 0.42;
  const lineRadiusPx = radiusPx;
  const labelRadiusPx = radiusPx * 1.08;

  const prevDate = new Date(new Date(date).getTime() - 86400000).toISOString().split('T')[0];
  const nextDate = new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0];

  const endTime = night === 'before'
    ? new Date(date + 'T08:00:00')
    : new Date(nextDate + 'T08:00:00');

  const afternoonStart = night === 'before'
    ? new Date(prevDate + 'T10:00:00')
    : new Date(date + 'T10:00:00');

  const points = [];
  const allHours = [];

  let current = new Date(afternoonStart);
  while (current <= endTime) {
    allHours.push(new Date(current));
    current = new Date(current.getTime() + 7200000);
  }

  const moonTimesDay = SunCalc.getMoonTimes(
    night === 'before' ? new Date(prevDate + 'T12:00:00') : new Date(date + 'T12:00:00'),
    lat,
    lon
  );

  const moonTimesNext = SunCalc.getMoonTimes(
    night === 'before' ? new Date(date + 'T00:00:00') : new Date(nextDate + 'T00:00:00'),
    lat,
    lon
  );

  const riseTime = moonTimesDay.rise;
  const setTime = moonTimesNext.set || moonTimesDay.set;
  const moonEventGapMs = 75 * 60 * 1000;

  if (riseTime) {
    points.push({
      date: riseTime,
      label: riseTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      type: 'rise'
    });
  }

  allHours.forEach(d => {
    const pos = SunCalc.getMoonPosition(d, lat, lon);
    if (!pos || pos.altitude * 180 / Math.PI < 0) return;

    if (riseTime && Math.abs(d - riseTime) < moonEventGapMs) return;
    if (setTime && Math.abs(d - setTime) < moonEventGapMs) return;

    points.push({
      date: d,
      label: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      type: 'hour'
    });
  });

  if (setTime) {
    points.push({
      date: setTime,
      label: setTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      type: 'set'
    });
  }

  if (points.filter(p => p.type === 'hour').length === 0) {
    const msg = L.divIcon({
      className: '',
      html: `<div style="background:rgba(0,0,0,0.7);color:#9090c0;font-size:12px;font-family:DM Mono,monospace;padding:8px 12px;border-radius:8px;white-space:nowrap;">🌑 Moon below horizon this night</div>`,
      iconSize: [260, 36],
      iconAnchor: [130, 18]
    });

    L.marker([lat, lon], { icon: msg }).addTo(layers);

    if (_moonCenterMarker) {
      _moonCenterMarker.bringToFront();
    }

    return;
  }

  points.forEach(point => {
    const pos = SunCalc.getMoonPosition(point.date, lat, lon);
    if (!pos) return;

    const altDeg = pos.altitude * 180 / Math.PI;
    if (altDeg < 0) return;

    const azDeg = (pos.azimuth * 180 / Math.PI + 180) % 360;
    const azRad = azDeg * Math.PI / 180;

    const endPt = L.point(
      centerPt.x + lineRadiusPx * Math.sin(azRad),
      centerPt.y - lineRadiusPx * Math.cos(azRad)
    );

    const labelPt = L.point(
      centerPt.x + labelRadiusPx * Math.sin(azRad),
      centerPt.y - labelRadiusPx * Math.cos(azRad)
    );

    if (!isFinite(endPt.x) || !isFinite(endPt.y)) return;
    if (!isFinite(labelPt.x) || !isFinite(labelPt.y)) return;

    const endLatLng = map.containerPointToLatLng(endPt);
    const labelLatLng = map.containerPointToLatLng(labelPt);

    const pointWeather = getDialWeatherForDateTime(weatherData, point.date);
    const isNightPoint = point.date.getHours() < 6 || point.date.getHours() > 20;
const wxIcon = getMoonDialWeatherIcon(pointWeather);
const wxTooltip = getDialWeatherTooltip(pointWeather);

const isRiseSet = point.type === 'rise' || point.type === 'set';
const isStreet = _moonCurrentLayer === 'street';

    const color = isRiseSet
      ? '#c8c4f0'
      : isNightPoint
        ? '#9090c0'
        : '#d4c090';

    const weight = isRiseSet ? 2.5 : 1.5;

    const bg = isRiseSet
      ? 'rgba(200,196,240,0.9)'
      : isNightPoint
        ? 'rgba(20,20,36,0.88)'
        : 'rgba(212,192,144,0.92)';

    const fg = isRiseSet
      ? '#111'
      : isNightPoint
        ? '#e8e6ff'
        : '#111110';

    L.polyline([center, endLatLng], {
      color,
      weight,
      opacity: 0.9
    }).addTo(layers);

    const icon = L.divIcon({
      className: '',
      html: `<span style="
        background:${bg};
        color:${fg};
        font-size:10px;
        font-family:DM Mono, monospace;
        padding:2px 0;
        width:70px;
        text-align:center;
        border-radius:999px;
        white-space:nowrap;
        display:inline-block;
        box-sizing:border-box;
      ">${point.label}${wxIcon ? ' ' + wxIcon : ''}</span>`,
      iconSize: [70, 22],
      iconAnchor: [35, 11]
    });

    L.marker(labelLatLng, { icon })
      .bindTooltip(`${point.label} — Moon ${compassDir(azDeg)} · ${Math.round(altDeg)}° elevation${wxTooltip}`)
      .addTo(layers);
  });

  if (_moonCenterMarker) {
    _moonCenterMarker.bringToFront();
  }
}

/* ── SUN OVERLAYS ───────────────────────────────────────*/
function buildShadowOverlay(lat, lon, date) {
  const layer = L.layerGroup();
  const keyHours = [6, 8, 10, 12, 14, 16, 18, 20];
  const center = L.latLng(lat, lon);
  const centerPt = _sunMap.latLngToContainerPoint(center);

  keyHours.forEach(h => {
    const sunDate = new Date(`${date}T${String(h).padStart(2, '0')}:00:00`);
    const pos = SunCalc.getPosition(sunDate, lat, lon);
    const altDeg = pos.altitude * 180 / Math.PI;
    if (altDeg < 2) return;

    const shadowMetres = Math.min(500, 10 / Math.tan(altDeg * Math.PI / 180));
    const metersPerPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, _sunMap.getZoom());
    const shadowPx = shadowMetres / metersPerPx;

    const sunAzDeg = (pos.azimuth * 180 / Math.PI + 180) % 360;
    const shadowAzDeg = (sunAzDeg + 180) % 360;
    const azRad = shadowAzDeg * Math.PI / 180;

    const endPt = L.point(
      centerPt.x + shadowPx * Math.sin(azRad),
      centerPt.y - shadowPx * Math.cos(azRad)
    );

    if (!isFinite(endPt.x) || !isFinite(endPt.y)) return;
    const endLatLng = _sunMap.containerPointToLatLng(endPt);

    L.polyline([[lat, lon], [endLatLng.lat, endLatLng.lng]], {
      color: '#4a7ec8',
      weight: 2,
      opacity: 0.85
    }).addTo(layer);

    L.circleMarker([endLatLng.lat, endLatLng.lng], {
      radius: 4,
      fillColor: '#4a7ec8',
      fillOpacity: 1,
      color: '#fff',
      weight: 1
    }).bindTooltip(`${String(h).padStart(2, '0')}:00 — shadow ${Math.round(shadowMetres)}m towards ${compassDir(shadowAzDeg)} (10m object)`).addTo(layer);
  });

  return layer;
}

function buildNoonOverlay(lat, lon, date) {
  const layer = L.layerGroup();
  const sp = calcSunPos(lat, lon, date, 13);
  if (sp.alt <= 0) return layer;

  const center = L.latLng(lat, lon);
  const centerPt = _sunMap.latLngToContainerPoint(center);
  const mapSize = _sunMap.getSize();
  const radiusPx = Math.min(mapSize.x, mapSize.y) * 0.46;
  const sunAzRad = sp.az * Math.PI / 180;

  const endPt = L.point(
    centerPt.x + radiusPx * Math.sin(sunAzRad),
    centerPt.y - radiusPx * Math.cos(sunAzRad)
  );

  if (!isFinite(endPt.x) || !isFinite(endPt.y)) return layer;
  const endLatLng = _sunMap.containerPointToLatLng(endPt);

  L.polyline([[lat, lon], [endLatLng.lat, endLatLng.lng]], {
    color: '#00bcd4',
    weight: 3,
    opacity: 0.9
  }).addTo(layer);

  L.circleMarker([endLatLng.lat, endLatLng.lng], {
    radius: 5,
    fillColor: '#00bcd4',
    fillOpacity: 1,
    color: '#fff',
    weight: 1
  }).bindTooltip(`Solar noon — ${compassDir(sp.az)}, ${sp.alt}° elevation`).addTo(layer);

  return layer;
}

/* ── SUN TIMES ──────────────────────────────────────────*/
function buildSunTimes(sunData) {
  const addMins = (iso, mins) => iso ? new Date(new Date(iso).getTime() + mins * 60000).toISOString() : null;

  const times = [
    { label: 'Astronomical dawn', time: sunData.astronomical_twilight_begin, note: 'Sky begins to lighten' },
    { label: 'Nautical dawn', time: sunData.nautical_twilight_begin, note: 'Horizon becomes visible' },
    { label: 'Blue hour begins', time: sunData.civil_twilight_begin, note: 'Cool blue cinematic light', gold: true },
    { label: 'Sunrise', time: sunData.sunrise, note: 'Golden hour begins', gold: true },
    { label: 'Golden hour ends', time: addMins(sunData.sunrise, 60), note: 'Direct light begins', gold: true },
    { label: 'Solar noon', time: sunData.solar_noon, note: 'Sun at highest — hard shadows' },
    { label: 'Golden hour begins', time: addMins(sunData.sunset, -60), note: 'Evening golden hour', gold: true },
    { label: 'Sunset', time: sunData.sunset, note: 'Golden hour ends', gold: true },
    { label: 'Blue hour ends', time: sunData.civil_twilight_end, note: 'Blue hour ends', gold: true },
    { label: 'Nautical dusk', time: sunData.nautical_twilight_end, note: 'Horizon fades' },
    { label: 'Astronomical dusk', time: sunData.astronomical_twilight_end, note: 'Full darkness' },
  ];

  const srMs = new Date(sunData.sunrise).getTime();
  const ssMs = new Date(sunData.sunset).getTime();
  const ctbMs = new Date(sunData.civil_twilight_begin).getTime();
  const cteMs = new Date(sunData.civil_twilight_end).getTime();
  const dayMins = Math.round((ssMs - srMs) / 60000);
  const goldenMins = Math.round(((srMs - ctbMs) + (cteMs - ssMs)) / 60000) + 120;
  const blueMins = Math.round(((srMs - ctbMs) + (cteMs - ssMs)) / 60000);

  return `
    <div class="sun-times">
      <div class="sun-times-rows">
        ${times.map(t => `
          <div class="sun-time-row ${t.gold ? 'sun-golden' : ''}">
            <span class="sun-time-label">${t.label}</span>
            <span class="sun-time-val">${t.time ? formatTime(t.time) : '—'}</span>
            <span class="sun-time-note">${t.note}</span>
          </div>`).join('')}
      </div>
      <div class="sun-durations">
        <div class="sun-dur-item">
          <span class="sun-dur-label">Total daylight</span>
          <span class="sun-dur-val">${Math.floor(dayMins / 60)}h ${dayMins % 60}m</span>
        </div>
        <div class="sun-dur-item">
          <span class="sun-dur-label">Golden hour total</span>
          <span class="sun-dur-val gold">${goldenMins} min</span>
        </div>
        <div class="sun-dur-item">
          <span class="sun-dur-label">Blue hour total</span>
          <span class="sun-dur-val blue">${blueMins} min</span>
        </div>
      </div>
    </div>`;
}

/* ── LIGHT QUALITY BAR ──────────────────────────────────*/
function buildLightQualityBar(sunData, cloudByHour, hourlyStart) {
  const ctb = new Date(sunData.civil_twilight_begin);
  const sr = new Date(sunData.sunrise);
  const sn = new Date(sunData.solar_noon);
  const ss = new Date(sunData.sunset);
  const cte = new Date(sunData.civil_twilight_end);

  const ctbH = ctb.getHours() + ctb.getMinutes() / 60;
  const srH = sr.getHours() + sr.getMinutes() / 60;
  const ghEndH = srH + 1;
  const snH = sn.getHours() + sn.getMinutes() / 60;
  const ghBegH = ss.getHours() + ss.getMinutes() / 60 - 1;
  const ssH = ss.getHours() + ss.getMinutes() / 60;
  const cteH = cte.getHours() + cte.getMinutes() / 60;

  const colorMap = {
    dark: '#1a1a2e', blue: '#4a6fa5', golden: '#e8b840',
    direct: '#f5d87a', diffuse: '#c8c4a0', overcast: '#8a8a8a',
  };

  const segments = [];
  for (let h = 0; h < 24; h++) {
    const cloud = cloudByHour[hourlyStart + h] ?? 50;
    let type;
    if (h < ctbH || h > cteH) type = 'dark';
    else if (h < srH || h > ssH) type = 'blue';
    else if (h < ghEndH || h > ghBegH) type = cloud > 60 ? 'overcast' : 'golden';
    else if (cloud > 80) type = 'overcast';
    else if (cloud > 40) type = 'diffuse';
    else type = 'direct';
    segments.push({ h, type, cloud });
  }

  const bars = segments.map(s =>
    `<div class="lq-seg" style="background:${colorMap[s.type]}" title="${String(s.h).padStart(2, '0')}:00 — ${s.type}${s.cloud != null ? ' (' + s.cloud + '% cloud)' : ''}"></div>`
  ).join('');

  const pct = h => (h / 24 * 100).toFixed(2) + '%';
  const markers = [
    { h: ctbH, label: 'Blue', time: formatTime(sunData.civil_twilight_begin), color: '#4a6fa5' },
    { h: srH, label: 'Sunrise', time: formatTime(sunData.sunrise), color: '#e87830' },
    { h: ghEndH, label: 'GH end', time: formatTime(new Date(new Date(sunData.sunrise).getTime() + 3600000).toISOString()), color: '#e8b840' },
    { h: snH, label: 'Noon', time: formatTime(sunData.solar_noon), color: '#ffffff' },
    { h: ghBegH, label: 'GH beg', time: formatTime(new Date(new Date(sunData.sunset).getTime() - 3600000).toISOString()), color: '#e8b840' },
    { h: ssH, label: 'Sunset', time: formatTime(sunData.sunset), color: '#c84820' },
    { h: cteH, label: 'Blue', time: formatTime(sunData.civil_twilight_end), color: '#4a6fa5' },
  ];

  const markerHTML = markers.map((m, i) => {
    const above = i % 2 === 0;
    return `<div class="lq-marker" style="left:${pct(m.h)};border-color:${m.color}">
      <div class="${above ? 'lq-label-above' : 'lq-label-below'}" style="color:${m.color}">${m.label}<br><span style="font-size:8px">${m.time}</span></div>
    </div>`;
  }).join('');

  return `
    <div class="light-quality-bar">
      <div class="lq-label">Light quality across the day</div>
      <div class="lq-bar-wrap">
        <div class="lq-bar">${bars}</div>
        <div class="lq-markers">${markerHTML}</div>
      </div>
      <div class="lq-times"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      <div class="lq-legend">
        <span class="lq-key" style="background:#1a1a2e">Dark</span>
        <span class="lq-key" style="background:#4a6fa5">Blue hour</span>
        <span class="lq-key" style="background:#e8b840;color:#111">Golden</span>
        <span class="lq-key" style="background:#f5d87a;color:#111">Direct</span>
        <span class="lq-key" style="background:#c8c4a0;color:#111">Diffuse (partial cloud)</span>
        <span class="lq-key" style="background:#8a8a8a">Overcast (heavy cloud)</span>
      </div>
    </div>`;
}

/* ── HOUR BY HOUR LIGHT QUALITY ─────────────────────────*/
function buildHourByHourLight(lat, lon, date, sunData, cloudByHour, weatherCodes, hourlyStart) {
  const srH = new Date(sunData.sunrise).getHours() + new Date(sunData.sunrise).getMinutes() / 60;
  const ssH = new Date(sunData.sunset).getHours() + new Date(sunData.sunset).getMinutes() / 60;
  const ctbH = new Date(sunData.civil_twilight_begin).getHours();
  const cteH = new Date(sunData.civil_twilight_end).getHours();

  const shadowLen = alt => {
    if (alt <= 0) return '—';
    const mult = parseFloat((1 / Math.tan(Math.max(1, alt) * Math.PI / 180)).toFixed(1));
    const metres = (mult * 1.8).toFixed(0) + 'm';
    return mult > 10 ? '>10× ht (' + metres + ')' : mult + '× ht (' + metres + ')';
  };

  const getLQ = (h, sp, cloud, wCode) => {
    const wx = weatherCodeInfo(wCode || 0);
    const c = cloud ?? 50;
    if (h < ctbH || h > cteH + 1) return { quality: 'Dark', desc: 'No usable light', cls: 'dark', icon: '🌑' };
    if (h < srH || h > ssH) return { quality: 'Blue hour', desc: `Cool blue · ${compassDir(sp.az)} · ${wx.icon} ${wx.desc}`, cls: 'blue', icon: '🔵' };
    const ghMornEnd = srH + 1;
    const ghEveStart = ssH - 1;
    const isGolden = h < ghMornEnd || h > ghEveStart;
    if (isGolden) {
      if (c > 80) return { quality: 'Golden hour — overcast', desc: `Warm but flat · ${compassDir(sp.az)} · ${sp.alt}° · ☁ ${c}%`, cls: 'warn', icon: '🌥' };
      if (c > 40) return { quality: 'Golden hour — diffuse', desc: `Soft warm · ${compassDir(sp.az)} · ${sp.alt}° · 🌤 ${c}% cloud`, cls: 'golden', icon: '🌤' };
      return { quality: 'Golden hour', desc: `Warm directional · ${compassDir(sp.az)} · ${sp.alt}° · ${wx.icon}`, cls: 'golden', icon: '✨' };
    }
    if (c > 80) return { quality: 'Overcast', desc: `Flat grey · no shadows · ${compassDir(sp.az)} · ☁ ${c}%`, cls: 'overcast', icon: '☁' };
    if (c > 40) return { quality: 'Diffuse', desc: `Soft even · partial cloud · ${compassDir(sp.az)} · ${sp.alt}° · 🌤 ${c}%`, cls: 'diffuse', icon: '🌤' };
    return { quality: 'Direct sunlight', desc: `Hard light · strong shadows · ${compassDir(sp.az)} · ${sp.alt}° · ${wx.icon}`, cls: 'direct', icon: '☀' };
  };

  const rows = [];
  const startH = Math.max(0, ctbH - 1);
  const endH = Math.min(23, cteH + 1);

  const keyEvents = [
    { time: sunData.civil_twilight_begin, label: 'Blue hour begins' },
    { time: sunData.sunrise, label: 'Sunrise' },
    { time: new Date(new Date(sunData.sunrise).getTime() + 3600000).toISOString(), label: 'Golden hour ends' },
    { time: sunData.solar_noon, label: 'Solar noon' },
    { time: new Date(new Date(sunData.sunset).getTime() - 3600000).toISOString(), label: 'Golden hour begins' },
    { time: sunData.sunset, label: 'Sunset' },
    { time: sunData.civil_twilight_end, label: 'Blue hour ends' },
  ].map(e => ({ ...e, h: new Date(e.time).getHours() + new Date(e.time).getMinutes() / 60 }));

  const skipHours = new Set();
  keyEvents.forEach(e => {
    const wholeHour = Math.round(e.h);
    if (Math.abs(e.h - wholeHour) < 0.5) skipHours.add(wholeHour);
  });

  const allRows = [];
  for (let h = startH; h <= endH; h++) {
    if (!skipHours.has(h)) allRows.push({ h, isKey: false });
    keyEvents.forEach(e => {
      if (Math.floor(e.h) === h) allRows.push({ h: e.h, isKey: true, label: e.label, time: e.time });
    });
  }
  allRows.sort((a, b) => a.h - b.h);

  for (const row of allRows) {
    const h = row.h;
    const hInt = Math.floor(h);
    const sp = calcSunPos(lat, lon, date, h);
    const cloud = cloudByHour[hourlyStart + hInt] ?? null;
    const wCode = weatherCodes[hourlyStart + hInt] ?? 0;
    const lq = getLQ(h, sp, cloud, wCode);
    const isKey = row.isKey || hInt === 12;
    const sDir = sp.alt > 1 ? compassDir((sp.az + 180) % 360) : '—';
    const sLen = sp.alt > 1 ? shadowLen(sp.alt) : '—';

    const timeLabel = row.isKey
      ? `<span style="color:var(--gold)">${formatTime(row.time)}</span> <span style="font-size:10px;color:var(--text-3)">${row.label}</span>`
      : String(hInt).padStart(2, '0') + ':00';

    rows.push(`
      <tr class="lq-row lq-${lq.cls} ${isKey ? 'lq-key-time' : ''}">
        <td class="lqt-time">${timeLabel}</td>
        <td class="lqt-icon">${lq.icon}</td>
        <td class="lqt-quality">${lq.quality}</td>
        <td class="lqt-desc">${lq.desc}</td>
        <td class="lqt-shadow">${sDir}</td>
        <td class="lqt-shadow">${sLen}</td>
      </tr>`);
  }

  return `
    <div class="hbh-light">
      <div class="card-label" style="margin-bottom:0.5rem">Hour-by-hour light quality</div>
      <div class="hourly-scroll data-table-scroll">
        <table class="hourly-table data-table">
          <thead><tr><th>Time</th><th></th><th>Light</th><th>Conditions</th><th>Shadow dir</th><th>Shadow len</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
    </div>`;
}

/* ── MOON SECTION ───────────────────────────────────────*/
function buildMoonSection(sunData, date, cloudByHour, hourlyStart, lat, lon) {
  const d = new Date(date);
  const knownNew = new Date('2000-01-06');
  const moonAge = ((d - knownNew) / (1000 * 60 * 60 * 24)) % 29.5;
  const illumination = Math.round(50 * (1 - Math.cos(2 * Math.PI * moonAge / 29.5)));

  const phases = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  const icons = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  const idx = Math.floor(moonAge / 29.5 * 8) % 8;

  // Use SunCalc for accurate moon times
  const prevDate = new Date(new Date(date).getTime() - 86400000).toISOString().split('T')[0];
  const nextDate = new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0];

  const moonTimesBefore = SunCalc.getMoonTimes(new Date(prevDate + 'T12:00:00'), lat, lon);
  const moonTimesAfter = SunCalc.getMoonTimes(new Date(date + 'T12:00:00'), lat, lon);
  const moonTimesNext = SunCalc.getMoonTimes(new Date(nextDate + 'T00:00:00'), lat, lon);

  const fmt = t => t ? t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

  const moonriseBeforeStr = fmt(moonTimesBefore.rise);
  const moonsetBeforeStr = fmt(moonTimesBefore.set && moonTimesBefore.set > moonTimesBefore.rise ? moonTimesBefore.set : moonTimesAfter.set);
  const moonriseAfterStr = fmt(moonTimesAfter.rise);
  const moonsetAfterStr = fmt(moonTimesNext.set && moonTimesNext.set ? moonTimesNext.set : moonTimesAfter.set);

  const midCloud = cloudByHour[hourlyStart + 23] ?? 50;
  const effective = Math.round(illumination * (1 - midCloud / 100));

  let nightNote;
  if (effective > 60) nightNote = 'Bright night — significant natural fill light for night shoots';
  else if (effective > 30) nightNote = 'Moderate ambient — useful fill, won\'t overpower artificial lighting';
  else if (illumination > 50) nightNote = 'Moon bright but heavy cloud reducing effective light';
  else nightNote = 'Dark night — minimal natural light, controlled lighting essential';

  return `
    <div class="moon-section">
      <div class="moon-head">
        <span class="card-label">Moon</span>
        <span class="moon-phase-icon">${icons[idx]}</span>
        <span class="card-badge b-neu">${phases[idx]}</span>
      </div>
      ${mrow('Illumination', illumination + '%')}
      ${mrow('Cloud cover at night', midCloud + '%')}
      ${mrow('Effective brightness', effective + '% — ' + (effective > 50 ? 'Bright' : effective > 25 ? 'Moderate' : 'Dark'))}
      ${mrow('Moonrise — night before', moonriseBeforeStr)}
      ${mrow('Moonset — night before', moonsetBeforeStr)}
      ${mrow('Moonrise — night after', moonriseAfterStr)}
      ${mrow('Moonset — night after', moonsetAfterStr)}
      <div class="moon-note">${nightNote}</div>
    </div>`;
}

/* ── AURORA BOREALIS ────────────────────────────────────*/
function buildAurora(lat, lon) {
  return `<div id="aurora-placeholder"><div class="aurora-loading">Loading aurora data...</div></div>`;
}

async function initAurora(lat, lon) {
  const el = document.getElementById('aurora-placeholder');
  if (!el) return;

  let currentKp = null;
  try {
    const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
    if (res.ok) {
      const data = await res.json();
      if (data.length > 1) currentKp = parseFloat(data[data.length - 1][1]);
    }
  } catch (e) { }

  const minKp = Math.max(0, Math.round((90 - lat) / 6));
  const visible = currentKp !== null && currentKp >= minKp;

  let statusCls, statusLabel;
  if (lat < 52) { statusCls = 'warn'; statusLabel = 'Rare — extreme solar storm only'; }
  else if (lat < 56) { statusCls = 'warn'; statusLabel = 'Occasional — strong solar activity'; }
  else if (lat < 60) { statusCls = 'ok'; statusLabel = 'Possible — moderate solar activity'; }
  else { statusCls = 'ok'; statusLabel = 'Likely during active periods'; }

  el.outerHTML = `
    <div class="aurora-section">
      <div class="aurora-head">
        <span class="card-label">Aurora Borealis probability</span>
        <span class="card-badge b-${statusCls}">${statusLabel}</span>
      </div>
      ${mrow('Your latitude', lat.toFixed(2) + '°N')}
      ${mrow('Min Kp index needed', 'Kp ' + minKp + ' or higher')}
      ${currentKp !== null ? mrow('Current Kp index', 'Kp ' + currentKp.toFixed(1) + (visible ? ' ✓ Visible conditions!' : ' — below threshold')) : mrow('Current Kp', 'Data unavailable')}
      <div class="aurora-note">Aurora requires dark skies, clear weather and minimum Kp ${minKp} at this latitude. Best seen facing north.</div>
      ${quickLinks([
    { label: 'Aurora Watch UK', url: 'https://aurorawatch.lancs.ac.uk/' },
    { label: 'NOAA Space Weather', url: 'https://www.swpc.noaa.gov/products/planetary-k-index' },
    { label: 'AuroraAlerts', url: 'https://www.aurora-alerts.uk/' },
  ])}
    </div>`;
}

/* ── LIGHT POLLUTION ────────────────────────────────────*/
function buildLightPollution(features, address, lat, lon) {
  const lp = estimateLightPollution(features, address);
  return `
    <div class="light-pollution">
      <div class="lp-head">
        <span class="card-label">Light pollution</span>
        <span class="card-badge b-${lp.good ? 'ok' : lp.ok ? 'warn' : 'flag'}">Bortle ${lp.score} — ${lp.label}</span>
      </div>
      <div class="lp-bar-wrap">
        <div class="lp-bar"><div class="lp-fill" style="width:${lp.score / 9 * 100}%"></div></div>
        <div class="lp-scale"><span>Dark sky</span><span>Inner city</span></div>
      </div>
      ${mrow('Night sky quality', lp.label)}
      ${mrow('Night shooting', lp.good ? 'Excellent — stars visible, minimal glow' : lp.ok ? 'Moderate — some horizon glow' : 'Challenging — significant urban light')}
      ${quickLinks([
    { label: 'Light Pollution Map', url: `https://www.lightpollutionmap.info/#zoom=10&lat=${lat}&lon=${lon}` },
    { label: 'Clear Outside', url: `https://clearoutside.com/forecast/${lat}/${lon}` },
    { label: 'Astronomical seeing', url: `https://www.meteoblue.com/en/weather/outdoorsports/seeing/${lat.toFixed(2)}N${Math.abs(lon).toFixed(2)}${lon < 0 ? 'W' : 'E'}` },
  ])}
    </div>`;
}

/* ── SUN POSITION CALCULATION ───────────────────────────*/
function calcSunPos(lat, lon, dateStr, hour) {
  const rad = Math.PI / 180;
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const B = (360 / 365) * (dayOfYear - 81) * rad;
  const decl = Math.asin(Math.sin(23.45 * rad) * Math.sin(B));
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const solarNoonLocal = 12 - lon / 15 - eot / 60;
  const hourAngle = (hour - solarNoonLocal) * 15 * rad;
  const latR = lat * rad;
  const sinAlt = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(hourAngle);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180 / Math.PI;
  const cosAz = (Math.sin(decl) - Math.sin(latR) * sinAlt / Math.cos(Math.asin(sinAlt))) / Math.cos(latR);
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI;
  if (hourAngle > 0) az = 360 - az;
  return { alt: Math.round(alt * 10) / 10, az: Math.round((az + 360) % 360) };
}
