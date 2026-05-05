/* ════════════════════════════════════════════════════════
   LOCATION CHECK — results.js
   Master results assembly.
   Called by core.js once all data is fetched.
   ════════════════════════════════════════════════════════ */


/* ── RENDER RESULTS ─────────────────────────────────────*/

async function renderResults(data) {
  const container = document.getElementById('results');

  container.innerHTML = '';
  container.classList.add('show');

  const jumpNav = buildJumpNav();
  container.appendChild(jumpNav);

  const sections = await Promise.all([
    buildVerdict(data),
    buildMapSection(data),
    buildWeatherSection(data),
    buildSunSection(data),
    buildSoundSection(data),
    buildPermissionsSection(data),
    buildDroneSection(data),
    buildServicesSection(data),
    buildRisksSection(data),
    buildParkingSection(data),
    buildConnectivitySection(data),
  ]);

  const sectionKeys = [
    'verdict',
    'map',
    'weather',
    'sun',
    'sound',
    'permissions',
    'drone',
    'services',
    'risks',
    'parking',
    'connectivity'
  ];

  sections.forEach((section, i) => {
    if (!section) return;

    section.classList.add('anim', 'a' + Math.min(i + 1, 8));

    if (i === 0) {
      container.appendChild(section);
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'result-section section-block';
    wrapper.dataset.section = sectionKeys[i];

    const head = section.querySelector('.section-head');

    if (head) {
      section.removeChild(head);
      head.classList.add('section-toggle');

      const toggle = document.createElement('span');
      toggle.className = 'section-toggle-icon';
      toggle.textContent = '−';

      head.appendChild(toggle);

      head.addEventListener('click', () => {
        wrapper.classList.toggle('collapsed');
        toggle.textContent = wrapper.classList.contains('collapsed') ? '+' : '−';
      });

      wrapper.appendChild(head);
    }

    const body = document.createElement('div');
    body.className = 'section-body info-stack';
    body.appendChild(section);

    wrapper.appendChild(body);
    container.appendChild(wrapper);
  });

  applyResultMode(STATE.viewMode || 'all');

  if (typeof initActiveSectionHighlight === 'function') {
    initActiveSectionHighlight();
  }

  setTimeout(() => {
    const nav = container.querySelector('.jump-nav');

    if (nav) {
      const y = nav.getBoundingClientRect().top + window.pageYOffset - 55;
      window.scrollTo({ top: y, behavior: 'smooth' });
    } else {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);

  setTimeout(() => {
    if (document.getElementById('map') && typeof initMap === 'function') initMap(data);
    if (document.getElementById('sun-map') && typeof initSunMap === 'function') initSunMap(data);
    if (document.getElementById('moon-map') && typeof initMoonMap === 'function') initMoonMap(data);
    if (document.getElementById('drone-map') && typeof initDroneMap === 'function') initDroneMap(data);
    if (typeof initAurora === 'function') initAurora(data.lat, data.lon);
  }, 1500);
}

function buildJumpNav() {
  const modes = [
    { key: 'all', label: 'All' },
    { key: 'visual', label: '🎥 Visual' },
    { key: 'logistics', label: '🛠 Logistics' },
    { key: 'drone', label: '🚁 Drone' },
    { key: 'sound', label: '🎙 Sound' }
  ];

  const items = [
    { key: 'map', label: '🗺 Map' },
    { key: 'weather', label: '🌦 Weather' },
    { key: 'sun', label: '☀ Sun' },
    { key: 'sound', label: '🎙 Sound' },
    { key: 'permissions', label: '📋 Permissions' },
    { key: 'drone', label: '🚁 Drone' },
    { key: 'services', label: '🚑 Services' },
    { key: 'risks', label: '⚠ Risks' },
    { key: 'parking', label: '🅿 Parking' },
    { key: 'connectivity', label: '📶 Signal' }
  ];

  const nav = document.createElement('div');
  nav.className = 'jump-nav jump-nav-sticky';

  nav.innerHTML = `
    <div class="jump-nav-modes">
      ${modes.map(mode => `
        <button class="mode-btn" type="button" data-mode="${mode.key}">
          ${mode.label}
        </button>
      `).join('')}
    </div>

    <div class="jump-nav-sep"></div>

    <div class="jump-nav-links">
      ${items.map(item => `
        <button class="jump-nav-btn" type="button" data-jump="${item.key}">
          ${item.label}
        </button>
      `).join('')}
    </div>
  `;

  nav.addEventListener('click', e => {
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      setViewMode(modeBtn.dataset.mode);
      return;
    }

        const jumpBtn = e.target.closest('[data-jump]');
    if (!jumpBtn) return;

    const target = document.querySelector(`[data-section="${jumpBtn.dataset.jump}"]`);
    if (!target) return;

    target.classList.remove('collapsed');

    const icon = target.querySelector('.section-toggle-icon');
    if (icon) icon.textContent = '−';

    window._lockJumpHighlight = true;

    document.querySelectorAll('.jump-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.jump === jumpBtn.dataset.jump);
    });

    const y = target.getBoundingClientRect().top + window.pageYOffset - 210;
    window.scrollTo({ top: y, behavior: 'smooth' });

    setTimeout(() => {
      window._lockJumpHighlight = false;
    }, 700);
  });

  setTimeout(() => setViewMode(STATE.viewMode || 'all'), 0);

  return nav;
}

function applyResultMode(mode) {
  const modeSections = {
    all: ['map', 'weather', 'sun', 'sound', 'permissions', 'drone', 'services', 'risks', 'parking', 'connectivity'],
    visual: ['map', 'weather', 'sun', 'sound', 'drone'],
    logistics: ['map', 'permissions', 'parking', 'services', 'risks', 'connectivity', 'drone'],
    drone: ['map', 'weather', 'drone'],
    sound: ['map', 'sound']
  };

  const openSections = modeSections[mode] || modeSections.all;

  document.querySelectorAll('.result-section').forEach(section => {
    const key = section.dataset.section;
    const shouldOpen = openSections.includes(key);

    section.classList.toggle('collapsed', !shouldOpen);

    const icon = section.querySelector('.section-toggle-icon');
    if (icon) icon.textContent = shouldOpen ? '−' : '+';
  });

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.mode === mode);
  });
}

