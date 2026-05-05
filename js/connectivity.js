/* ════════════════════════════════════════════════════════
   LOCATION CHECK — connectivity.js
   Mobile signal, internet and comms planning.

   Important:
   - No direct Ofcom API fetch here — browser requests cause CORS/404 errors.
   - Signal scores are likelihood estimates, not verified coverage.
   - Exact mobile/broadband should be checked with linked external tools.
   ════════════════════════════════════════════════════════ */

async function buildConnectivity(data) {
  const { lat, lon, features = [], address = {} } = data;
  const ctx = getConnectivityContext(lat, lon, features, address);

  const wrapper = document.createElement('div');
  wrapper.appendChild(sectionHead('Connectivity'));

  const card = document.createElement('div');
  card.className = 'card g1 connectivity-card';
  card.innerHTML = `
    <div class="card-head">
      <span class="card-label">Connectivity & comms</span>
      <span class="card-badge b-${ctx.overallCls}">${ctx.overallLabel}</span>
    </div>

    <div class="card-body">
      ${buildConnectivityHero(ctx)}
      ${buildConnectivityQuickInsightRow(ctx)}
      ${buildBestConnectivityRecommendation(ctx)}
      ${buildMobileSignalCards(ctx)}
      ${buildProductionConnectivitySetup(ctx)}
      <div class="conn-fallback-grid">
        ${buildLiveStreamingScore(ctx)}
        ${buildStarlinkSuitability(ctx)}
        ${buildEmergencyCommsCompact(ctx)}
      </div>
      ${buildConnectivityQuickLinks(lat, lon, address, ctx)}
    </div>
  `;

  wrapper.appendChild(card);
  return wrapper;
}

/* ── CONTEXT / SCORING ───────────────────────────────── */

