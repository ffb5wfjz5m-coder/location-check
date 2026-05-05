/* ════════════════════════════════════════════════════════
   LOCATION CHECK — risks.js
   Risks section — flood, crime, air quality, environmental
   ════════════════════════════════════════════════════════ */

async function buildRisks(data) {
  const { lat, lon, features, address, airQuality } = data;

  const wrapper = document.createElement('div');
  wrapper.appendChild(sectionHead('Risks'));

  const crimeData = await fetchPoliceCrimeData(lat, lon);

  const card = document.createElement('div');
  card.className = 'card g1';

  // Overall risk assessment
  const floodRisk = getFloodRisk(features);
  const crimeRisk = getCrimeRisk(crimeData);
  const overallCls = floodRisk.cls === 'flag' || crimeRisk.cls === 'flag' ? 'flag'
    : floodRisk.cls === 'warn' || crimeRisk.cls === 'warn' ? 'warn' : 'ok';

  card.innerHTML = `
    <div class="card-head">
      <span class="card-label">Location risk summary</span>
      <span class="card-badge b-${overallCls}">${overallCls === 'flag' ? 'Risks flagged' : overallCls === 'warn' ? 'Check details' : 'Low risk'}</span>
    </div>
    <div class="card-body">
      ${buildRisksSummary(features, crimeData, address, data)}
      ${buildEnvironmentalRisks(features, address, lat, lon, data)}
      ${buildCrimeRisk(crimeData, features, lat, lon, data)}
    </div>`;

  wrapper.appendChild(card);
  return wrapper;
}

/* ── HELPERS ────────────────────────────────────────────*/

async function fetchPoliceCrimeData(lat, lon) {
  try {
    const res = await fetch(`/.netlify/functions/proxy/api/police?lat=${lat}&lon=${lon}`);

    if (!res.ok) {
      throw new Error(`Police proxy returned ${res.status}`);
    }

    const json = await res.json();

    if (!Array.isArray(json)) {
      throw new Error('Police proxy did not return an array');
    }

    return json;
  } catch (err) {
    console.warn('Police crime data unavailable:', err);
    return null;
  }
}

function getFeatureFlags(features = []) {
  return {
    hasCoast: features.some(f => f.tags?.natural === 'coastline'),
    hasRiver: features.some(f => f.tags?.waterway === 'river'),
    hasWater: features.some(f =>
      f.tags?.waterway === 'river' ||
      f.tags?.waterway === 'stream' ||
      f.tags?.natural === 'water'
    ),
    hasPeak: features.some(f => f.tags?.natural === 'peak'),
    isIndustrial: features.some(f => f.tags?.landuse === 'industrial'),
  };
}

function getFloodRisk(features = []) {
  const flags = getFeatureFlags(features);

  if (flags.hasCoast) return { cls: 'warn', label: 'Coastal / tidal check' };
  if (flags.hasRiver || flags.hasWater) return { cls: 'warn', label: 'Water nearby' };

  return { cls: 'ok', label: 'No obvious flood trigger' };
}

function getCrimeCounts(crimeData) {
  const counts = {
    total: 0,
    vehicle: 0,
    antiSocial: 0,
    violent: 0,
    robbery: 0,
    burglary: 0,
    theft: 0,
    shoplifting: 0,
    weapons: 0,
  };

  if (!Array.isArray(crimeData)) return counts;

  counts.total = crimeData.length;

  crimeData.forEach(c => {
    const cat = c.category || '';

    if (cat.includes('vehicle')) counts.vehicle++;
    if (cat.includes('anti-social')) counts.antiSocial++;
    if (cat.includes('violent') || cat.includes('violence')) counts.violent++;
    if (cat.includes('robbery')) counts.robbery++;
    if (cat.includes('burglary')) counts.burglary++;
    if (cat.includes('shoplifting')) counts.shoplifting++;
    if (cat.includes('weapons') || cat.includes('possession-of-weapons')) counts.weapons++;
    if (cat.includes('theft') || cat.includes('shoplifting') || cat.includes('bicycle-theft')) counts.theft++;
  });

  return counts;
}

function getCrimeContext(features = []) {
  const urbanSignals = features.filter(f => {
    const tags = f.tags || {};

    return (
      ['city', 'town', 'suburb', 'neighbourhood', 'quarter'].includes(tags.place) ||
      ['residential', 'commercial', 'retail', 'industrial'].includes(tags.landuse) ||
      tags.building ||
      tags.shop ||
      tags.office ||
      tags.amenity ||
      tags.highway === 'primary' ||
      tags.highway === 'secondary' ||
      tags.highway === 'tertiary'
    );
  }).length;

  const isUrban = urbanSignals >= 5 || features.length > 45;

  return isUrban ? 'urban' : 'rural';
}

