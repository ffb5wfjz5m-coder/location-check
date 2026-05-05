/* ════════════════════════════════════════════════════════
   LOCATION CHECK — sound.js
   Sound & RF environment section.
   Production-focused sound risk, weather/wind noise, sirens,
   aircraft/flight-path awareness, RF caution and useful links.
   ════════════════════════════════════════════════════════ */


/* ── MAIN BUILD FUNCTION ────────────────────────────────*/

async function buildSound(data) {
  const { lat, lon, features, address, weatherData, date } = data;

  const wrapper = document.createElement('div');
  wrapper.appendChild(sectionHead('Sound & RF'));

  const todayIdx  = typeof getTodayIndex === 'function' && weatherData
    ? getTodayIndex(weatherData, date) : 0;
  const windGusts = weatherData?.daily?.windgusts_10m_max?.[todayIdx] ?? 0;
  const windSpeed = weatherData?.daily?.windspeed_10m_max?.[todayIdx] ?? 0;
  const rain      = weatherData?.daily?.precipitation_sum?.[todayIdx] ?? 0;
  const rainPct   = weatherData?.daily?.precipitation_probability_max?.[todayIdx] ?? 0;

  const sound        = calcSoundScore(features, address, { windGusts, windSpeed, rain, rainPct }, lat, lon);
  const weatherSound = calcWeatherSoundScore({ windGusts, windSpeed, rain, rainPct });

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <span class="card-label">Sound environment & RF</span>
      <span class="card-badge b-${sound.status}">${sound.badge}</span>
    </div>
    <div class="card-body info-stack">
      ${buildSoundScore(sound)}
      ${buildWeatherSoundScore(weatherSound)}
      ${buildNoiseBreakdown(sound)}
      ${buildWindNoise(windGusts)}
      ${buildSirenRisk(sound)}
      ${buildAircraftRisk(sound, lat, lon)}
      ${buildQuietestWindow(sound)}
      ${buildRFEnvironment(sound, lat, lon)}
      ${buildSoundQuickLinks(lat, lon)}
    </div>`;

  wrapper.appendChild(card);
  return wrapper;
}


/* ── SOUND SCORE LOGIC ──────────────────────────────────*/

function calcSoundScore(features, address, weather = {}, lat = null, lon = null) {

  /* Distance helper */
  function getLatLon(f) {
    if (f.lat && f.lon) return { lat: f.lat, lon: f.lon };
    if (f.center) return f.center;
    return null;
  }

  function distKm(f) {
    const p = getLatLon(f);
    if (!p || lat === null) return null;
    const R    = 6371;
    const dLat = (p.lat - lat) * Math.PI / 180;
    const dLon = (p.lon - lon) * Math.PI / 180;
    const a    =
      Math.sin(dLat/2)**2 +
      Math.cos(lat * Math.PI / 180) *
      Math.cos(p.lat * Math.PI / 180) *
      Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function nearestDistance(filter) {
    let min = null;
    features.forEach(f => {
      if (!filter(f)) return;
      const d = distKm(f);
      if (d === null) return;
      if (min === null || d < min) min = d;
    });
    return min;
  }

  function clamp(v) { return Math.max(0, Math.min(10, v)); }

  /* Urban density flags */
  const buildingCount    = features.filter(f => f.tags?.building).length;
  const shopAmenityCount = features.filter(f => f.tags?.shop || f.tags?.amenity || f.tags?.office || f.tags?.tourism).length;
  const majorRoadCount   = features.filter(f => ['motorway','trunk','primary','secondary'].includes(f.tags?.highway)).length;

  const isVeryUrban = buildingCount > 80 || shopAmenityCount > 35 || majorRoadCount > 20;
  const isUrban     = buildingCount > 40 || shopAmenityCount > 18 || majorRoadCount > 10;

  /* ── ROAD ──────────────────────────────────────── */
  const dMotorway  = nearestDistance(f => ['motorway','trunk'].includes(f.tags?.highway));
  const dPrimary   = nearestDistance(f => f.tags?.highway === 'primary');
  const dSecondary = nearestDistance(f => f.tags?.highway === 'secondary');

  let roadScore = 10;
  if (dMotorway  !== null && dMotorway  < 1.2) roadScore -= 4;
  if (dPrimary   !== null && dPrimary   < 0.8) roadScore -= 3;
  if (dSecondary !== null && dSecondary < 0.6) roadScore -= 1.5;

  const resCount    = features.filter(f => f.tags?.highway === 'residential').length;
  if (resCount > 40) roadScore -= 1;
  else if (resCount > 20) roadScore -= 0.5;

  const roundabouts = features.filter(f => f.tags?.junction === 'roundabout').length;
  if (roundabouts > 0) roadScore -= 1;
  if (!isUrban && roadScore === 10) roadScore = 9.2;

  /* ── RAIL ──────────────────────────────────────── */
  const dRail = nearestDistance(f => f.tags?.railway === 'rail' || f.tags?.railway === 'subway');
  let railScore = 10;
  if (dRail !== null && dRail < 0.8) railScore -= 3;
  railScore = clamp(railScore);

  /* ── SIRENS ────────────────────────────────────── */
  const dEmergency = nearestDistance(f => ['hospital','fire_station','police'].includes(f.tags?.amenity));
  let sirenScore = 10;
  if      (dEmergency !== null && dEmergency < 0.5) sirenScore -= 4;
  else if (dEmergency !== null && dEmergency < 1.5) sirenScore -= 2.5;
  else if (dEmergency !== null && dEmergency < 2.5) sirenScore -= 1.2;
  if (isVeryUrban) sirenScore -= 1.2;
  else if (isUrban) sirenScore -= 0.6;
  if (roadScore < 4 && sirenScore < 8) sirenScore -= 0.8;
  sirenScore = clamp(sirenScore);

  /* ── SCHOOLS ───────────────────────────────────── */
  const dSchool = nearestDistance(f => f.tags?.amenity === 'school' || f.tags?.leisure === 'playground');
  let schoolScore = 10;
  if (dSchool !== null && dSchool < 0.8) schoolScore -= 2;
  schoolScore = clamp(schoolScore);

  /* ── AIRCRAFT ──────────────────────────────────── */
  const dAircraft = nearestDistance(f =>
    ['aerodrome','terminal','runway','apron','helipad'].includes(f.tags?.aeroway) ||
    f.tags?.military === 'airfield'
  );
  const hasAirport = dAircraft !== null;
  let aircraftScore = 9.2;
  if      (dAircraft !== null && dAircraft < 2) aircraftScore = 6;
  else if (dAircraft !== null && dAircraft < 6) aircraftScore = 7.5;
  if (isVeryUrban) aircraftScore -= 0.5;
  aircraftScore = clamp(aircraftScore);

  /* ── INDUSTRIAL ────────────────────────────────── */
  const dIndustrial = nearestDistance(f => f.tags?.landuse === 'industrial' || f.tags?.landuse === 'construction');
  let industrialScore = 10;
  if (dIndustrial !== null && dIndustrial < 1) industrialScore -= 2;
  industrialScore = clamp(industrialScore);

  /* ── URBAN ─────────────────────────────────────── */
  let urbanScore = 8.8;
  if      (isVeryUrban) urbanScore = 4.5;
  else if (isUrban)     urbanScore = 6.5;

  /* ── COMPOSITE ─────────────────────────────────── */
  const final =
    roadScore      * 0.30 +
    urbanScore     * 0.20 +
    railScore      * 0.15 +
    sirenScore     * 0.15 +
    schoolScore    * 0.10 +
    aircraftScore  * 0.05 +
    industrialScore* 0.05;

  const composite = Math.round(final * 10) / 10;

  return {
    composite,
    badge:  composite >= 7 ? 'Good' : composite >= 5 ? 'Mixed' : 'Challenging',
    status: composite >= 7 ? 'ok'   : composite >= 5 ? 'warn'  : 'flag',

    road:       Math.round(roadScore       * 10) / 10,
    rail:       Math.round(railScore       * 10) / 10,
    urban:      Math.round(urbanScore      * 10) / 10,
    siren:      Math.round(sirenScore      * 10) / 10,
    school:     Math.round(schoolScore     * 10) / 10,
    aircraft:   Math.round(aircraftScore   * 10) / 10,
    industrial: Math.round(industrialScore * 10) / 10,

    // Flags used by downstream display functions
    hasAirport,
    hasSirens:    sirenScore < 8.5,
    isDenseUrban: isVeryUrban,
    hasRail:      dRail !== null && dRail < 0.8,
    hasMajorRoad: dMotorway !== null && dMotorway < 1.2,

    items: buildSoundSourceItems({
      roadScore, railScore, urbanScore, sirenScore,
      schoolScore, aircraftScore, industrialScore
    })
  };
}

function buildSoundSourceItems(scores) {
  const items = [];

  if (scores.roadScore < 7)        items.push({ title: scores.roadScore < 4 ? 'Heavy road / traffic pressure' : 'Road activity nearby',    note: scores.roadScore < 4 ? 'Major or busy roads nearby — traffic rumble likely to affect exterior dialogue.' : 'Some vehicle noise possible, especially at busier times.',    cls: scores.roadScore < 4.5 ? 'flag' : 'warn' });
  if (scores.railScore < 8)        items.push({ title: 'Rail / tube / tram nearby',         note: 'Possible train rumble or intermittent rail noise.',                                                                                                                                                                    cls: scores.railScore < 5.5 ? 'flag' : 'warn' });
  if (scores.urbanScore < 7)       items.push({ title: 'Urban sound environment',            note: 'General street activity and background noise possible.',                                                                                                                                                               cls: scores.urbanScore < 5 ? 'flag' : 'warn' });
  if (scores.sirenScore < 8.5)     items.push({ title: 'Siren / emergency services risk',    note: 'Possible sirens in the area.',                                                                                                                                                                                        cls: scores.sirenScore < 5.5 ? 'flag' : 'warn' });
  if (scores.schoolScore < 8.5)    items.push({ title: 'School / playground noise risk',     note: 'Children and school activity may affect recording.',                                                                                                                                                                   cls: scores.schoolScore < 6 ? 'flag' : 'warn' });
  if (scores.aircraftScore < 8.5)  items.push({ title: 'Aircraft / flight path caution',     note: 'Possible aircraft or helicopter noise.',                                                                                                                                                                              cls: scores.aircraftScore < 6 ? 'flag' : 'warn' });
  if (scores.industrialScore < 8.5)items.push({ title: 'Industrial / works risk',            note: 'Possible machinery or construction noise.',                                                                                                                                                                           cls: scores.industrialScore < 6 ? 'flag' : 'warn' });

  if (!items.length) {
    items.push({ title: 'No major sound sources detected', note: 'Likely a quieter location.', cls: 'ok' });
  }

  return items;
}


/* ── COMPOSITE SCORE DISPLAY ────────────────────────────*/

function buildSoundScore(sound) {
  const pct = sound.composite / 10 * 100;
  const cls = sound.composite >= 7 ? 'ok' : sound.composite >= 5 ? 'warn' : 'flag';

  return `
    <div class="sound-score-wrap">
      <div class="sound-score-head">
        <span class="sound-score-num">${sound.composite}<span class="sound-score-denom">/10</span></span>
        <span class="sound-score-label">Location sound score</span>
        <span class="card-badge b-${cls}">${sound.badge}</span>
      </div>
      <div class="sound-score-bar">
        <div class="sound-score-fill" style="width:${pct}%;background:${cls === 'ok' ? 'var(--ok)' : cls === 'warn' ? 'var(--warn)' : 'var(--flag)'}"></div>
      </div>
      <div class="sound-sub-scores">
        ${buildSubScore('Road',       sound.road)}
        ${buildSubScore('Rail',       sound.rail)}
        ${buildSubScore('Urban',      sound.urban)}
        ${buildSubScore('Sirens',     sound.siren)}
        ${buildSubScore('Schools',    sound.school)}
        ${buildSubScore('Aircraft',   sound.aircraft)}
        ${buildSubScore('Industrial', sound.industrial)}
      </div>
    </div>`;
}

function buildSubScore(label, score) {
  const cls = score >= 7 ? 'ok' : score >= 5 ? 'warn' : 'flag';
  const pct = score / 10 * 100;
  return `
    <div class="sub-score">
      <span class="sub-score-label">${label}</span>
      <div class="sub-score-bar">
        <div class="sub-score-fill b-${cls}" style="width:${pct}%"></div>
      </div>
      <span class="sub-score-val">${score}/10</span>
    </div>`;
}


/* ── WEATHER SOUND SCORE ────────────────────────────────*/

function calcWeatherSoundScore(weather) {
  let score = 10;
  const notes = [];

  if      (weather.windGusts >= 45) { score -= 5.5; notes.push('Very strong gusts — clean exterior audio will be difficult.'); }
  else if (weather.windGusts >= 35) { score -= 4.5; notes.push('High wind noise risk — full blimp strongly recommended.'); }
  else if (weather.windGusts >= 25) { score -= 3;   notes.push('Wind protection needed.'); }
  else if (weather.windGusts >= 18) { score -= 1.5; notes.push('Light wind protection may be useful outdoors.'); }

  if      (weather.rain > 8 || weather.rainPct > 75) { score -= 3.5; notes.push('Rain noise likely on roofs, roads, clothing and umbrellas.'); }
  else if (weather.rain > 2 || weather.rainPct > 50) { score -= 2;   notes.push('Some rain noise risk.'); }
  else if (weather.rain > 0.3 || weather.rainPct > 35) { score -= 1; notes.push('Light rain noise possible.'); }

  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return {
    score,
    label: score >= 8 ? 'Good weather for sound' : score >= 5 ? 'Weather checks needed' : 'Weather sound risk',
    cls:   score >= 8 ? 'ok' : score >= 5 ? 'warn' : 'flag',
    notes
  };
}

function buildWeatherSoundScore(w) {
  const pct = w.score / 10 * 100;
  return `
    <div class="sound-score-wrap">
      <div class="sound-score-head">
        <span class="sound-score-num">${w.score}<span class="sound-score-denom">/10</span></span>
        <span class="sound-score-label">Weather sound score</span>
        <span class="card-badge b-${w.cls}">${w.label}</span>
      </div>
      <div class="sound-score-bar">
        <div class="sound-score-fill" style="width:${pct}%;background:${w.cls === 'ok' ? 'var(--ok)' : w.cls === 'warn' ? 'var(--warn)' : 'var(--flag)'}"></div>
      </div>
      <div class="guidance-list sound-guidance-list">
        <div class="guidance-item">
          <span class="guidance-icon">🎙</span>
          <div class="guidance-text">${w.notes.join(' ') || 'No major weather sound issues.'}</div>
        </div>
      </div>
    </div>`;
}


/* ── NOISE BREAKDOWN ────────────────────────────────────*/

function buildNoiseBreakdown(sound) {
  const rows = sound.items.map(item => `
    <div class="guidance-item">
      <span class="guidance-icon">•</span>
      <div class="guidance-text">
        <strong>${item.title}</strong>
        ${item.note ? `<div class="guidance-sub">${item.note}</div>` : ''}
      </div>
    </div>`).join('');

  return `
    <div class="noise-breakdown">
      <div class="card-label">Noise sources detected</div>
      <div class="guidance-list sound-guidance-list">
        ${rows}
      </div>
    </div>`;
}


/* ── WIND NOISE ─────────────────────────────────────────*/

function buildWindNoise(gusts) {
  let risk, cls, note;

  if      (gusts < 15) { risk = 'Low wind noise risk';    cls = 'ok';   note = 'Calm conditions — standard foam / softie may be enough for sheltered exteriors.'; }
  else if (gusts < 25) { risk = 'Moderate wind noise';    cls = 'warn'; note = 'Use deadcat / proper wind protection. Exposed boom work may need care.'; }
  else if (gusts < 40) { risk = 'High wind noise risk';   cls = 'flag'; note = 'Full blimp strongly recommended. Consider lavs under clothing and sheltered framing.'; }
  else                 { risk = 'Extreme wind noise';     cls = 'flag'; note = 'Outdoor dialogue will be difficult. Treat clean sync sound as high risk.'; }

  return `
    <div class="wind-noise">
      <div class="wn-head">
        <span class="card-label">Wind noise risk</span>
        <span class="card-badge b-${cls}">${risk}</span>
      </div>
      <div class="guidance-list sound-guidance-list">
        <div class="guidance-item">
          <span class="guidance-icon">🌬</span>
          <div class="guidance-text">${note}</div>
        </div>
      </div>
    </div>`;
}


/* ── SIREN / EMERGENCY RISK ─────────────────────────────*/

function buildSirenRisk(sound) {
  if (!sound.hasSirens) return '';

  return `
    <div class="siren-risk">
      <div class="wn-head">
        <span class="card-label">Siren risk</span>
        <span class="card-badge b-warn">Possible interruptions</span>
      </div>
      <div class="guidance-list sound-guidance-list">
        <div class="guidance-item">
          <span class="guidance-icon">🚨</span>
          <div class="guidance-text">Emergency services nearby — expect occasional sirens and hold for clean takes where needed.</div>
        </div>
      </div>
    </div>`;
}


/* ── AIRCRAFT / FLIGHT PATH RISK ────────────────────────*/

function buildAircraftRisk(sound, lat, lon) {
  const cls   = sound.hasAirport ? 'warn' : sound.isDenseUrban ? 'warn' : 'ok';
  const badge = sound.hasAirport ? 'Nearby aviation source' : sound.isDenseUrban ? 'Check flight paths' : 'Low mapped risk';
  const note  = sound.hasAirport
    ? 'Airport, aerodrome or helipad features detected nearby. Check aircraft activity before critical interviews.'
    : sound.isDenseUrban
      ? 'Dense urban locations may still sit under approach routes or helicopter paths. Check live flight activity if audio is critical.'
      : 'No obvious aviation feature detected nearby. Still check if recording long exterior dialogue.';

  return `
    <div class="aircraft-risk">
      <div class="wn-head">
        <span class="card-label">Aircraft / flight path risk</span>
        <span class="card-badge b-${cls}">${badge}</span>
      </div>
      <div class="guidance-list sound-guidance-list">
        <div class="guidance-item">
          <span class="guidance-icon">✈️</span>
          <div class="guidance-text">${note}</div>
        </div>
      </div>
      ${quickLinks([
        { label: 'FlightRadar24',   url: 'https://www.flightradar24.com/' },
        { label: 'ADS-B Exchange',  url: `https://globe.adsbexchange.com/?lat=${lat}&lon=${lon}&zoom=11` }
      ])}
    </div>`;
}


/* ── QUIETEST WINDOW ────────────────────────────────────*/

function buildQuietestWindow(sound) {
  let window, note, cls;

  if (sound.isDenseUrban && (sound.hasMajorRoad || sound.hasSirens)) {
    window = 'No reliable quiet window';
    note   = 'Central / busy urban location — scout with headphones and expect intermittent interruptions.';
    cls    = 'flag';
  } else if (sound.isDenseUrban) {
    window = '05:00 – 06:30';
    note   = 'Best chance before deliveries, commuter traffic and pedestrian activity build.';
    cls    = 'warn';
  } else if (sound.hasRail && sound.hasMajorRoad) {
    window = '05:00 – 06:30';
    note   = 'Before morning traffic builds. Check local rail movements if recording dialogue.';
    cls    = 'warn';
  } else if (sound.hasRail) {
    window = 'Late night / early morning';
    note   = 'Rail noise varies heavily by timetable — check specific services before committing.';
    cls    = 'warn';
  } else if (sound.hasMajorRoad) {
    window = '03:00 – 06:00';
    note   = 'Pre-dawn usually gives the lowest road traffic, but check safety / access.';
    cls    = 'warn';
  } else {
    window = 'Flexible';
    note   = 'No major mapped noise source detected. Still scout with headphones on arrival.';
    cls    = 'ok';
  }

  return `
    <div class="quietest-window">
      <div class="qw-head">
        <span class="card-label">Quietest recording window</span>
        <span class="card-badge b-${cls}">${window}</span>
      </div>
      <div class="qw-note">${note}</div>
    </div>`;
}


/* ── RF ENVIRONMENT ─────────────────────────────────────*/

function buildRFEnvironment(sound, lat, lon) {
  let label = 'Likely manageable';
  let cls   = 'ok';
  const notes = [];

  const airportOrAirbase   = sound.hasAirport;
  const denseUrban         = sound.urban <= 5.5;
  const townUrban          = sound.urban <= 7;
  const majorTransportHub  = sound.rail <= 5;
  const heavyRoadUrban     = denseUrban && sound.road <= 4;

  if (airportOrAirbase || majorTransportHub || heavyRoadUrban) {
    label = 'High RF caution'; cls = 'flag';
    if (airportOrAirbase)   notes.push('Airport, airbase, terminal, runway or helipad activity nearby.');
    if (majorTransportHub)  notes.push('Major rail / transport hub nearby — busy RF environment likely.');
    if (heavyRoadUrban)     notes.push('Dense urban infrastructure — wireless congestion and reflections likely.');
  } else if (denseUrban) {
    label = 'Busy RF likely'; cls = 'warn';
    notes.push('Dense urban area — expect wireless congestion and multipath reflections.');
  } else if (townUrban) {
    label = 'Scan carefully'; cls = 'warn';
    notes.push('Town / suburban environment — usually workable, but scan before recording.');
  } else {
    label = 'Likely manageable'; cls = 'ok';
    notes.push('Lower-density area — usually cleaner RF, but still scan on location.');
  }

  return `
    <div class="rf-environment">
      <div class="rf-head">
        <span class="card-label">RF environment</span>
        <span class="card-badge b-${cls}">${label}</span>
      </div>
      <div class="guidance-list sound-guidance-list">
        ${notes.map(n => `
          <div class="guidance-item">
            <span class="guidance-icon">📡</span>
            <div class="guidance-text">${n}</div>
          </div>
        `).join('')}
        <div class="guidance-item">
          <span class="guidance-icon">📡</span>
          <div class="guidance-text">This is an RF risk estimate, not a live frequency scan.</div>
        </div>
        <div class="guidance-item">
          <span class="guidance-icon">📡</span>
          <div class="guidance-text">Always scan on location using your receiver.</div>
        </div>
        <div class="guidance-item">
          <span class="guidance-icon">🎧</span>
          <div class="guidance-text">Keep wired backup for critical interviews.</div>
        </div>
      </div>
      ${quickLinks([
        { label: 'CellMapper mast map',      url: `https://www.cellmapper.net/map?lat=${lat}&lng=${lon}&z=13` },
        { label: 'Ofcom PMSE licence info',  url: 'https://www.ofcom.org.uk/spectrum/radio-equipment/pmse-licence-info' },
        { label: 'Wireless mics & monitors', url: 'https://www.ofcom.org.uk/spectrum/radio-equipment/mics-monitors' },
        { label: 'FlightRadar24',            url: 'https://www.flightradar24.com/' }
      ])}
    </div>`;
}


/* ── QUICK LINKS ────────────────────────────────────────*/

function buildSoundQuickLinks(lat, lon) {
  return quickLinks([
    { label: 'CellMapper mast map',      url: `https://www.cellmapper.net/map?lat=${lat}&lng=${lon}&z=13` },
    { label: 'Ofcom PMSE licence info',  url: 'https://www.ofcom.org.uk/spectrum/radio-equipment/pmse-licence-info' },
    { label: 'Wireless mics & monitors', url: 'https://www.ofcom.org.uk/spectrum/radio-equipment/mics-monitors' },
    { label: 'Ofcom spectrum info',      url: 'https://www.ofcom.org.uk/spectrum/frequencies/spectrum-information' }
  ]);
}