function getConnectivityContext(lat, lon, features, address) {
  const a = address?.address || {};

  const hasCity = !!a.city;
  const hasTown = !!a.town;
  const hasVillage = !!a.village;
  const hasSuburb = !!a.suburb;
  const hasPostcode = !!a.postcode;

  const isUrban = hasCity || hasSuburb;
  const isTown = hasTown && !hasCity;
  const isVillage = hasVillage && !hasTown && !hasCity;
  const isRemote = !hasCity && !hasTown && !hasVillage && !hasSuburb;

  const hasBuildings = features.some(f => f.tags?.building);
  const nearbyBuildings = features.filter(f => f.tags?.building).length;

  const hasCommercial = features.some(f =>
    f.tags?.landuse === 'commercial' ||
    f.tags?.landuse === 'retail' ||
    f.tags?.amenity === 'events_venue'
  );

  const hasIndustrial = features.some(f =>
    f.tags?.landuse === 'industrial' ||
    f.tags?.man_made === 'works'
  );

  const hasWoodland = features.some(f =>
    f.tags?.natural === 'wood' ||
    f.tags?.landuse === 'forest'
  );

  const hasHills = features.some(f => f.tags?.natural === 'peak');
  const hasCoast = features.some(f => f.tags?.natural === 'coastline');

  let placeType = 'Remote / sparse';
  if (isUrban) placeType = 'Urban / built-up';
  else if (isTown) placeType = 'Town';
  else if (isVillage) placeType = 'Village / rural';

  let baseScore = 52;
  if (isUrban) baseScore = 82;
  else if (isTown) baseScore = 72;
  else if (isVillage) baseScore = 61;
  else if (isRemote) baseScore = 42;

  if (hasCommercial) baseScore += 5;
  if (hasIndustrial) baseScore += 3;
  if (hasBuildings && isUrban) baseScore -= 6;
  if (hasWoodland) baseScore -= 9;
  if (hasHills) baseScore -= 10;
  if (hasCoast && !isRemote) baseScore += 2;

  baseScore = clamp(baseScore, 18, 92);

  const overall = scoreLabel(baseScore);

  return {
    lat,
    lon,
    postcode: a.postcode || '',
    hasPostcode,
    placeType,
    isUrban,
    isTown,
    isVillage,
    isRemote,
    hasBuildings,
    nearbyBuildings,
    hasCommercial,
    hasIndustrial,
    hasWoodland,
    hasHills,
    hasCoast,
    baseScore,
    overallLabel: overall.label,
    overallCls: overall.cls
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function scoreLabel(score) {
  if (score >= 75) return { label: 'High chance of good signal', cls: 'ok' };
  if (score >= 55) return { label: 'Mixed / check first', cls: 'warn' };
  return { label: 'Signal risk', cls: 'flag' };
}

function likelihoodLabel(score) {
  if (score >= 82) return 'Strong';
  if (score >= 68) return 'Good';
  if (score >= 52) return 'Variable';
  if (score >= 36) return 'Limited';
  return 'Poor';
}

function scoreCls(score) {
  if (score >= 68) return 'ok';
  if (score >= 42) return 'warn';
  return 'flag';
}

function barCount(score) {
  if (score >= 82) return 4;
  if (score >= 64) return 3;
  if (score >= 45) return 2;
  if (score >= 28) return 1;
  return 0;
}

/* ── HERO SUMMARY ────────────────────────────────────── */

function buildConnectivityHero(ctx) {
  let headline = 'Likely workable, but test exact position.';
  if (ctx.isUrban) headline = 'Good baseline expected, but interiors may weaken signal.';
  if (ctx.isVillage) headline = 'Likely network-dependent — check all major providers.';
  if (ctx.isRemote) headline = 'Treat as a comms-risk location until tested.';

  return `
    <div class="conn-hero b-${ctx.overallCls}">
      <div class="conn-hero-score">
        <span>${overallGrade(ctx.baseScore)}</span>
      </div>
      <div class="conn-hero-copy">
        <div class="conn-hero-title">${ctx.overallLabel}</div>
        <div class="conn-hero-note">${headline}</div>
      </div>
    </div>

    <div class="conn-meta-grid">
      ${miniStat('Location type', ctx.placeType)}
      ${miniStat('Postcode', ctx.postcode || 'Not found')}
      ${miniStat('Confidence', ctx.hasPostcode ? 'Checker-ready' : 'Estimate only')}
    </div>
  `;
}

function overallGrade(score) {
  if (score >= 75) return 'Good';
  if (score >= 55) return 'Mixed';
  return 'Risk';
}

function miniStat(label, value) {
  return `
    <div class="info-tile conn-mini-stat">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

/* ── MOBILE SIGNAL CARDS ─────────────────────────────── */

function buildConnectivityQuickInsightRow(ctx) {
  const networks = getNetworkLikelihoods(ctx);
  const summary = getSignalSummary(networks);
  const upload = getUploadReadiness(ctx);

  return `
    <div class="conn-insight-row">
      ${connInsightTile('Outdoor signal', summary.outdoorLabel, summary.outdoorCls, 'Unit base, street, car park')}
      ${connInsightTile('Indoor signal', summary.indoorLabel, summary.indoorCls, 'Venues, basements, thick walls')}
      ${connInsightTile('Upload / live', upload.label, upload.cls, upload.note)}
    </div>
  `;
}

function getUploadReadiness(ctx) {
  let score = ctx.baseScore - 12;

  if (ctx.isUrban) score += 5;
  if (ctx.hasBuildings) score -= 8;
  if (ctx.isRemote) score -= 12;
  if (ctx.hasWoodland || ctx.hasHills) score -= 8;

  score = clamp(score, 10, 90);

  if (score >= 70) {
    return { label: 'Likely viable', cls: 'ok', note: 'Still test exact encoder position' };
  }

  if (score >= 45) {
    return { label: 'Test required', cls: 'warn', note: 'Do not assume stable upload' };
  }

  return { label: 'Backup needed', cls: 'flag', note: 'Starlink / bonded advised' };
}

function connInsightTile(label, value, cls, note) {
  return `
    <div class="info-tile conn-insight-tile ${cls}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </div>
  `;
}

function buildBestConnectivityRecommendation(ctx) {
  let title = 'Phone hotspot should be workable';
  let note = 'Use a normal phone hotspot or small 4G/5G router, but still run a quick speed test at the actual setup position.';
  let cls = 'ok';

  if (ctx.isUrban && ctx.hasBuildings) {
    title = 'Bring a 4G/5G router + second-network SIM';
    note = 'Outdoor signal is likely better than indoor. For interviews, monitors or client review, place the router near a window or unit base.';
    cls = 'warn';
  } else if (ctx.isVillage || ctx.isTown) {
    title = 'Check networks and bring a second-network SIM';
    note = 'This is likely usable, but network choice matters. Test EE, O2, Vodafone and Three before relying on one provider.';
    cls = 'warn';
  } else if (ctx.isRemote) {
    title = 'Treat as comms risk — bring Starlink or bonded backup';
    note = 'For remote shoots, live upload or safety-critical comms, do not rely on mobile coverage alone.';
    cls = 'flag';
  }

  return `
    <div class="conn-best-rec b-${cls}">
      <div>
        <span class="conn-kicker">Best practical setup</span>
        <strong>${title}</strong>
        <p>${note}</p>
      </div>
    </div>
  `;
}

function buildProductionConnectivitySetup(ctx) {
  const upload = getUploadReadiness(ctx);

  const liveText = upload.cls === 'ok'
    ? 'Mobile may work, but test upload at encoder position and keep a backup route ready.'
    : upload.cls === 'warn'
      ? 'Bring backup internet. Do not sell live delivery without a site test.'
      : 'Use Starlink, bonded cellular or venue hard-line. Mobile-only is too risky.';

  const remoteText = ctx.isRemote
    ? 'Add radios, check-ins, satellite messenger / PLB where appropriate, and a shared emergency access plan.'
    : 'Confirm nearest road, access point and emergency location reference. Radios still help inside larger venues.';

  return `
    <div class="conn-block conn-production">
      <div class="conn-block-head">
        <span class="card-label">Production setup</span>
      </div>

      <div class="guidance-list conn-production-list">
        ${productionTile('🎒', 'Small shoot', 'Phone hotspot usually fine. Check signal on arrival and download key docs offline.')}
        ${productionTile('🎥', 'Interview / monitors', 'Use a 4G/5G router, spare SIM, local recordings and offline backups for client review.')}
        ${productionTile('📡', 'Live stream', liveText)}
        ${productionTile('🆘', 'Remote / emergency', remoteText)}
      </div>
    </div>
  `;
}

function productionTile(icon, title, note) {
  return `
    <div class="guidance-item">
      <span class="guidance-icon">${icon}</span>
      <span class="guidance-text"><strong>${title}</strong><br>${note}</span>
    </div>
  `;
}

function buildMobileSignalCards(ctx) {
  const networks = getNetworkLikelihoods(ctx);
  const signalSummary = getSignalSummary(networks);

  return `
    <div class="conn-block">
      <div class="conn-block-head">
        <span class="card-label">Mobile signal</span>
        <span class="card-badge b-neu">Likelihood estimate</span>
      </div>

      <div class="network-card-grid">
        ${networks.map(n => networkSignalCard(n)).join('')}
      </div>

      <div class="conn-small-note">
        Outdoor = street, car park, unit base or exterior location. Indoor = inside venues, thick-walled buildings, basements or studios. These are estimates only — verify with Ofcom/network checkers before relying on them.
      </div>
    </div>
  `;
}

function getSignalSummary(networks) {
  const avgOutdoor = Math.round(
    networks.reduce((sum, n) => sum + n.outdoor, 0) / networks.length
  );

  const avgIndoor = Math.round(
    networks.reduce((sum, n) => sum + n.indoor, 0) / networks.length
  );

  return {
    outdoorLabel: likelihoodLabel(avgOutdoor),
    indoorLabel: likelihoodLabel(avgIndoor),
    outdoorCls: scoreCls(avgOutdoor),
    indoorCls: scoreCls(avgIndoor)
  };
}

function buildSignalSummary(summary) {
  return `
    <div class="signal-summary">
      <div class="signal-summary-item ${summary.outdoorCls}">
        <span class="signal-summary-label">Outdoor</span>
        <strong>${summary.outdoorLabel}</strong>
      </div>
      <div class="signal-summary-item ${summary.indoorCls}">
        <span class="signal-summary-label">Indoor</span>
        <strong>${summary.indoorLabel}</strong>
      </div>
    </div>
  `;
}

function getNetworkLikelihoods(ctx) {
  let ee = ctx.baseScore;
  let o2 = ctx.baseScore;
  let vodafone = ctx.baseScore;
  let three = ctx.baseScore;

  if (ctx.isRemote || ctx.isVillage) {
    ee += 7;
    vodafone += 3;
    o2 -= 1;
    three -= 7;
  }

  if (ctx.isUrban) {
    three += 4;
    ee += 2;
    o2 += 1;
    vodafone += 1;
  }

  if (ctx.hasHills || ctx.hasWoodland) {
    three -= 4;
    o2 -= 2;
  }

  const indoorDrop = getIndoorSignalDrop(ctx);

  return [
    makeNetwork('EE', ee, indoorDrop, ctx.isRemote || ctx.isVillage ? 'Check first rurally' : 'Strong all-rounder'),
    makeNetwork('O2', o2, indoorDrop, 'Check indoor signal'),
    makeNetwork('Vodafone', vodafone, indoorDrop, 'Good backup to check'),
    makeNetwork('Three', three, indoorDrop + (ctx.isRemote ? 5 : 0), ctx.isUrban ? 'Often good urban option' : 'Can be patchy rurally')
  ];
}

function getIndoorSignalDrop(ctx) {
  let drop = 16;

  if (ctx.isUrban) drop += 6;
  if (ctx.isTown) drop += 4;
  if (ctx.isRemote) drop += 8;
  if (ctx.hasBuildings) drop += 6;
  if (ctx.hasHills || ctx.hasWoodland) drop += 5;

  return drop;
}

function makeNetwork(name, outdoorScore, indoorDrop, note) {
  const outdoor = clamp(Math.round(outdoorScore), 10, 96);
  const indoor = clamp(Math.round(outdoorScore - indoorDrop), 5, 90);

  return {
    name,
    outdoor,
    indoor,
    note,
    outdoorLabel: likelihoodLabel(outdoor),
    indoorLabel: likelihoodLabel(indoor),
    outdoorCls: scoreCls(outdoor),
    indoorCls: scoreCls(indoor)
  };
}

function networkSignalCard(n) {
  return `
    <div class="network-card">
      <div class="network-card-head">
        <div class="network-name">${n.name}</div>
        <div class="network-bars" aria-label="${n.outdoorLabel} outdoor signal">
          ${signalBars(n.outdoor)}
        </div>
      </div>

      <div class="network-row">
        <span>Outdoor</span>
        <strong class="${n.outdoorCls}">${n.outdoorLabel}</strong>
      </div>

      <div class="network-row">
        <span>Indoor</span>
        <strong class="${n.indoorCls}">${n.indoorLabel}</strong>
      </div>

      <div class="network-note">${n.note}</div>
    </div>
  `;
}

function signalBars(score) {
  const lit = barCount(score);
  const cls = scoreCls(score);

  return [1, 2, 3, 4].map(i => `
    <span class="network-bar h${i} ${i <= lit ? `lit ${cls}` : ''}"></span>
  `).join('');
}

/* ── LIVE STREAMING ──────────────────────────────────── */

function buildLiveStreamingScore(ctx) {
  let streamScore = ctx.baseScore - 12;

  if (ctx.isUrban) streamScore += 5;
  if (ctx.hasBuildings) streamScore -= 8;
  if (ctx.isRemote) streamScore -= 12;
  if (ctx.hasWoodland || ctx.hasHills) streamScore -= 8;

  streamScore = clamp(streamScore, 10, 90);

  const cls = scoreCls(streamScore);
  const label = streamScore >= 70
    ? 'Likely viable'
    : streamScore >= 45
      ? 'Test required'
      : 'Backup strongly advised';

  return `
    <div class="conn-block">
      <div class="conn-block-head">
        <span class="card-label">Live streaming / upload</span>
        <span class="card-badge b-${cls}">${label}</span>
      </div>

      <div class="stream-readiness b-${cls}">
        <div class="stream-readiness-main">${label}</div>
        <div class="stream-readiness-note">
          ${streamScore >= 70
            ? 'Mobile or venue internet may be workable, but test at the exact encoder position.'
            : streamScore >= 45
              ? 'Do not assume upload will be stable. Test first and plan a fallback.'
              : 'For paid or critical live work, bring Starlink, bonded cellular or a venue hard-line.'}
        </div>
      </div>

      <div class="conn-mini-rows">
        ${mrow('Basic 1080p target', '5 Mbps upload')}
        ${mrow('Safer target', '10–20 Mbps upload')}
        ${mrow('Critical live work', streamScore >= 70 ? 'Still test on site' : 'Bring backup internet')}
      </div>
    </div>
  `;
}

/* ── STARLINK SUITABILITY ────────────────────────────── */

function buildStarlinkSuitability(ctx) {
  let label = 'Likely good';
  let cls = 'ok';
  let reason = 'Open or mixed area — should be suitable if the dish has a clear view of the sky.';

  if (ctx.hasBuildings && ctx.isUrban) {
    label = 'Check obstruction';
    cls = 'warn';
    reason = 'Built-up area — rooftops, courtyards, tall buildings or narrow streets may obstruct the dish.';
  }

  if (ctx.hasWoodland) {
    label = 'Obstruction risk';
    cls = 'warn';
    reason = 'Woodland nearby — trees can block satellite view. Test dish position before relying on it.';
  }

  if (ctx.hasHills && ctx.isRemote) {
    label = 'Terrain-dependent';
    cls = 'warn';
    reason = 'Remote terrain may work well, but steep valleys or cliffs can limit sky view.';
  }

  return `
    <div class="conn-block">
      <div class="conn-block-head">
        <span class="card-label">Starlink suitability</span>
        <span class="card-badge b-${cls}">${label}</span>
      </div>

      <div class="starlink-suitability b-${cls}">
        <div class="starlink-main">${label}</div>
        <div class="starlink-reason">${reason}</div>
        <div class="starlink-meta">
          ${ctx.nearbyBuildings} mapped structures nearby · clear sky still required
        </div>
      </div>
    </div>
  `;
}

/* ── RECOMMENDED STACK ───────────────────────────────── */

function buildRecommendedConnectivityStack(ctx) {
  let intro = 'For this location, a sensible production setup would be:';
  let items = [];

  if (ctx.isRemote) {
    items = [
      ['📡', 'Starlink primary', 'Best backup for remote unit base or live upload', 'Recommended'],
      ['📻', 'Radios for crew', 'Useful if phones fail between base, parking and set', 'Recommended'],
      ['🆘', 'Emergency backup', 'Satellite messenger / PLB for remote or high-risk work', 'Consider']
    ];
  } else if (ctx.isUrban) {
    items = [
      ['📱', '4G/5G router', 'Good flexible backup, ideally with a second-network SIM', 'Recommended'],
      ['🌐', 'Venue internet', 'Ask for dedicated WiFi or wired Ethernet if streaming', 'Check'],
      ['📻', 'Radios', 'Useful indoors, but range may drop in thick buildings', 'Optional']
    ];
  } else {
    items = [
      ['📱', 'Multi-network check', 'Test EE, O2, Vodafone and Three before shoot day', 'Recommended'],
      ['📡', 'Starlink backup', 'Worth considering if upload or comms are critical', 'Consider'],
      ['📻', 'Radios', 'Useful across larger rural sites or split crew areas', 'Recommended']
    ];
  }

  return `
    <div class="conn-block">
      <div class="conn-block-head">
        <span class="card-label">Recommended connectivity stack</span>
      </div>

      <div class="stack-intro">${intro}</div>

      <div class="stack-list">
        ${items.map(item => stackItem(item[0], item[1], item[2], item[3])).join('')}
      </div>
    </div>
  `;
}

function stackItem(icon, title, note, tag) {
  return `
    <div class="stack-item">
      <span class="stack-icon">${icon}</span>
      <div class="stack-copy">
        <div class="stack-title">${title}</div>
        <div class="stack-note">${note}</div>
      </div>
      <span class="stack-tag">${tag}</span>
    </div>
  `;
}

/* ── EMERGENCY COMMS ─────────────────────────────────── */

function buildEmergencyCommsCompact(ctx) {
  const cls = ctx.isRemote ? 'flag' : 'ok';
  const label = ctx.isRemote ? 'Plan backup' : 'Standard checks';

  return `
    <div class="conn-block">
      <div class="conn-block-head">
        <span class="card-label">Emergency comms</span>
        <span class="card-badge b-${cls}">${label}</span>
      </div>

      <div class="conn-emergency b-${cls}">
        ${ctx.isRemote
          ? 'Remote/sparse location: brief crew on what to do if phones fail. Consider satellite messenger, PLB, agreed check-ins and a shared access route.'
          : 'Coverage is more likely, but still confirm the exact access point, nearest road and emergency location reference.'}
      </div>

      <div class="conn-small-note">
        Emergency calls can use another available mobile network, but there still needs to be some network coverage.
      </div>
    </div>
  `;
}

/* ── QUICK LINKS ─────────────────────────────────────── */

function buildConnectivityQuickLinks(lat, lon, address, ctx) {
  const postcode = ctx?.postcode || address?.address?.postcode || '';

  const links = [
    { label: 'Ofcom mobile checker', url: 'https://checker.ofcom.org.uk/en-gb/mobile-coverage' },
    { label: 'EE coverage', url: 'https://coverage.ee.co.uk/' },
    { label: 'O2 coverage', url: 'https://www.o2.co.uk/coveragechecker' },
    { label: 'Vodafone coverage', url: 'https://coverage.vodafone.co.uk/' },
    { label: 'Three coverage', url: 'https://coverage.three.co.uk/' },
    { label: 'Speedtest', url: 'https://www.speedtest.net/' },
    { label: 'Starlink map', url: 'https://www.starlink.com/map' }
  ];

  return `
    <div class="conn-links">
      <div class="card-label" style="margin-bottom:0.45rem">Check exact coverage</div>
      <div class="conn-small-note" style="margin-bottom:0.6rem">
        ${postcode ? `Use postcode ${postcode} for manual checks.` : 'Use the nearest postcode or exact venue address for manual checks.'}
      </div>
      ${quickLinks(links)}
    </div>
  `;
}