function getCrimeThresholds(context) {
  return context === 'urban'
    ? {
        total: { warn: 120, flag: 350 },
        kit: { warn: 45, flag: 130 },
        personal: { warn: 45, flag: 130 },
        day: { warn: 45, flag: 130 },
        night: { warn: 60, flag: 170 },
      }
    : {
        total: { warn: 20, flag: 70 },
        kit: { warn: 8, flag: 25 },
        personal: { warn: 8, flag: 25 },
        day: { warn: 8, flag: 25 },
        night: { warn: 12, flag: 35 },
      };
}

function getCrimeContextNote(context) {
  return context === 'urban'
    ? 'Compared against dense urban / built-up area thresholds — raw incident counts are often higher in cities'
    : 'Compared against rural / low-density area thresholds — smaller numbers can still be more significant';
}

function getCrimeRisk(crimeData, features = []) {
  if (!Array.isArray(crimeData)) return { cls: 'warn', label: 'Crime data unavailable' };

  const counts = getCrimeCounts(crimeData);
  const context = getCrimeContext(features);
  const thresholds = getCrimeThresholds(context);

  let kitRisk = counts.vehicle + counts.robbery + Math.round(counts.theft * 0.4);
  let personalRisk = counts.robbery + counts.violent + Math.round(counts.antiSocial * 0.35);

  // Secondary signals — these gently nudge the score without dominating it.
  // Shoplifting can suggest higher opportunistic theft / area instability.
  // Weapons possession is treated as a stronger crew safety signal.
  if (counts.shoplifting >= 20) kitRisk = Math.round(kitRisk * 1.1);
  if (counts.weapons >= 3) personalRisk = Math.round(personalRisk * 1.2);

  if (
    counts.total >= thresholds.total.flag ||
    kitRisk >= thresholds.kit.flag ||
    personalRisk >= thresholds.personal.flag
  ) {
    return { cls: 'flag', label: 'Higher safety risk', context };
  }

  if (
    counts.total >= thresholds.total.warn ||
    kitRisk >= thresholds.kit.warn ||
    personalRisk >= thresholds.personal.warn
  ) {
    return { cls: 'warn', label: 'Check safety details', context };
  }

  return { cls: 'ok', label: 'Lower recorded crime', context };
}

function riskLevel(value, warnAt, flagAt) {
  if (value >= flagAt * 1.5) return { cls: 'flag', label: 'Very high' };
if (value >= flagAt) return { cls: 'flag', label: 'High' };
if (value >= warnAt) return { cls: 'warn', label: 'Moderate' };
return { cls: 'ok', label: 'Low' };
}

function riskMeter(label, icon, value, warnAt, flagAt, note = '') {
  const level = riskLevel(value, warnAt, flagAt);
  const pct = Math.max(6, Math.min(100, Math.round((value / (flagAt * 1.5)) * 100)));

  return `
    <div class="crime-meter">
      <div class="crime-meter-top">
        <span class="crime-meter-label">${icon} ${label}</span>
        <span class="card-badge b-${level.cls}">${level.label}</span>
      </div>
      <div class="crime-meter-bar">
        <span style="width:${pct}%"></span>
      </div>
      <div class="crime-meter-meta">
        <span>${value} recent incident${value === 1 ? '' : 's'}</span>
        ${note ? `<span>${note}</span>` : ''}
      </div>
    </div>`;
}

function getSevereWeatherRisk(data = {}, flags = {}) {
  const hourly = data.weather?.hourly || data.forecast?.hourly || {};
  const times = hourly.time || [];
  const date = data.date;

  if (!date || !times.length) return null;

  const dayIndexes = times
    .map((t, i) => t && t.startsWith(date) ? i : -1)
    .filter(i => i >= 0);

  if (!dayIndexes.length) return null;

  const maxGust = Math.max(...dayIndexes.map(i =>
    hourly.wind_gusts_10m?.[i] ??
    hourly.windgusts_10m?.[i] ??
    hourly.wind_gusts?.[i] ??
    0
  ));

  const maxRain = Math.max(...dayIndexes.map(i =>
    hourly.rain?.[i] ??
    hourly.precipitation?.[i] ??
    0
  ));

  const stormScore =
    (maxGust >= 45 ? 2 : maxGust >= 30 ? 1 : 0) +
    (maxRain >= 5 ? 2 : maxRain >= 2 ? 1 : 0) +
    ((flags.hasCoast || flags.hasPeak) && maxGust >= 25 ? 1 : 0);

  if (stormScore >= 3) {
    return {
      cls: 'flag',
      icon: '⛈',
      title: 'Severe weather exposure',
      note: 'Forecast suggests conditions may affect crew safety, access, lighting stands, drone ops or travel. Cross-check the weather section before committing.',
    };
  }

  if (stormScore >= 1) {
    return {
      cls: 'warn',
      icon: '🌬',
      title: 'Weather exposure check',
      note: 'Some conditions may be worth checking for access, exposed kit, crew comfort or rigging. See the weather section for the full forecast.',
    };
  }

  return null;
}