function initActiveSectionHighlight() {
  const buttons = Array.from(document.querySelectorAll('.jump-nav-btn'));

  function updateActiveButton() {
    if (window._lockJumpHighlight) return;

    let currentKey = null;

    document.querySelectorAll('.result-section').forEach(section => {
      if (window.scrollY >= section.offsetTop - 220) {
        currentKey = section.dataset.section;
      }
    });

    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.jump === currentKey);
    });
  }

  window.addEventListener('scroll', updateActiveButton, { passive: true });
  updateActiveButton();
}

/* ── VERDICT BAR ────────────────────────────────────────*/

function buildVerdict(data) {
  const { lat, lon, date, locationName, weatherData, sunData, features, elevation, address } = data;

  const wCode   = weatherData.daily.weathercode[0];
  const cloud   = Math.round(weatherData.daily.cloudcover_mean[0]);
  const rain    = weatherData.daily.precipitation_sum[0] || 0;
  const gustMax = weatherData.daily.windgusts_10m_max[0] || 0;
  const { desc: wxDesc } = weatherCodeInfo(wCode);

  const srISO  = sunData.sunrise;
  const ssISO  = sunData.sunset;
  const ctbISO = sunData.civil_twilight_begin;
  const cteISO = sunData.civil_twilight_end;
  const dayMins    = Math.round((new Date(ssISO) - new Date(srISO)) / 60000);
  const goldenMins = Math.round(((new Date(srISO) - new Date(ctbISO)) + (new Date(cteISO) - new Date(ssISO))) / 60000);

  const sound    = calcSoundScore(features);
  const airspace = calcAirspace(features);
  const perms    = calcPermissions(features, address);

  const flags = [
    airspace.hasFRZ,
    sound.composite < 5,
    perms.some(p => p.status === 'flag'),
    rain > 10
  ].filter(Boolean).length;

  const warns = [
    sound.composite < 7,
    perms.some(p => p.status === 'warn'),
    cloud > 70,
    airspace.hasHelipad,
    gustMax > 30
  ].filter(Boolean).length;

  let overallLabel = 'Good to go';
  let overallCls   = 'vp-ok';
  if (flags > 0)      { overallLabel = 'Flags raised';  overallCls = 'vp-flag'; }
  else if (warns > 0) { overallLabel = 'Check details'; overallCls = 'vp-warn'; }

  let summary = wxDesc + ' forecast';
  if (cloud < 40)       summary += ', clear skies';
  else if (cloud > 70)  summary += ', heavy cloud cover';
  summary += `. ${Math.floor(dayMins/60)}h ${dayMins%60}m daylight`;
  summary += `, ~${goldenMins} min golden hour`;
  if (sound.composite < 7) summary += `. Sound: ${sound.badge.toLowerCase()}`;
  if (airspace.hasFRZ)     summary += `. Drone FRZ likely`;
  if (perms.some(p => p.status === 'flag')) summary += `. Permission flag`;
  summary += '.';

  const area = [
    address?.address?.city || address?.address?.town || address?.address?.village,
    address?.address?.county,
    address?.address?.country
  ].filter(Boolean).join(', ');

  const dispDate = new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const el = document.createElement('div');
  el.className = 'verdict section-block';
  el.innerHTML = `
    <div class="verdict-left">
      <div class="verdict-place">${shortName(locationName)}</div>
      <div class="verdict-meta">
        ${lat.toFixed(4)}°N · ${Math.abs(lon).toFixed(4)}°${lon < 0 ? 'W' : 'E'}
        ${elevation !== null ? ' · ' + formatElev(elevation) + ' elev.' : ''}
        ${area ? ' · ' + area : ''}
      </div>
      <div class="verdict-summary">${summary}</div>
    </div>
    <div class="verdict-right">
      <span class="verdict-pill ${overallCls}">
        <span class="dot"></span>${overallLabel}
      </span>
      <span class="verdict-date">${dispDate.toUpperCase()}</span>
    </div>`;

  return el;
}