function getRadonRisk(address) {
  const county = (address?.address?.county || '').toLowerCase();

  return ['cornwall', 'devon', 'somerset', 'derbyshire', 'northamptonshire', 'highland', 'aberdeenshire']
    .some(c => county.includes(c));
}

/* ── SUMMARY ────────────────────────────────────────────*/
function buildRisksSummary(features, crimeData, address, data = {}) {
  const flags = getFeatureFlags(features);
  const floodRisk = getFloodRisk(features);
  const crimeRisk = getCrimeRisk(crimeData);
  const severeWeather = getSevereWeatherRisk(data, flags);

  const summaryItems = [];

  if (floodRisk.cls !== 'ok') summaryItems.push('water / flood checks');
  if (flags.hasCoast) summaryItems.push('coastal or tidal access');
  if (flags.hasPeak) summaryItems.push('remote / exposed terrain');
  if (flags.isIndustrial) summaryItems.push('industrial land checks');
  if (crimeRisk.cls !== 'ok') summaryItems.push('crime / kit security');
  if (severeWeather?.cls !== 'ok' && severeWeather) summaryItems.push('severe weather exposure');

  const cls = crimeRisk.cls === 'flag' || severeWeather?.cls === 'flag' ? 'flag'
    : floodRisk.cls === 'warn' || crimeRisk.cls === 'warn' || severeWeather?.cls === 'warn' ? 'warn'
    : 'ok';

  const label = cls === 'flag' ? 'Higher risk location'
    : cls === 'warn' ? 'Checks recommended'
    : 'No major risks detected';

  return `
    <div class="risk-section risk-summary">
      <div class="risk-head">
        <span class="card-label">Shoot risk summary</span>
        <span class="card-badge b-${cls}">${label}</span>
      </div>
      <div class="risk-note">
        ${summaryItems.length
          ? `Key checks: ${summaryItems.join(', ')}.`
          : 'No obvious site, crime or kit-security risks were detected from the available data.'}
      </div>
      <div class="risk-note subtle">
        Treat this as a location-scouting prompt, not a formal risk assessment.
      </div>
    </div>`;
}

/* ── ENVIRONMENTAL / SITE RISKS ─────────────────────────*/
function buildEnvironmentalRisks(features, address, lat, lon, data = {}) {
  const flags = getFeatureFlags(features);
  const floodRisk = getFloodRisk(features);
  const severeWeather = getSevereWeatherRisk(data, flags);
  const isRadonRisk = getRadonRisk(address);

  const risks = [];

  if (flags.hasCoast) {
    risks.push({
      icon: '🌊',
      title: 'Coastal / tidal access check',
      note: 'Check tide times, foreshore access, storm surge and whether the route could be cut off by the tide.',
      cls: 'warn',
      confidence: 'Map feature detected',
    });
  }

  if (flags.hasRiver || flags.hasWater) {
    risks.push({
      icon: '💧',
      title: 'Water / flood check',
      note: 'Water is nearby. Check local flood maps, river levels and whether access routes could be affected.',
      cls: floodRisk.cls,
      confidence: 'Nearby water feature',
    });
  }

  if (flags.hasPeak) {
    risks.push({
      icon: '⛰',
      title: 'Remote / exposed terrain',
      note: 'Allow for rapid weather changes, harder emergency access, longer carries and limited shelter.',
      cls: 'warn',
      confidence: 'Terrain feature detected',
    });
  }

  if (flags.isIndustrial) {
    risks.push({
      icon: '🏭',
      title: 'Industrial / contaminated land check',
      note: 'Check access, permissions, hazardous materials, restricted areas and whether PPE may be needed.',
      cls: 'warn',
      confidence: 'Land-use feature detected',
    });
  }

  if (severeWeather) {
    risks.push({
      icon: severeWeather.icon,
      title: severeWeather.title,
      note: severeWeather.note,
      cls: severeWeather.cls,
      confidence: 'Forecast-based check',
    });
  }

  if (isRadonRisk) {
    risks.push({
      icon: '☢️',
      title: 'Radon area check',
      note: 'Potentially relevant for basement, cave, tunnel or long indoor underground shoots.',
      cls: 'info',
      confidence: 'County-level check',
    });
  }

  if (!risks.length) {
    risks.push({
      icon: '✓',
      title: 'No obvious environmental site hazards detected',
      note: 'Still complete a normal location-specific risk assessment before filming.',
      cls: 'ok',
      confidence: 'Basic map check',
    });
  }

  const links = [
    { label: 'EA Flood Map', url: 'https://check-long-term-flood-risk.service.gov.uk/map' },
    { label: 'Flood Warnings', url: 'https://flood-warning-information.service.gov.uk/warnings' },
  ];

  if (flags.hasCoast) {
    links.push({ label: 'Tide times', url: 'https://www.tidetimes.org.uk/' });
  }

  if (isRadonRisk) {
    links.push({ label: 'UK Radon map', url: 'https://www.ukradon.org/information/ukmaps' });
  }

  return `
    <div class="risk-section">
      <div class="risk-head">
        <span class="card-label">Environmental / site hazards</span>
        <span class="card-badge b-${risks.some(r => r.cls === 'flag') ? 'flag' : risks.some(r => r.cls === 'warn') ? 'warn' : 'ok'}">
          ${risks.some(r => r.cls === 'flag') ? 'Risks flagged' : risks.some(r => r.cls === 'warn') ? 'Checks recommended' : 'No obvious hazards'}
        </span>
      </div>

      <div class="info-list risk-info-list">
        ${risks.map(r => `
          <div class="info-list-item env-risk">
            <span class="info-list-icon er-icon">${r.icon}</span>
            <div class="info-list-main">
              <div class="info-list-title er-title">${r.title}</div>
              <div class="info-list-detail er-note">${r.note}</div>
              <div class="info-list-detail er-note subtle">${r.confidence}</div>
            </div>
          </div>`).join('')}
      </div>

      ${quickLinks(links)}
    </div>`;
}