/* ── SHARED UI HELPERS ──────────────────────────────────*/

function sectionHead(title) {
  const el = document.createElement('div');
  el.className = 'section-head';
  el.innerHTML = `<span>${title}</span>`;
  return el;
}

function makeCard(label, badgeText, badgeCls, bodyHTML, expandHTML) {
  const card = document.createElement('div');
  card.className = 'card' + (expandHTML ? ' expandable' : '');
  card.innerHTML = `
    <div class="card-head">
      <span class="card-label">${label}</span>
      <span class="card-badge ${badgeCls}">${badgeText}</span>
      ${expandHTML ? '<span class="expand-arrow">▼</span>' : ''}
    </div>
    <div class="card-body info-stack">${bodyHTML}</div>
    ${expandHTML ? `<div class="expand-content"><div class="card-body info-stack">${expandHTML}</div></div>` : ''}`;
  if (expandHTML) {
    card.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      card.classList.toggle('open');
    });
  }
  return card;
}

function mrow(label, value, valCls) {
  return `<div class="mrow info-row">
    <span class="mrow-label">${label}</span>
    <span class="mrow-val ${valCls || ''}">${value}</span>
  </div>`;
}

function rrow(dotCls, title, note) {
  return `<div class="rrow info-list-item">
    <div class="rrow-dot ${dotCls}"></div>
    <div class="info-list-main">
      <div class="rrow-title info-list-title">${title}</div>
      ${note ? `<div class="rrow-note info-list-detail">${note}</div>` : ''}
    </div>
  </div>`;
}

function prow(name, note, badge, badgeCls) {
  return `<div class="prow info-row">
    <div>
      <div class="prow-name">${name}</div>
      <div class="prow-note">${note}</div>
    </div>
    <span class="prow-badge ${badgeCls}">${badge}</span>
  </div>`;
}

function quickLinks(links) {
  return `<div class="quick-links info-actions">
    ${links.map(l => `<a class="quick-link" href="${l.url}" target="_blank">${l.label} ↗</a>`).join('')}
  </div>`;
}

function noteBox(text) {
  return `<div class="note-box info-callout warn">${text}</div>`;
}



/* ── SECTION CALLERS ────────────────────────────────────*/

function buildMapSection(data) {
  if (typeof buildMap === 'function') return buildMap(data);
  return null;
}

function buildWeatherSection(data) {
  if (typeof buildWeather === 'function') return buildWeather(data);
  return null;
}

function buildSunSection(data) {
  if (typeof buildSun === 'function') return buildSun(data);
  return null;
}

async function buildSoundSection(data) {
  if (typeof buildSound === 'function') return await buildSound(data);
  return null;
}

function buildPermissionsSection(data) {
  if (typeof buildPermissions === 'function') return buildPermissions(data);
  return null;
}

function buildDroneSection(data) {
  if (typeof buildDrone === 'function') return buildDrone(data);
  return null;
}

async function buildServicesSection(data) {
  if (typeof buildServices === 'function') return await buildServices(data);
  return null;
}

async function buildRisksSection(data) {
  if (typeof buildRisks === 'function') return await buildRisks(data);
  return null;
}

async function buildParkingSection(data) {
  if (typeof buildParking === 'function') return await buildParking(data);
  return null;
}

async function buildConnectivitySection(data) {
  if (typeof buildConnectivity === 'function') return await buildConnectivity(data);
  return null;
}


/* ── SHARED ANALYSIS ────────────────────────────────────*/