/* ── CRIME & KIT SECURITY ───────────────────────────────*/
function buildCrimeRisk(crimeData, features, lat, lon, data = {}) {
  const risk = getCrimeRisk(crimeData, features);

  if (!Array.isArray(crimeData)) {
    return `
      <div class="risk-section">
        <div class="risk-head">
          <span class="card-label">Crime & kit security</span>
          <span class="card-badge b-warn">Data unavailable</span>
        </div>
        <div class="info-callout warn risk-crime-unavailable">Crime data unavailable for this area. Check manually before leaving kit or vehicles unattended.</div>
        ${quickLinks([
          { label: 'Police.uk crime map', url: 'https://www.police.uk/pu/your-area/' },
          { label: 'Crime stats', url: 'https://crimerate.co.uk/' },
        ])}
      </div>`;
  }

  const counts = getCrimeCounts(crimeData);
  const context = getCrimeContext(features);
  const thresholds = getCrimeThresholds(context);

  let kitRisk = counts.vehicle + counts.robbery + Math.round(counts.theft * 0.4);
  let personalRisk = counts.robbery + counts.violent + Math.round(counts.antiSocial * 0.35);

  // Secondary signals — used as small modifiers, not primary score drivers.
  if (counts.shoplifting >= 20) kitRisk = Math.round(kitRisk * 1.1);
  if (counts.weapons >= 3) personalRisk = Math.round(personalRisk * 1.2);

  const nightRisk = Math.round(personalRisk * 1.25 + counts.vehicle * 0.75);
  const dayRisk = Math.round(personalRisk * 0.75 + counts.vehicle * 0.5);

  const kitLevel = riskLevel(kitRisk, thresholds.kit.warn, thresholds.kit.flag);
  const personalLevel = riskLevel(personalRisk, thresholds.personal.warn, thresholds.personal.flag);
  const dayLevel = riskLevel(dayRisk, thresholds.day.warn, thresholds.day.flag);
  const nightLevel = riskLevel(nightRisk, thresholds.night.warn, thresholds.night.flag);

  const practicalNotes = [];

  if (kitLevel.label === 'Very high' || kitLevel.cls === 'flag') {
    practicalNotes.push('Avoid leaving kit in vehicles unattended; consider additional crew, a dedicated lookout, secure/attended parking, or keeping the vehicle within sight during load-in and pack-down.');
  } else if (kitLevel.cls === 'warn') {
    practicalNotes.push('Use attended or secure parking where possible; keep cases, bags and equipment out of sight.');
  } else {
    practicalNotes.push('Normal precautions should be enough, but do not leave kit visible in the vehicle.');
  }

  if (context === 'urban' && kitLevel.cls !== 'ok') {
    practicalNotes.push('In dense urban areas, underground or multi-storey car parks can reduce visibility and tracking signal. Street parking in a well-lit, high-footfall area may sometimes be preferable to a hidden car park.');
  }

  if (personalLevel.label === 'Very high' || personalLevel.cls === 'flag') {
    practicalNotes.push('Avoid solo load-outs; plan lit routes, keep crew together after dark and be discreet with valuables.');
  } else if (personalLevel.cls === 'warn') {
    practicalNotes.push('Consider crew movement, valuables, small teams, quiet exits and load-out routes.');
  }

  if (dayLevel.cls !== 'ok' && nightLevel.cls !== 'ok') {
    practicalNotes.push('Risk remains elevated across the day and night; do not rely on daylight alone.');
  } else if (dayLevel.cls === 'ok' && nightLevel.cls !== 'ok') {
    practicalNotes.push('Lower daytime risk — consider scheduling filming, load-in and pack-down during daylight hours.');
  }

  if (nightLevel.cls === 'flag') {
    practicalNotes.push('Avoid overnight parking unless the vehicle is secure, monitored or kept very close to base.');
  }

  return `
    <div class="risk-section">
      <div class="risk-head">
        <span class="card-label">Crime & kit security</span>
        <span class="card-badge b-${risk.cls}">${risk.label}</span>
      </div>

      <div class="crime-total">
  ${counts.total} incidents reported in the latest available Police.uk data
  <div class="subtle">
            ${getCrimeContextNote(context)}
  </div>
</div>

      <div class="crime-meter-grid">
        ${riskMeter('Vehicle / van risk', '🚐', kitRisk, thresholds.kit.warn, thresholds.kit.flag, `${counts.vehicle} vehicle crime`)}
        ${riskMeter('Personal safety', '🧍', personalRisk, thresholds.personal.warn, thresholds.personal.flag, `${counts.robbery} robbery / ${counts.violent} violence`)}
        ${riskMeter('Daytime operating risk', '☀️', dayRisk, thresholds.day.warn, thresholds.day.flag, 'Inferred')}
        ${riskMeter('Nighttime operating risk', '🌙', nightRisk, thresholds.night.warn, thresholds.night.flag, 'Inferred')}
      </div>

      <div class="crime-breakdown">
        ${counts.vehicle > 0 ? `<div class="crime-item"><span class="ci-icon">🚐</span><span class="ci-label">Vehicle crime</span><span class="ci-count">${counts.vehicle}</span></div>` : ''}
        ${counts.robbery > 0 ? `<div class="crime-item"><span class="ci-icon">🎒</span><span class="ci-label">Robbery / mugging risk</span><span class="ci-count b-${counts.robbery > 3 ? 'flag' : 'warn'}">${counts.robbery}</span></div>` : ''}
        ${counts.antiSocial > 0 ? `<div class="crime-item"><span class="ci-icon">⚠️</span><span class="ci-label">Anti-social behaviour</span><span class="ci-count">${counts.antiSocial}</span></div>` : ''}
        ${counts.violent > 0 ? `<div class="crime-item"><span class="ci-icon">🚨</span><span class="ci-label">Violence / public order</span><span class="ci-count b-${counts.violent > 5 ? 'flag' : 'warn'}">${counts.violent}</span></div>` : ''}
        ${counts.burglary > 0 ? `<div class="crime-item"><span class="ci-icon">🔒</span><span class="ci-label">Burglary</span><span class="ci-count">${counts.burglary}</span></div>` : ''}
        ${counts.shoplifting > 0 ? `<div class="crime-item"><span class="ci-icon">🛒</span><span class="ci-label">Shoplifting / opportunistic theft signal</span><span class="ci-count b-${counts.shoplifting >= 20 ? 'warn' : 'neu'}">${counts.shoplifting}</span></div>` : ''}
        ${counts.weapons > 0 ? `<div class="crime-item"><span class="ci-icon">⚠️</span><span class="ci-label">Weapons possession signal</span><span class="ci-count b-${counts.weapons >= 3 ? 'flag' : 'warn'}">${counts.weapons}</span></div>` : ''}
      </div>

      <div class="risk-note">
        ${practicalNotes.join(' ')}
      </div>

      <div class="risk-note subtle">
        Day/night risk is inferred from recent crime categories and typical patterns. It reflects practical operating and parking risk, not exact time-of-day crime data.
      </div>

      ${quickLinks([
        { label: 'Police.uk crime map', url: 'https://www.police.uk/pu/your-area/' },
        { label: 'Crime stats', url: 'https://crimerate.co.uk/' },
      ])}
    </div>`;
}