function calcSoundScore(features) {
  const hasRail    = features.some(f => ['rail','tram'].includes(f.tags?.railway));
  const hasMway    = features.some(f => f.tags?.highway === 'motorway');
  const hasTrunk   = features.some(f => f.tags?.highway === 'trunk');
  const hasPrimary = features.some(f => f.tags?.highway === 'primary');
  const hasInd     = features.some(f => f.tags?.landuse === 'industrial');
  const hasPylon   = features.some(f => f.tags?.power === 'tower');

  let road = 10, rail = 10, ind = 10, rf = 10, urban = 9;
  const items = [];

  if (hasRail)         { rail = 3; items.push({ cls:'flag', title:'Railway within 500m',    note:'Significant audio interference risk — check timetables, quietest window likely 05:00–07:00' }); }
  if (hasMway)         { road = 4; items.push({ cls:'flag', title:'Motorway within 1km',     note:'Constant background noise — consider time of day and wind direction' }); }
  else if (hasTrunk)   { road = 6; items.push({ cls:'warn', title:'Trunk road nearby',       note:'Moderate traffic noise — monitor with headphones on location' }); }
  else if (hasPrimary) { road = 7; items.push({ cls:'warn', title:'Primary road nearby',     note:'Some traffic noise — likely manageable with good mic technique' }); }
  if (hasInd)          { ind  = 5; items.push({ cls:'warn', title:'Industrial land nearby',  note:'Unpredictable mechanical noise — recce at shoot time of day' }); }
  if (hasPylon)        { rf   = 5; items.push({ cls:'warn', title:'Power lines within 400m', note:'Possible EM interference on wireless audio — test frequencies on location' }); }
  if (!items.length)   items.push({ cls:'ok', title:'No major noise sources detected', note:'Low sound risk from mapping data — always verify on a recce' });

  const composite = Math.round((road * 1.5 + rail * 2 + ind + rf + urban) / 6.5);
  return {
    items, road, rail, ind, rf, urban, composite,
    status: composite < 5 ? 'flag' : composite < 7 ? 'warn' : 'ok',
    badge:  composite < 5 ? 'High risk' : composite < 7 ? 'Moderate' : 'Low risk'
  };
}

function calcAirspace(features) {
  const aerodromes = features.filter(f => f.tags?.aeroway === 'aerodrome');
  const helipads   = features.filter(f => f.tags?.aeroway === 'helipad');
  const hasFRZ     = aerodromes.length > 0;
  const name       = aerodromes[0]?.tags?.name || 'aerodrome';
  return {
    hasFRZ, name,
    hasHelipad: helipads.length > 0,
    status: hasFRZ ? 'flag' : helipads.length > 0 ? 'warn' : 'ok',
    badge:  hasFRZ ? 'FRZ likely' : helipads.length > 0 ? 'Check NOTAMs' : 'Clear',
    note: hasFRZ
      ? `Within ~15km of ${name}. A Flight Restriction Zone likely applies — verify on the CAA drone map and Drone Assist before any flight.`
      : helipads.length > 0
      ? 'Helipad within 6km. Check local NOTAMs before flying.'
      : 'No aerodrome or helipad detected nearby. Always verify on the CAA map before any flight.'
  };
}

function calcPermissions(features, address) {
  const isNP   = features.some(f => f.tags?.boundary === 'national_park');
  const isPA   = features.some(f => f.tags?.boundary === 'protected_area' || f.tags?.protect_class);
  const isPark = features.some(f => f.tags?.leisure === 'park');
  const isInd  = features.some(f => f.tags?.landuse === 'industrial');
  const isCo   = features.some(f => f.tags?.natural === 'coastline');
  const county = (address?.address?.county || '').toLowerCase();
  const isAONB = county.includes('aonb') || county.includes('area of outstanding');

  return [
    { name:'National Park',             status: isNP   ? 'flag' : 'ok', badge: isNP   ? 'Permission req.' : 'Clear',     note: isNP   ? 'Within or near a National Park — filming permit required from the park authority' : 'No National Park designation detected' },
    { name:'Protected area / SSSI',     status: isPA   ? 'warn' : 'ok', badge: isPA   ? 'Verify'          : 'Clear',     note: isPA   ? 'Potential protected area — check with Natural England / NatureScot / NRW' : 'No SSSI or designated protected area flagged' },
    { name:'AONB / National Landscape', status: isAONB ? 'warn' : 'ok', badge: isAONB ? 'Check'           : 'Clear',     note: isAONB ? 'Area of Outstanding Natural Beauty — some commercial filming restrictions apply' : 'No AONB designation detected' },
    { name:'Public park',               status: isPark ? 'info' : 'ok', badge: isPark ? 'Permit likely'   : 'Clear',     note: isPark ? 'Public park nearby — most councils require a filming permit for professional use' : 'No managed public park detected nearby' },
    { name:'Industrial / private land', status: isInd  ? 'warn' : 'ok', badge: isInd  ? 'Permission'      : 'Clear',     note: isInd  ? 'Industrial land detected — landowner permission required' : 'No industrial land flagged nearby' },
    { name:'Coastal location',          status: isCo   ? 'info' : 'ok', badge: isCo   ? 'Check tides'     : 'Clear',     note: isCo   ? 'Coastal location — check tide times and MCA safety guidance' : 'No coastline detected nearby' },
    { name:'Crown / MoD land',          status: 'info',                  badge: 'Always check',                           note: 'Crown Estate, MoD, and Forestry England land requires separate clearance — verify via Land Registry' },
  ];
}
