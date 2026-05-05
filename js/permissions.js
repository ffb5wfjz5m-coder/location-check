/* ════════════════════════════════════════════════════════
   LOCATION CHECK — permissions.js
   Land & permissions section.
   Uses OSM features + Nominatim address data.
   IMPORTANT:
   This does NOT confirm legal land ownership.
   It provides filming permission routes + land-control signals.
   ════════════════════════════════════════════════════════ */

function buildPermissions(data) {
  const { lat, lon, features, address, locationName, placeInfo } = data;

  const wrapper = document.createElement('div');
  wrapper.appendChild(sectionHead('Land & Permissions'));

  const perms = calcPermissions(features, address);
  const controller = calcLandController(features, address, perms, lat, lon, locationName, placeInfo);
  const flags = perms.filter(p => p.status === 'flag').length;
  const warns = perms.filter(p => p.status === 'warn').length;

  const overallStatus = controller.enforcement === 'high' || flags > 0
    ? 'flag'
    : controller.enforcement === 'medium' || warns > 0
      ? 'warn'
      : 'ok';

  const overallLabel = overallStatus === 'flag'
    ? 'Permission likely required'
    : overallStatus === 'warn'
      ? 'Verify before shoot'
      : 'No major restrictions detected';

  const card = document.createElement('div');
  card.className = `card g1 permissions-card permissions-${overallStatus}`;
  card.innerHTML = `
    <div class="card-head">
      <span class="card-label">Land control & filming permissions</span>
      <span class="card-badge b-${overallStatus}">${overallLabel}</span>
    </div>
    <div class="card-body info-stack">
      ${buildPermissionsDisclaimer()}
${buildPinBasedNotice(placeInfo)}
${buildLandControlSummary(controller, address)}
      ${buildPlaceContact(placeInfo, address, controller)}
      ${buildPlaceDebug(placeInfo)}
      ${buildSiteOwnershipRestrictions(perms, controller)}
      ${buildTypicalFilmingRestrictions(controller)}
${buildFilmingNotes(perms, features, address, controller)}
${buildPermissionAndResearchTools(lat, lon, address, controller)}
    </div>`;

  wrapper.appendChild(card);
  return wrapper;
}

/* ── LOCAL DISCLAIMER ───────────────────────────────────*/
function buildPermissionsDisclaimer() {
  return `
    <div class="perm-disclaimer">
      <strong>Guidance only.</strong> This is based on public map data and inferred signals. Always confirm with the relevant landowner or authority before filming.
    </div>`;
}

/* ── PIN / COORDINATE NOTICE ───────────────────────────*/
function buildPinBasedNotice(placeInfo) {
  const hasUsefulPlace =
    placeInfo?.name &&
    !isGenericPlaceName(placeInfo.name);

  const hasDirectContact =
    Boolean(placeInfo?.website || placeInfo?.phone);

  if (hasUsefulPlace || hasDirectContact) return '';

  return `
    <div class="perm-disclaimer">
      <strong>Pin-based result.</strong> This guidance is inferred from nearby map data and may be less precise. For more accurate results, search for a named place or address where possible.
    </div>`;
}

/* ── BASIC LAND DESIGNATION FLAGS ───────────────────────*/
function calcPermissions(features = [], address = {}) {
  const rows = [];

  const allText = [
    address?.display_name,
    address?.name,
    address?.type,
    address?.class,
    ...features.map(f => Object.values(f.tags || {}).join(' '))
  ].filter(Boolean).join(' ').toLowerCase();

  const anyTag = (key, value) => features.some(f => {
    const tagVal = String(f.tags?.[key] || '').toLowerCase();
    if (!tagVal) return false;
    return value ? tagVal === value : true;
  });

  if (anyTag('boundary', 'national_park') || allText.includes('national park')) {
    rows.push({
      name: 'National Park',
      status: 'flag',
      badge: 'Permission route likely',
      note: 'National Parks are mixed-ownership areas. You may need landowner permission as well as park authority guidance.'
    });
  }

  if (
    anyTag('boundary', 'protected_area') ||
    anyTag('protect_class') ||
    allText.includes('sssi') ||
    allText.includes('site of special scientific interest')
  ) {
    rows.push({
      name: 'Protected area / SSSI',
      status: 'warn',
      badge: 'Check restrictions',
      note: 'Protected sites may have conservation, wildlife, drone, access, or seasonal restrictions.'
    });
  }

  if (
    anyTag('leisure', 'park') ||
    anyTag('leisure', 'garden') ||
    anyTag('leisure', 'recreation_ground') ||
    anyTag('landuse', 'recreation_ground') ||
    allText.includes('recreation ground') ||
    allText.includes('gardens')
  ) {
    rows.push({
      name: 'Public park',
      status: 'info',
      badge: 'Managed space',
      note: 'Commercial filming in parks often needs council, trust, or site-manager permission.'
    });
  }

  if (
    anyTag('natural', 'beach') ||
    anyTag('natural', 'coastline') ||
    anyTag('natural', 'water') ||
    anyTag('waterway') ||
    allText.includes('beach') ||
    allText.includes('river') ||
    allText.includes('canal') ||
    allText.includes('harbour') ||
    allText.includes('marina')
  ) {
    rows.push({
      name: 'Coastal / water location',
      status: 'info',
      badge: 'Check ownership',
      note: 'Coastal and water locations can involve council, harbour, navigation, Crown Estate, or private landowner checks.'
    });
  }

  if (
    anyTag('landuse', 'industrial') ||
    anyTag('landuse', 'commercial') ||
    anyTag('landuse', 'retail')
  ) {
    rows.push({
      name: 'Industrial / private land',
      status: 'warn',
      badge: 'Likely managed',
      note: 'Industrial, commercial, and retail areas often require written permission from the site owner, operator, or estate manager.'
    });
  }

  if (!rows.length) {
    rows.push({
      name: 'No clear designation flag',
      status: 'ok',
      badge: 'No obvious flag',
      note: 'No major land-designation signal was detected from the available map data. Still verify ownership and access before filming.'
    });
  }

  return rows;
}

/* ── LAND CONTROLLER / PERMISSION ROUTE ENGINE ──────────*/
function calcLandController(features = [], address = {}, perms = [], searchLat = null, searchLon = null, locationName = '', placeInfo = null) {
  const council = getLikelyCouncilName(address);
  const placeTypes = Array.isArray(placeInfo?.types) ? placeInfo.types : [];
  const placeName = placeInfo?.name || '';
  const isLandContext = placeInfo?.source === 'land_context';
  const landType = isLandContext ? (placeTypes[0] || '') : '';
  const usefulPlaceName = getUsefulPlaceName(placeInfo, address);

  const addressText = [
    locationName,
    placeInfo?.name,
    placeInfo?.address,
    address?.display_name,
    address?.name,
    address?.type,
    address?.class
  ].filter(Boolean).join(' ').toLowerCase();

  const addressMentions = value => addressText.includes(value);
  const placeTypeIs = type => placeTypes.includes(type);

  const isObviousRoadContext =
    landType === 'road' ||
    addressMentions('road') ||
    addressMentions('street') ||
    addressMentions('lane') ||
    addressMentions('avenue') ||
    addressMentions('high street');

  const railPlaceName = String(placeName || '').toLowerCase();

  const isGenericRailLineName =
    railPlaceName.includes('line - westbound') ||
    railPlaceName.includes('line - eastbound') ||
    railPlaceName.includes('line - northbound') ||
    railPlaceName.includes('line - southbound');

  const isExplicitRailContext =
    addressMentions('railway station') ||
    addressMentions('train station') ||
    addressMentions('station') ||
    (
      placeTypeIs('rail') &&
      placeName &&
      !isGenericRailLineName &&
      (
        railPlaceName.includes('station') ||
        railPlaceName.includes('platform') ||
        railPlaceName.includes('railway land') ||
        railPlaceName.includes('railway infrastructure')
      )
    );

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
    if (!pt || !Number.isFinite(Number(searchLat)) || !Number.isFinite(Number(searchLon))) return false;
    return metresBetween(Number(searchLat), Number(searchLon), pt.lat, pt.lon) <= 25;
  });

  const hasCloseTag = (key, value) =>
    closeFeatures.some(f => {
      const tagVal = String(f.tags?.[key] || '').toLowerCase();
      if (!tagVal) return false;
      return value ? tagVal === value : true;
    });

  const hasAnyTag = (key, value) =>
    features.some(f => {
      const tagVal = String(f.tags?.[key] || '').toLowerCase();
      if (!tagVal) return false;
      return value ? tagVal === value : true;
    });

  const hasCloseAccessRestriction =
    closeFeatures.some(f =>
      ['private', 'no', 'restricted'].includes(String(f.tags?.access || '').toLowerCase())
    );

  const knownEstates = [
    {
      match: ['canary wharf', 'cabot place', 'canada place', 'jubilee place', 'crossrail place', 'wood wharf', 'north colonnade', 'bank street'],
      name: 'Canary Wharf Group / estate management'
    },
    {
      match: ['media city', 'mediacity', 'salford quays'],
      name: 'MediaCityUK / Peel Group / estate management'
    },
    {
      match: ['westfield shepherds bush', 'westfield london', 'white city shopping centre'],
      name: 'Westfield / Unibail-Rodamco-Westfield / estate management'
    },
    {
      match: ['lakeside shopping centre', 'thurrock shopping park'],
      name: 'Lakeside Shopping Centre / estate management'
    },
    {
      match: ['battersea power station'],
      name: 'Battersea Power Station estate management'
    },
    {
      match: ['king\'s cross', 'kings cross', 'coal drops yard', 'granary square'],
      name: 'King’s Cross estate management'
    },
    {
      match: ['broadgate'],
      name: 'Broadgate estate management'
    }
  ];

  const detectedEstate = knownEstates.find(e =>
    e.match.some(m => addressText.includes(m))
  );

  const detectedEstateName = pointLooksLikeCanaryWharf(searchLat, searchLon)
    ? 'Canary Wharf Group / estate management'
    : detectedEstate?.name || '';

  const result = obj => permissionResult({
    ...obj,
    council,
    secondary: cleanList(obj.secondary || []),
    alsoCheck: cleanList(obj.alsoCheck || [])
  });

/* ── KNOWN MANAGED ESTATES ─────────────────────────── */
  if (detectedEstateName) {
    if (landType === 'building') {
      return result({
        name: usefulPlaceName ? `${usefulPlaceName} — building occupier / site management` : 'Building occupier / site management',
        route: usefulPlaceName ? `Building occupier / site management for ${usefulPlaceName}` : 'Building occupier / site management',
        type: 'Building within managed estate / commercial area',
        confidence: usefulPlaceName ? 'High' : 'Medium',
        enforcement: 'high',
        access: 'Privately managed / controlled',
        permission: 'Permission likely required',
        reason: usefulPlaceName
          ? `${usefulPlaceName} appears to sit within a known managed estate. Filming permissions may depend on whether you are filming on/inside the building itself, or in surrounding estate-controlled public-facing areas.`
          : 'This building appears to sit within a known managed estate. Filming permissions may depend on whether you are filming on/inside the building itself, or in surrounding estate-controlled public-facing areas.',
        nextStep: usefulPlaceName
          ? `Contact the building occupier, facilities team, or site management for ${usefulPlaceName}. Also check ${detectedEstateName} for surrounding estate areas.`
          : `Contact the building occupier or site management. Also check ${detectedEstateName} for surrounding estate areas.`,
        secondary: [
          `${detectedEstateName} — surrounding estate areas, plazas, walkways, and estate-controlled public-facing spaces`
        ],
        alsoCheck: [
          council ? `${council} — surrounding public realm, highways, parking, or road impact` : ''
        ],
        signals: [`Known managed estate detected: ${detectedEstateName}`]
      });
    }

    return result({
      name: detectedEstateName,
      route: `${detectedEstateName} filming / estate permission`,
      type: 'Managed estate / commercial area',
      confidence: 'High',
      enforcement: 'high',
      access: 'Privately managed public space',
      permission: 'Permission likely required',
      reason: 'This location appears to fall within a known managed estate rather than standard council-controlled public highway.',
      nextStep: `Contact ${detectedEstateName}. Also check council/highways if filming impacts public roads, pavements, parking, or traffic nearby.`,
      secondary: [
        usefulPlaceName && usefulPlaceName !== detectedEstateName ? `${usefulPlaceName} — local site/building/operator contact if filming on that specific site` : ''
      ],
      alsoCheck: [
        council ? `${council} — surrounding public realm, highways, parking, or road impact` : ''
      ],
      signals: [`Known managed estate detected: ${detectedEstateName}`]
    });
  }

    /* ── RAIL / STATION ────────────────────────────────── */
  if (
    !isObviousRoadContext &&
    isExplicitRailContext
  ) {
    return result({
      name: 'Network Rail / rail or station operator',
      route: 'Network Rail / station operator filming permission',
      type: 'Rail infrastructure',
      confidence: 'High',
      enforcement: 'high',
      access: 'Restricted / controlled',
      permission: 'Permission required',
      reason: 'Railway or station infrastructure appears to be under or very close to the selected pin.',
      nextStep: 'Contact Network Rail, the station operator, or relevant rail estate team before filming. If filming on nearby roads, pavements, or station approaches, also check the local council.',
      secondary: [
        'Station operator / rail estate team',
        'Car park operator — if filming in a station car park'
      ],
      alsoCheck: [
        council ? `${council} — surrounding public realm, highways, parking, or road impact` : 'Local authority — surrounding public realm, highways, parking, or road impact'
      ],
      signals: ['Rail or station signal detected.']
    });
  }

  /* ── CLEAR ROAD / STATION OVERRIDE ─────────────────── */
  if (isObviousRoadContext) {
    return result({
      name: council || 'Local authority / highways',
      route: 'Council highways / filming permit',
      type: 'Public highway / road',
      confidence: 'Medium',
      enforcement: 'medium',
      access: 'Public',
      permission: 'Permission is likely required for commercial filming',
      reason: 'The selected/search context appears to be a road, street, pavement, or public highway, so nearby rail, tunnel, or bridge signals have been ignored.',
      nextStep: 'Check with council highways or the local filming office if using crew, tripod, lighting, parking bays, traffic control, or causing disruption.',
      secondary: [
        'Highways / parking team — if vehicles, cones, bays, or traffic impact are involved'
      ],
      alsoCheck: [],
      signals: ['Road/highway context override applied.']
    });
  }

  if (addressMentions('station')) {
    return result({
      name: 'Network Rail / rail or station operator',
      route: 'Network Rail / station operator filming permission',
      type: 'Rail infrastructure',
      confidence: 'High',
      enforcement: 'high',
      access: 'Restricted / controlled',
      permission: 'Permission required',
      reason: 'The selected/search context appears to be a station, so rail/station permission has been prioritised over nearby bridge, tunnel, road, or water signals.',
      nextStep: 'Contact Network Rail, the station operator, or relevant rail estate team before filming. If filming on nearby roads, pavements, or station approaches, also check the local council.',
      secondary: [
        'Station operator / rail estate team',
        'Car park operator — if filming in a station car park'
      ],
      alsoCheck: [
        council ? `${council} — surrounding public realm, highways, parking, or road impact` : 'Local authority — surrounding public realm, highways, parking, or road impact'
      ],
      signals: ['Station context override applied.']
    });
  }

    /* ── BRIDGE / TUNNEL / TRANSPORT STRUCTURE ──────────── */
  if (
    !placeTypeIs('rail') &&
    !addressMentions('station') &&
    (
      hasCloseTag('tunnel', 'yes') ||
      (
        hasCloseTag('bridge', 'yes') &&
        addressMentions('bridge') &&
        !addressMentions('park') &&
        !addressMentions('gardens')
      ) ||
      (
        hasCloseTag('man_made', 'bridge') &&
        addressMentions('bridge') &&
        !addressMentions('park') &&
        !addressMentions('gardens')
      )
    )
  ) {
    return result({
      name: 'Transport authority / infrastructure owner',
      route: 'Council / transport authority / asset owner',
      type: 'Bridge / tunnel infrastructure',
      confidence: 'Medium',
      enforcement: 'high',
      access: 'Controlled / sensitive',
      permission: 'Permission likely required',
      reason: 'Location appears to be on or near bridge, tunnel, or transport infrastructure.',
      nextStep: 'Check the council or relevant transport authority such as TfL, National Highways, Network Rail, or the asset owner.',
      secondary: [
        'Transport authority / asset owner'
      ],
      alsoCheck: [
        council ? `${council} — highways, structures, and public realm` : 'Local authority — highways, structures, and public realm'
      ],
      signals: ['Bridge/tunnel signal detected.']
    });
  }

  /* ── EDUCATION ─────────────────────────────────────── */
  if (
    placeTypeIs('education') ||
    placeTypeIs('school') ||
    hasCloseTag('amenity', 'school') ||
    hasCloseTag('amenity', 'college') ||
    hasCloseTag('amenity', 'university') ||
    addressMentions('school') ||
    addressMentions('college') ||
    addressMentions('university')
  ) {
    return result({
      name: usefulPlaceName || 'School / education site',
      route: 'School / site management permission',
      type: 'Education site',
      confidence: 'High',
      enforcement: 'high',
      access: 'Controlled / safeguarding-sensitive',
      permission: 'Permission required',
      reason: 'The selected location appears to be within or very close to school, college, or university land.',
      nextStep: 'Contact the school/site management team. Avoid filming pupils, entrances, staff, or identifiable school activity without approval.',
      secondary: [
        'Safeguarding / site management team'
      ],
      alsoCheck: [
        council ? `${council} — surrounding public realm or street filming` : 'Local authority — surrounding public realm or street filming'
      ],
      signals: ['Education land signal detected.']
    });
  }

  /* ── HEALTHCARE ────────────────────────────────────── */
  if (
    placeTypeIs('hospital') ||
    hasCloseTag('amenity', 'hospital') ||
    addressMentions('hospital') ||
    addressMentions('nhs')
  ) {
    return result({
      name: usefulPlaceName || 'Hospital / healthcare site',
      route: 'Hospital trust / site management permission',
      type: 'Healthcare site',
      confidence: 'High',
      enforcement: 'high',
      access: 'Controlled / privacy-sensitive',
      permission: 'Permission required',
      reason: 'The selected location appears to be within or very close to a hospital or healthcare facility.',
      nextStep: 'Contact the NHS trust, communications team, estates team, or site management before filming.',
      secondary: [
        'NHS trust / communications team',
        'Hospital estates / facilities team'
      ],
      alsoCheck: [
        council ? `${council} — surrounding public realm or street filming` : 'Local authority — surrounding public realm or street filming'
      ],
      signals: ['Healthcare site signal detected.']
    });
  }

  /* ── POLICE / HIGH-SENSITIVITY PUBLIC SERVICES ─────── */
  if (
    placeTypeIs('police') ||
    hasCloseTag('amenity', 'police') ||
    addressMentions('police station') ||
    addressMentions('prison') ||
    addressMentions('military')
  ) {
    return result({
      name: usefulPlaceName || 'Police / sensitive public service site',
      route: 'Site operator / public authority permission',
      type: 'Sensitive / restricted site',
      confidence: 'High',
      enforcement: 'high',
      access: 'Controlled / sensitive',
      permission: 'Permission likely required',
      reason: 'The selected location appears to be a police, prison, military, or otherwise sensitive public service site.',
      nextStep: 'Contact the relevant site operator, press office, estates team, or public authority before filming.',
      secondary: [
        'Site security / facilities team',
        'Relevant public authority press office'
      ],
      alsoCheck: [
        council ? `${council} — surrounding public realm or street filming` : 'Local authority — surrounding public realm or street filming'
      ],
      signals: ['Sensitive public service signal detected.']
    });
  }

  /* ── ROYAL PARKS ───────────────────────────────────── */
  if (
  !isObviousRoadContext &&
  !placeTypeIs('rail') &&
  looksLikeRoyalPark(addressText, searchLat, searchLon)
) {
    return result({
      name: 'The Royal Parks',
      route: 'The Royal Parks filming / commercial permit',
      type: 'Royal Park / managed public park',
      confidence: 'High',
      enforcement: 'high',
      access: 'Public access, controlled filming',
      permission: 'Permission required for commercial filming',
      reason: 'This location appears to be within or very close to one of London’s Royal Parks.',
      nextStep: 'Apply via The Royal Parks. If filming near an edge, road, station, or surrounding pavement, also check the relevant council, highways, or transport authority.',
      secondary: [
        'Local council / highways — if filming on surrounding streets or pavements'
      ],
      alsoCheck: [
        council ? `${council} — surrounding public realm, highways, parking, or road impact` : ''
      ],
      signals: ['Royal Park match from place name or coordinate area.']
    });
  }

  /* ── PARKS / GARDENS / RECREATION GROUNDS ──────────── */
  if (
    !isObviousRoadContext &&
    !addressMentions('business park') &&
    !addressMentions('industrial park') &&
    !addressMentions('retail park') &&
    !addressMentions('trading estate') &&
    (
      placeTypeIs('park') ||
      hasCloseTag('leisure', 'park') ||
      hasCloseTag('leisure', 'garden') ||
      hasCloseTag('leisure', 'recreation_ground') ||
      hasCloseTag('landuse', 'recreation_ground') ||
      addressMentions('gardens') ||
      addressMentions('recreation ground') ||
      addressMentions('common')
    )
  ) {
    const parkController = inferControllerFromPlaceInfo(placeInfo) || council || 'Local authority / park manager';

    return result({
      name: parkController,
      route: `${parkController} parks / filming permit route`,
      type: 'Public park / managed open space',
      confidence: placeInfo?.source === 'land_context' || placeTypeIs('park') ? 'High' : council ? 'Medium' : 'Low',
      enforcement: 'medium',
      access: 'Public access, managed filming',
      permission: 'Permission often required for commercial filming',
      reason: usefulPlaceName
        ? `The selected location appears to be within or close to ${usefulPlaceName}, a park, garden, recreation ground, common, or managed open space.`
        : 'The selected location appears to be a park, garden, recreation ground, common, or managed open space.',
      nextStep: `Start with ${parkController}. For larger shoots, check parks/events teams, tripod/lighting rules, drone restrictions, and any on-site operator.`,
      secondary: [
        'Parks / events team',
        'Park operator / trust — if separately managed'
      ],
      alsoCheck: [
        parkController !== council && council ? `${council} — public realm, highways, parking, road impact, or local filming permit route` : ''
      ],
      signals: [
        placeInfo?.source === 'land_context' && usefulPlaceName ? `OSM polygon match: ${usefulPlaceName}` : 'Park/open-space signal detected.',
        placeInfo?.website ? `Website found: ${placeInfo.website}` : '',
        placeInfo?.operator ? `Operator: ${placeInfo.operator}` : ''
      ].filter(Boolean)
    });
  }

    /* ── COAST / WATER / CANALS / RIVERS ───────────────── */
  if (
    !isObviousRoadContext &&
    !placeTypeIs('rail') &&
    (
      hasCloseTag('natural', 'beach') ||
      hasCloseTag('natural', 'coastline') ||
      addressMentions('beach') ||
      addressMentions('coast') ||
      addressMentions('foreshore') ||
      addressMentions('harbour') ||
      addressMentions('marina') ||
      addressMentions('dock') ||
      addressMentions('docks') ||
      (
        (hasCloseTag('natural', 'water') || hasCloseTag('waterway')) &&
        (addressMentions('river') || addressMentions('canal'))
      )
    )
  ) {
    return result({
      name: usefulPlaceName || 'Foreshore / waterway authority or landowner',
      route: 'Council / harbour / navigation authority / landowner check',
      type: 'Coastal / water / foreshore',
      confidence: 'Medium',
      enforcement: 'medium',
      access: 'Public or mixed access',
      permission: 'Verify before commercial filming',
      reason: 'The selected location appears to be coastal, foreshore, beach, harbour, dock, river, canal, or waterway land.',
      nextStep: 'Check the local council first, then verify harbour, marina, navigation authority, Canal & River Trust, Crown Estate, or private landowner involvement where relevant.',
      secondary: [
        addressMentions('canal') ? 'Canal & River Trust / navigation authority' : '',
        addressMentions('harbour') || addressMentions('marina') || addressMentions('dock') ? 'Harbour / marina / port authority' : '',
        'Crown Estate / Land Registry — if foreshore ownership matters'
      ],
      alsoCheck: [
        council ? `${council} — public realm, highways, beach, foreshore, or local filming route` : 'Local authority — public realm, beach, foreshore, or local filming route'
      ],
      signals: ['Water/coastal land signal detected.']
    });
  }

    

  /* ── ROADS / HIGHWAYS ──────────────────────────────── */
  if (
    landType === 'road' ||
    hasCloseTag('highway') ||
    addressMentions('road') ||
    addressMentions('street') ||
    addressMentions('lane') ||
    addressMentions('avenue') ||
    addressMentions('high street')
  ) {
    return result({
      name: council || 'Local authority / highways',
      route: 'Council highways / filming permit',
      type: 'Public highway / road',
      confidence: 'Medium',
      enforcement: 'medium',
      access: 'Public',
      permission: 'Permission is likely required for commercial filming',
      reason: 'Location appears to be on a road, pavement, or public highway.',
      nextStep: 'Check with council highways or the local filming office if using crew, tripod, lighting, parking bays, traffic control, or causing disruption.',
      secondary: [
        'Highways / parking team — if vehicles, cones, bays, or traffic impact are involved'
      ],
      alsoCheck: [],
      signals: ['Road/highway signal detected.']
    });
  }

  /* ── RESIDENTIAL ───────────────────────────────────── */
  if (
    landType === 'residential' ||
    hasCloseTag('landuse', 'residential') ||
    addressMentions('residential')
  ) {
    return result({
      name: 'Residential / private property',
      route: 'Property owner / resident permission',
      type: 'Residential area',
      confidence: 'Medium',
      enforcement: 'high',
      access: 'Private / mixed',
      permission: 'Permission required for filming on private property',
      reason: 'Location appears to be within or very close to a residential area or private property.',
      nextStep: 'Seek permission from the property owner or resident. For filming from the street, also check council requirements if using kit, crew, lighting, vehicles, or causing disruption.',
      secondary: [
        council ? `${council} — street filming, parking, or public-realm impact` : 'Local authority — street filming, parking, or public-realm impact'
      ],
      alsoCheck: [],
      signals: ['Residential land context detected.']
    });
  }

  /* ── RURAL / WOODLAND / NATURAL / FARMLAND ─────────── */
  if (
    landType === 'rural' ||
    hasCloseTag('natural', 'wood') ||
    hasCloseTag('landuse', 'forest') ||
    hasCloseTag('landuse', 'farmland') ||
    hasCloseTag('landuse', 'meadow') ||
    hasCloseTag('natural', 'heath') ||
    hasCloseTag('natural', 'moor') ||
    addressMentions('wood') ||
    addressMentions('forest') ||
    addressMentions('farmland') ||
    addressMentions('farm') ||
    addressMentions('moor') ||
    addressMentions('heath')
  ) {
    return result({
      name: 'Landowner / estate / managing authority',
      route: 'Landowner permission route',
      type: 'Rural / woodland / natural land',
      confidence: 'Low–Medium',
      enforcement: 'medium',
      access: 'Mixed / unclear',
      permission: 'Landowner permission likely required',
      reason: 'The selected location appears to be rural, woodland, estate, farmland, heath, moor, or natural land.',
      nextStep: 'Identify the landowner or estate manager. Start with the local council for guidance, then use Land Registry, site signage, Forestry England, National Trust, or other managing bodies where relevant.',
      secondary: [
        'Land Registry / estate office / farm manager — if exact ownership matters',
        'National Trust / Forestry England / conservation body — if signage or map data suggests managed land'
      ],
      alsoCheck: [
        council ? `${council} — local filming route, public rights of way, parking, or access impact` : ''
      ],
      signals: ['Rural/natural land signal detected.']
    });
  }

  /* ── INDUSTRIAL / COMMERCIAL / RETAIL ──────────────── */
  if (
    landType === 'industrial' ||
    landType === 'commercial' ||
    landType === 'retail' ||
    hasCloseTag('landuse', 'industrial') ||
    hasCloseTag('landuse', 'commercial') ||
    hasCloseTag('landuse', 'retail') ||
    hasAnyTag('landuse', 'industrial') ||
    addressMentions('industrial estate') ||
    addressMentions('business park') ||
    addressMentions('trading estate') ||
    addressMentions('shopping park') ||
    addressMentions('retail park')
  ) {
    return result({
      name: usefulPlaceName || 'Industrial / commercial site operator',
      route: 'Site owner / estate manager permission',
      type: 'Industrial / commercial land',
      confidence: 'Medium',
      enforcement: 'high',
      access: 'Likely private or controlled',
      permission: 'Permission likely required',
      reason: 'The selected location appears to be industrial, commercial, retail, or estate-managed land.',
      nextStep: 'Identify and contact the site owner or estate manager. If filming on roads or pavements, also check the council or highways authority.',
      secondary: [
        'Estate manager / landlord',
        'Individual business operator — if filming on or inside a specific unit'
      ],
      alsoCheck: [
        council ? `${council} — surrounding roads, pavements, parking, or traffic impact` : ''
      ],
      signals: ['Industrial/commercial land signal detected.']
    });
  }

  /* ── BUILDING / SITE FALLBACK ──────────────────────── */
  if (isLandContext && landType === 'building') {
    return result({
      name: usefulPlaceName ? `${usefulPlaceName} — building occupier / site management` : 'Building occupier / site management',
      route: usefulPlaceName ? `Building occupier / site management for ${usefulPlaceName}` : 'Building occupier / site management',
      type: 'Building / managed site',
      confidence: usefulPlaceName ? 'Medium' : 'Low–Medium',
      enforcement: 'high',
      access: 'Private / controlled',
      permission: 'Permission likely required',
      reason: usefulPlaceName
        ? `${usefulPlaceName} appears to be a specific building or site. Filming on or inside a building normally requires permission from the occupier, owner, facilities team, or site management.`
        : 'This appears to be a specific building or site. Filming on or inside a building normally requires permission from the occupier, owner, facilities team, or site management.',
      nextStep: usefulPlaceName
        ? `Contact the building occupier, facilities team, or site management for ${usefulPlaceName}. If filming outside, also check council/highways and any wider estate management.`
        : 'Contact the building occupier, facilities team, or site management. If filming outside, also check council/highways and any wider estate management.',
      secondary: [
        council ? `${council} — surrounding streets, pavement, parking, or public-realm impact` : ''
      ],
      alsoCheck: [],
      signals: [usefulPlaceName ? `Building land context detected: ${usefulPlaceName}` : 'Building land context detected.']
    });
  }

  /* ── ACCESS RESTRICTION ────────────────────────────── */
  if (hasCloseAccessRestriction) {
    return result({
      name: 'Private landowner / site operator',
      route: 'Landowner or site manager permission',
      type: 'Private / controlled access land',
      confidence: 'Medium',
      enforcement: 'high',
      access: 'Restricted or unclear',
      permission: 'Permission likely required',
      reason: 'Nearby map data suggests access restrictions such as private, no access, or restricted access.',
      nextStep: 'Identify the landowner or site operator before filming.',
      secondary: [
        council ? `${council} — if filming affects surrounding roads, parking, or public realm` : ''
      ],
      alsoCheck: [],
      signals: ['Access restriction detected near pin.']
    });
  }

  /* ── FINAL FALLBACK ────────────────────────────────── */
  return result({
    name: council || 'Unknown landowner / local authority starting point',
    route: 'Local authority / landowner verification route',
    type: 'Unknown / public realm / mixed land',
    confidence: council ? 'Low–Medium' : 'Low',
    enforcement: 'medium',
    access: 'Unknown / verify on site',
    permission: 'Verify before commercial filming',
    reason: 'No strong under-pin ownership signal was detected from the available public map data.',
    nextStep: 'Start with the local authority, then verify land ownership if the shoot is commercial, disruptive, uses kit/crew, or sits on non-obvious private land.',
    secondary: [
      'Land Registry / site signage / nearby landowner — if exact ownership matters'
    ],
    alsoCheck: [
      council ? `${council} — public realm, highways, parking, road impact, or local filming permit route` : ''
    ],
    signals: []
  });
}

/* ── COORDINATE / PLACE DETECTION HELPERS ──────────────*/
function pointLooksLikeCanaryWharf(lat, lon) {
  lat = Number(lat);
  lon = Number(lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  return (
    lat >= 51.495 &&
    lat <= 51.510 &&
    lon >= -0.025 &&
    lon <= -0.005
  );
}

function pointLooksLikeRoyalPark(lat, lon) {
  lat = Number(lat);
  lon = Number(lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  const boxes = [
    { minLat: 51.4995, maxLat: 51.5155, minLon: -0.1815, maxLon: -0.1435 }, // Hyde Park / Kensington Gardens
    { minLat: 51.5000, maxLat: 51.5095, minLon: -0.1480, maxLon: -0.1300 }, // Green Park / St James's Park
    { minLat: 51.5180, maxLat: 51.5355, minLon: -0.1705, maxLon: -0.1400 }, // Regent's Park
    { minLat: 51.4210, maxLat: 51.4610, minLon: -0.3040, maxLon: -0.2470 }, // Richmond Park
    { minLat: 51.4030, maxLat: 51.4265, minLon: -0.3820, maxLon: -0.3310 }  // Bushy Park
  ];

  return boxes.some(b =>
    lat >= b.minLat &&
    lat <= b.maxLat &&
    lon >= b.minLon &&
    lon <= b.maxLon
  );
}

function looksLikeRoyalPark(addressText = '', lat = null, lon = null) {
  const text = String(addressText || '').toLowerCase();

  // Do not trigger Royal Parks from coordinates alone.
  // Nearby roads around Hyde Park / Regent's Park can fall inside the broad coordinate boxes.

  if (text.includes('green park business park')) return false;
  if (text.includes('green park') && !text.includes('london') && !text.includes('westminster')) return false;

  return (
    text.includes('hyde park') ||
    text.includes('kensington gardens') ||
    text.includes('green park, london') ||
    text.includes('green park london') ||
    text.includes('st james') ||
    text.includes('regent') ||
    text.includes('richmond park') ||
    text.includes('bushy park')
  );
}

/* ── RESULT / TEXT HELPERS ──────────────────────────────*/
function permissionResult(obj) {
  return {
    name: obj.name || 'Unknown',
    route: obj.route || 'Verify with relevant authority',
    type: obj.type || 'Unclear',
    confidence: obj.confidence || 'Low',
    enforcement: obj.enforcement || 'medium',
    access: obj.access || 'Unknown',
    permission: obj.permission || 'Verify before shoot',
    reason: obj.reason || 'No clear reason available.',
    nextStep: obj.nextStep || 'Verify before filming.',
    council: obj.council || '',
    secondary: cleanList(obj.secondary || []),
    alsoCheck: cleanList(obj.alsoCheck || []),
    signals: cleanList(obj.signals || [])
  };
}

function cleanList(items = []) {
  const seen = new Set();

  return items
    .filter(Boolean)
    .map(item => String(item).trim())
    .filter(Boolean)
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isGenericPlaceName(name = '') {
  const n = String(name || '').trim().toLowerCase();

  if (!n) return true;
  if (/^\d+$/.test(n)) return true;

  if (
    n.includes('line - westbound') ||
    n.includes('line - eastbound') ||
    n.includes('line - northbound') ||
    n.includes('line - southbound') ||
    n.includes('main line') ||
    n.includes('metropolitan lines') ||
    n.includes('hammersmith & city') ||
    n.includes('circle line') ||
    n.includes('central line') ||
    n.includes('district line') ||
    n.includes('jubilee line') ||
    n.includes('northern line') ||
    n.includes('piccadilly line') ||
    n.includes('victoria line') ||
    n.includes('bakerloo line') ||
    n.includes('waterloo & city line') ||
    n.includes('elizabeth line')
  ) return true;

  return [
    'building / site',
    'public highway / road',
    'road',
    'unnamed road',
    'location',
    'rural / natural land',
    'water / coastal site',
    'residential area',
    'railway land / infrastructure',
    'industrial / commercial site operator',
    'this location'
  ].includes(n);
}

function getUsefulPlaceName(placeInfo, address) {
  const rawName = String(placeInfo?.name || '').trim();

  if (rawName && !isGenericPlaceName(rawName)) {
    return rawName;
  }

  const fallback = address?.display_name?.split(',')?.slice(0, 2)?.join(', ') || '';
  return fallback || '';
}

function getLocalContextName(address) {
  const a = address?.address || {};

  return (
    a.city ||
    a.town ||
    a.village ||
    a.hamlet ||
    a.suburb ||
    a.neighbourhood ||
    a.municipality ||
    a.county ||
    address?.display_name?.split(',')?.slice(0, 2)?.join(', ') ||
    ''
  );
}

function buildGoogleSearchQuery(primary, address, controller = null) {
  const council = controller?.council || getLikelyCouncilName(address);
  const local = getLocalContextName(address);

  const cleanCouncil = String(council || '')
    .replace(/\bCity of\b/gi, '')
    .replace(/\bBorough of\b/gi, '')
    .replace(/\bLondon Borough of\b/gi, '')
    .replace(/\bDistrict\b/gi, '')
    .replace(/\bCouncil\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanPrimary = String(primary || '')
    .replace(/Central Line.*$/i, '')
    .replace(/Circle, Hammersmith.*$/i, '')
    .replace(/.*Hammersmith & City.*$/i, '')
    .replace(/.*Metropolitan Lines.*$/i, '')
    .replace(/.*Main Line.*$/i, '')
    .replace(/Railway.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = [];

  if (cleanPrimary && !isGenericPlaceName(cleanPrimary)) parts.push(cleanPrimary);
  if (local && !parts.some(p => p.toLowerCase() === local.toLowerCase())) parts.push(local);
  if (cleanCouncil && !parts.some(p => p.toLowerCase() === cleanCouncil.toLowerCase())) parts.push(cleanCouncil);

  if (!parts.length && cleanCouncil) parts.push(cleanCouncil);
  if (!parts.length) parts.push('local council');

  return `${parts.join(' ')} filming permission`;
}

function makeGoogleSearchLink(label, query) {
  return {
    label,
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`
  };
}

/* ── COUNCIL / PLACE HELPERS ────────────────────────────*/
function getLikelyCouncilName(address) {
  const a = address?.address || {};

  const candidates = [
    a.municipality,
    a.city,
    a.town,
    a.village,
    a.county,
    a.state_district,
    a.state
  ].filter(Boolean);

  const raw = candidates.find(x => x && x.length > 6) || '';
  if (!raw) return '';

  const cleaned = raw
    .replace(/\bCounty\b/gi, '')
    .replace(/\bAdministrative Area\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  if (/council/i.test(cleaned)) return cleaned;

  const lower = cleaned.toLowerCase();

  const unitary = [
    'bristol',
    'southampton',
    'portsmouth',
    'brighton and hove',
    'plymouth',
    'nottingham',
    'derby',
    'leicester',
    'reading',
    'slough',
    'wokingham',
    'west berkshire',
    'isle of wight',
    'cornwall',
    'dorset',
    'bournemouth',
    'christchurch',
    'poole'
  ];

  if (unitary.some(x => lower.includes(x))) {
    if (lower.includes('brighton')) return 'Brighton & Hove City Council';
    if (lower.includes('bournemouth') || lower.includes('christchurch') || lower.includes('poole')) return 'BCP Council';
    return `${cleaned} City Council`;
  }

  if (lower.includes('highland')) return 'Highland Council';
  if (lower.includes('greater london')) return 'Local London borough / Transport for London';
  if (lower.includes('city of london')) return 'City of London Corporation';

  return `${cleaned} Council`;
}

function inferControllerFromPlaceInfo(placeInfo) {
  if (!placeInfo) return '';

  const name = String(placeInfo.name || '').toLowerCase();

  if (name.includes('gunnersbury park')) return 'Gunnersbury Park Museum & Park Development Trust / London Borough of Hounslow';
  if (name.includes('battersea park')) return 'Wandsworth Council';

  if (placeInfo.operator) return placeInfo.operator;

  const website = String(placeInfo.website || '').toLowerCase();

  if (website.includes('wandsworth.gov.uk')) return 'Wandsworth Council';
  if (website.includes('westminster.gov.uk')) return 'Westminster City Council';
  if (website.includes('royalparks.org.uk')) return 'The Royal Parks';
  if (website.includes('camden.gov.uk')) return 'Camden Council';
  if (website.includes('richmond.gov.uk')) return 'Richmond Council';
  if (website.includes('lambeth.gov.uk')) return 'Lambeth Council';
  if (website.includes('hackney.gov.uk')) return 'Hackney Council';
  if (website.includes('towerhamlets.gov.uk')) return 'Tower Hamlets Council';
  if (website.includes('cityoflondon.gov.uk')) return 'City of London Corporation';
  if (website.includes('tfl.gov.uk')) return 'Transport for London';

  return '';
}

function getBestPlaceName(address) {
  const a = address?.address || {};
  return (
    a.city ||
    a.town ||
    a.village ||
    a.hamlet ||
    a.suburb ||
    a.municipality ||
    a.county ||
    address?.display_name?.split(',')?.slice(0, 2)?.join(', ') ||
    ''
  );
}

function capFirst(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ── LAND CONTROL SUMMARY ───────────────────────────────*/
function buildLandControlSummary(controller, address) {
  const councilName = controller.council || getLikelyCouncilName(address) || 'Unknown local authority';

  const secondaryRows = cleanList(controller.secondary || [])
    .filter(item => item.toLowerCase() !== String(controller.name || '').toLowerCase())
    .map(item => `
      <div class="perm-check">
        <span class="perm-check-arrow">↳</span>
        <span>${item}</span>
      </div>
    `).join('');

  return `
    <div class="land-control-summary">
      <div class="card-label" style="margin-bottom:0.5rem">Permission route & land control</div>

      <div class="perm-decision-card">
        <div class="perm-decision-top">
          <div>
            <div class="perm-decision-kicker">Likely permission route</div>
            <div class="perm-decision-title">${controller.permission}</div>
          </div>
          <div class="perm-confidence-pill">${controller.confidence}</div>
        </div>

        <div class="perm-decision-body">
          <div class="perm-row">
            <span class="perm-row-label">Who to contact</span>
            <span class="perm-row-value">${controller.name || getLocalContextName(address)}</span>
          </div>

          <div class="perm-row">
            <span class="perm-row-label">Land context</span>
            <span class="perm-row-value">${controller.type}</span>
          </div>

          <div class="perm-row">
            <span class="perm-row-label">Authority</span>
            <span class="perm-row-value">${councilName}</span>
          </div>
        </div>

        ${
          secondaryRows
            ? `
        <div class="perm-checks">
          <div class="perm-checks-label">Extra checks</div>
          ${secondaryRows}
        </div>`
            : ''
        }
      </div>

      <div class="perm-actions">
        ${quickLinks([
          makeGoogleSearchLink('Search permission route', buildGoogleSearchQuery(controller.name, address, controller)),
          makeGoogleSearchLink('Search council filming permit', `${councilName} filming permit`)
        ])}
      </div>

      <div class="perm-reason">
        <strong>Why:</strong> ${controller.reason}
      </div>

      <div class="perm-next-step">
        <strong>Next step:</strong> ${controller.nextStep}
      </div>

      ${
        controller.alsoCheck?.length
          ? `
        <div class="perm-next-step secondary">
          <strong>Also check:</strong><br>
          ${controller.alsoCheck.map(x => `• ${x}`).join('<br>')}
        </div>`
          : ''
      }
    </div>`;
}

/* ── SITE OWNERSHIP & RESTRICTIONS ──────────────────────*/
function buildSiteOwnershipRestrictions(perms = [], controller = {}) {
  const text = [
    controller.name,
    controller.route,
    controller.type,
    controller.reason,
    controller.nextStep
  ].filter(Boolean).join(' ').toLowerCase();

  const rows = [];

  const addRow = (name, note, status = 'info', badge = 'Check') => {
    if (rows.some(r => r.name.toLowerCase() === name.toLowerCase())) return;
    rows.push({ name, note, status, badge });
  };

  if (text.includes('royal parks') || text.includes('royal park')) {
    addRow(
      'The Royal Parks',
      'This is a separately managed Royal Park route. Commercial filming should normally go through The Royal Parks.',
      'flag',
      'Primary route'
    );
  }

  const strongControllerText = [
    controller.name,
    controller.route,
    controller.type
  ].filter(Boolean).join(' ').toLowerCase();

  if (strongControllerText.includes('national trust')) {
    addRow(
      'National Trust',
      'National Trust land and properties usually require permission through the site or central filming team.',
      'flag',
      'Managed land'
    );
  }

  if (
    strongControllerText.includes('english heritage') ||
    strongControllerText.includes('historic england')
  ) {
    addRow(
      'English Heritage / Historic England',
      'Heritage-managed sites may have stricter filming, access, conservation, or tripod restrictions.',
      'warn',
      'Heritage site'
    );
  }

  if (text.includes('cadw')) {
    addRow(
      'Cadw',
      'Cadw-managed sites in Wales usually requires filming permission and heritage-sensitive working practices.',
      'warn',
      'Heritage site'
    );
  }

  if (text.includes('historic scotland') || text.includes('historic environment scotland')) {
    addRow(
      'Historic Environment Scotland',
      'Historic Environment Scotland sites usually requires filming permission and heritage-sensitive working practices.',
      'warn',
      'Heritage site'
    );
  }

  if (text.includes('canal & river trust') || text.includes('canal and river trust')) {
    addRow(
      'Canal & River Trust',
      'Managed waterways usually requires permission for filming, access, towpaths, boats, drones, or crew setups.',
      'flag',
      'Waterway authority'
    );
  }



  const controllerType = String(controller.type || '').toLowerCase();

  if (
    controllerType.includes('coastal') ||
    controllerType.includes('water') ||
    controllerType.includes('foreshore') ||
    controllerType.includes('harbour') ||
    controllerType.includes('marina')
  ) {
    if (text.includes('harbour') || text.includes('port authority') || text.includes('marina')) {
      addRow(
        'Harbour / port / marina authority',
        'Harbour, port, and marina areas may have separate access, safety, security, and filming requirements.',
        'warn',
        'Authority check'
      );
    }

    if (text.includes('crown estate')) {
      addRow(
        'Crown Estate',
        'Foreshore, seabed, and some land interests may involve Crown Estate checks where ownership or access is unclear.',
        'warn',
        'Ownership check'
      );
    }
  }

  if (
    controllerType.includes('national park') ||
    text.includes('national park')
  ) {
    addRow(
      'National Park',
      'National Parks are mixed-ownership areas. You may need landowner permission as well as park authority guidance.',
      'flag',
      'Sensitive area'
    );
  }

  if (
    controllerType.includes('protected') ||
    controllerType.includes('sssi') ||
    text.includes('site of special scientific interest')
  ) {
    addRow(
      'Protected area / SSSI',
      'Protected sites may have conservation, wildlife, drone, access, or seasonal restrictions.',
      'warn',
      'Check restrictions'
    );
  }

  const visibleRows = rows.slice(0, 4);

  if (!visibleRows.length) return '';

  const html = visibleRows.map(p => {
    const dotCls = p.status === 'flag' ? 'flag' : p.status === 'warn' ? 'warn' : 'neu';

    return `
      <div class="perm-row">
        <div class="rrow-dot ${dotCls}"></div>
        <div class="perm-content">
          <div class="perm-name">${p.name}</div>
          <div class="perm-note">${p.note}</div>
        </div>
        <span class="perm-badge card-badge b-${dotCls}">${p.badge}</span>
      </div>`;
  }).join('');

  return `
    <div class="perm-flags">
      <div class="card-label" style="margin-bottom:0.5rem">Site ownership & restrictions</div>
      ${html}
    </div>`;
}

/* ── LAND SIGNALS ───────────────────────────────────────*/
function buildLandSignals() {
  return '';
}

/* ── TYPICAL FILMING RESTRICTIONS ───────────────────────*/
function buildTypicalFilmingRestrictions(controller) {
  const type = String(controller?.type || '').toLowerCase();

  let rows = [];

  if (type.includes('rail')) {
    rows = [
      'Permission is usually required.',
      'Security restrictions are typically strict.',
      'Filming without approval may be stopped quickly.'
    ];
  } else if (type.includes('royal park') || type.includes('park') || type.includes('open space')) {
    rows = [
      'Commercial filming usually requires permission.',
      'Handheld filming is often tolerated if not disruptive.',
      'Tripods, lighting, props, or crew setups usually requires approval.',
      'Restrictions are typically stricter in Royal Parks.'
    ];
  } else if (type.includes('public highway') || type.includes('road')) {
    rows = [
      'Handheld filming is often tolerated if not obstructive.',
      'Tripods, lighting, or stands usually requires permission.',
      'Filming that affects traffic, pedestrians, or safety will require council approval.'
    ];
  } else if (type.includes('managed estate') || type.includes('building') || type.includes('commercial') || type.includes('industrial') || type.includes('retail')) {
    rows = [
      'Permission is likely required depending on ownership.',
      'Private land, estate roads, plazas, and forecourts may not be public.',
      'Tripods, lighting, or crew setups usually require approval.',
      'Site management or security may intervene if filming without permission.'
    ];
  } else if (type.includes('coastal') || type.includes('water') || type.includes('foreshore')) {
    rows = [
      'Permission is likely required from the council, harbour authority, navigation authority, Crown Estate, or landowner.',
      'Tripods, lighting, crew setups, drones, or safety impact usually requires approval.',
      'Check tides, access, public safety, and rescue considerations before filming.'
    ];
  } else if (type.includes('education')) {
    rows = [
      'Permission is required.',
      'Safeguarding restrictions are typically strict.',
      'Avoid filming pupils, entrances, staff, or identifiable school activity without approval.'
    ];
  } else if (type.includes('healthcare')) {
    rows = [
      'Permission is required.',
      'Privacy and access restrictions are typically strict.',
      'Filming patients, staff, entrances, or identifiable healthcare activity requires explicit approval.'
    ];
  } else if (type.includes('sensitive') || type.includes('restricted')) {
    rows = [
      'Permission is likely required.',
      'Security restrictions may be strict.',
      'Filming may be stopped quickly without prior approval.'
    ];
  } else if (type.includes('residential')) {
    rows = [
      'Permission is required for filming on private property.',
      'Street filming may still require council approval if using kit, crew, lighting, vehicles, or causing disruption.',
      'Avoid filming identifiable homes, residents, or private activity without consent.'
    ];
  } else if (type.includes('rural') || type.includes('woodland') || type.includes('natural')) {
    rows = [
      'Landowner permission is usually needed unless access rights clearly allow the activity.',
      'Tripods, lighting, drones, vehicles, or crew setups increase the likelihood of needing approval.',
      'Protected habitats, livestock, public rights of way, and parking access may add restrictions.'
    ];
  } else {
    rows = [
      'Handheld filming may be low risk if not disruptive.',
      'Tripods, lighting, crew setups, drones, vehicles, or obstruction usually requires permission.',
      'Verify ownership and access before commercial filming.'
    ];
  }

  const restrictionIcons = ['🎬', '🚧', '🧰', '🛑'];

  return `
    <div class="filming-notes filming-restrictions">
      <div class="card-label" style="margin-bottom:0.5rem">Typical filming restrictions</div>
      <div class="guidance-list">
        ${rows.map((row, i) => `
          <div class="guidance-item">
            <span class="guidance-icon">${restrictionIcons[i] || '⚠️'}</span>
            <div class="guidance-text">${row}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

/* ── FILMING NOTES ──────────────────────────────────────*/
function buildFilmingNotes(perms, features, address, controller) {
  const notes = [];

  const isNP = perms.find(p => p.name === 'National Park' && p.status === 'flag');
  const isPA = perms.find(p => p.name === 'Protected area / SSSI' && p.status === 'warn');
  const isPark = controller.type.includes('Park') || controller.type.includes('open space') || perms.find(p => p.name === 'Public park');
  const isWater = controller.type.includes('Coastal') || controller.type.includes('water') || perms.find(p => p.name === 'Coastal / water location');
  const isInd = controller.type.includes('Industrial') || perms.find(p => p.name === 'Industrial / private land' && p.status === 'warn');

  if (controller.type.includes('Rail')) notes.push({
    icon: '🚆',
    title: 'Rail / transport infrastructure',
    detail: 'Railway and station land is usually tightly controlled. Permission should be verified with the station operator, rail operator, or railway estate owner.'
  });

  if (controller.type.includes('Education')) notes.push({
    icon: '🏫',
    title: 'Safeguarding-sensitive location',
    detail: 'Schools and education sites require explicit permission. Avoid filming entrances, pupils, staff, or identifiable school activity without approval.'
  });

  if (controller.type.includes('Healthcare')) notes.push({
    icon: '🏥',
    title: 'Healthcare-sensitive location',
    detail: 'Hospitals and healthcare sites often have privacy, access, and communications restrictions. Permission should come from the relevant trust or site team.'
  });

  if (controller.type.includes('Sensitive')) notes.push({
    icon: '🪖',
    title: 'Sensitive / restricted land',
    detail: 'Military, police, prison, aviation, and utility locations can carry serious access and filming restrictions. Treat as permission-required.'
  });

  if (controller.type.includes('Public highway')) notes.push({
    icon: '🛣',
    title: 'Public realm / highway',
    detail: 'Small handheld filming may be low-risk, but tripods, lighting, crew, traffic impact, drones, or commercial filming usually requires council/highways permission.'
  });

  if (isNP) notes.push({
    icon: '🏔',
    title: 'National Park',
    detail: 'National Parks are mixed-ownership areas. The park authority may advise on filming, but you may still need separate landowner permission.'
  });

  if (isPA) notes.push({
    icon: '🌿',
    title: 'Protected area / SSSI',
    detail: 'Check with Natural England, NatureScot, or Natural Resources Wales before shooting. Some areas have seasonal wildlife or habitat restrictions.'
  });

  if (isPark) notes.push({
    icon: '🌳',
    title: 'Public park or managed green space',
    detail: 'Commercial filming in parks usually needs council or site-manager permission, especially with tripod, lighting, crew, drone, or public disruption.'
  });

  if (isWater) notes.push({
    icon: '🌊',
    title: 'Coastal / water location',
    detail: 'Check tide times, foreshore ownership, harbour restrictions, waterway authorities, and safety considerations before planning coastal or waterside filming.'
  });

  if (isInd) notes.push({
    icon: '🏭',
    title: 'Industrial / private land',
    detail: 'Written permission is usually required. Industrial and commercial sites often require RAMS, PPE, site induction, and public liability insurance.'
  });

  if (!notes.length) notes.push({
    icon: '📍',
    title: 'No major location-specific permission flags detected',
    detail: 'This does not mean permission is unnecessary. Ownership and access should still be verified before commercial filming.'
  });

  const controllerType = String(controller?.type || '').toLowerCase();

const filteredNotes = notes.filter(n => {
  const title = String(n.title || '').toLowerCase();

  // Industrial / commercial
  if (title.includes('industrial') || title.includes('private land')) {
    return controllerType.includes('industrial') || controllerType.includes('commercial') || controllerType.includes('mixed');
  }

  // Park
  if (title.includes('park')) {
    return controllerType.includes('park');
  }

  // Coastal / water
  if (title.includes('coastal') || title.includes('water')) {
    return controllerType.includes('coastal') || controllerType.includes('water');
  }

  // National park
  if (title.includes('national park')) {
    return controllerType.includes('national park');
  }

  // Protected / SSSI
  if (title.includes('sssi') || title.includes('protected')) {
    return controllerType.includes('protected') || controllerType.includes('sssi');
  }

  // Default: keep
  return true;
});

if (!filteredNotes.length) return '';

const rows = filteredNotes.map(n => `
    <div class="guidance-item">
      <span class="guidance-icon">${n.icon}</span>
      <div>
        <div class="fn-title">${n.title}</div>
        <div class="guidance-text">${n.detail}</div>
      </div>
    </div>`).join('');

  return `
    <div class="filming-notes">
      <div class="card-label" style="margin-bottom:0.5rem">Permission notes</div>
      <div class="guidance-list">
        ${rows}
      </div>
    </div>`;
}

/* ── PLACE / SITE CONTACT ───────────────────────────────*/
function buildPlaceContact(placeInfo, address, controller) {
  if (!placeInfo || (!placeInfo.name && !placeInfo.website && !placeInfo.phone)) return '';

  const hasUsefulName = placeInfo.name && !isGenericPlaceName(placeInfo.name);
  const hasUsefulWebsite = Boolean(placeInfo.website);
  const hasUsefulPhone = Boolean(placeInfo.phone);

  if (!hasUsefulName && !hasUsefulWebsite && !hasUsefulPhone) return '';

  const links = [];

  if (placeInfo.website) {
    links.push({ label: 'Place website', url: placeInfo.website });
  }

  const searchName = hasUsefulName ? placeInfo.name : (controller?.name || getLocalContextName(address));
  const searchQuery = buildGoogleSearchQuery(searchName, address, controller);

  links.push(makeGoogleSearchLink('Search this place', searchQuery));

  return `
    <div class="land-ownership place-contact">
      <div class="card-label">Place / site contact</div>
      ${hasUsefulName ? `<div class="place-contact-name">📍 ${placeInfo.name}</div>` : ''}
      ${placeInfo.address ? `<div class="lo-note place-contact-address">${placeInfo.address}</div>` : ''}
      ${placeInfo.phone ? `<div class="lo-note">Phone: <strong>${placeInfo.phone}</strong></div>` : ''}
      <div class="perm-actions">
        ${quickLinks(links)}
      </div>
      <div class="lo-note">This may be the site, venue, or operator contact — not proof of legal land ownership.</div>
    </div>`;
}

/* ── TEMP DEBUG: PLACE INFO ─────────────────────────────*/
function buildPlaceDebug() {
  return '';
}

/* ── PERMISSION & RESEARCH TOOLS ───────────────────────*/
function buildPermissionAndResearchTools(lat, lon, address, controller) {
  const council = controller?.council || getLikelyCouncilName(address);
  const country = (address?.address?.country || '').toLowerCase();

  const isScotland = country.includes('scotland');
  const isWales = country.includes('wales');

  const links = [
    {
      label: isScotland ? 'ScotLIS — ownership records' : 'HM Land Registry — ownership records',
      url: isScotland
        ? 'https://scotlis.ros.gov.uk/'
        : 'https://www.gov.uk/search-property-information-land-registry'
    },
    {
      label: 'Who Owns England — land ownership insights',
      url: 'https://map.whoownsengland.org/'
    },
    {
      label: 'OpenStreetMap — detailed land data',
      url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=16`
    }
  ];

  if (isWales) {
    links.push({ label: 'DataMapWales — land and environment data', url: 'https://datamap.gov.wales/' });
  } else if (!isScotland) {
    links.push({ label: 'MAGIC Map — designations and constraints', url: 'https://magic.defra.gov.uk/MagicMap.aspx' });
  }

  return `
    <div class="land-ownership permission-research-tools">
      <div class="card-label" style="margin-bottom:0.5rem">Research tools</div>
      ${quickLinks(links)}
    </div>`;
}

/* ── VERIFY OWNERSHIP ───────────────────────────────────*/
function buildVerifyOwnership(lat, lon, address, controller) {
  const country = address?.address?.country || 'England';
  const isScotland = country.toLowerCase().includes('scotland');
  const isWales = country.toLowerCase().includes('wales');
  const place = getBestPlaceName(address);
  const council = controller?.council || getLikelyCouncilName(address);

  const links = [
    isScotland
      ? { label: 'ScotLIS ownership search', url: 'https://scotlis.ros.gov.uk/' }
      : { label: 'Land Registry map', url: `https://map.land-registry.service.gov.uk/map/new?center=${lon},${lat}&zoom=15` },

    isWales
      ? { label: 'DataMapWales', url: 'https://datamap.gov.wales/' }
      : isScotland
        ? { label: 'Registers of Scotland', url: 'https://www.ros.gov.uk/' }
        : { label: 'Magic Map designations', url: 'https://magic.defra.gov.uk/MagicMap.aspx' },

    { label: 'Who Owns England map', url: 'https://map.whoownsengland.org/' },
    { label: 'OpenStreetMap', url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=16` }
  ];

  return `
    <div class="land-ownership">
      <div class="card-label" style="margin-bottom:0.5rem">Verify ownership</div>
      <div class="lo-note">
        Suggested permission route: <strong>${controller.route}</strong>. Exact legal ownership is not confirmed by this tool.
      </div>
      ${council ? `<div class="lo-note">Council / local authority area: <strong>${council}</strong></div>` : ''}
      ${place ? `<div class="lo-note">Suggested searches: <strong>${place} filming permit</strong> · <strong>${place} land ownership</strong></div>` : ''}
      ${quickLinks(links)}
    </div>`;
}

/* ── QUICK LINKS ────────────────────────────────────────*/
function buildPermissionsQuickLinks(lat, lon, address, controller) {
  const place = getBestPlaceName(address);
  const council = controller?.council || getLikelyCouncilName(address);
  const country = (address?.address?.country || '').toLowerCase();
  const isScotland = country.includes('scotland');
  const isWales = country.includes('wales');

  const links = [
    
    makeGoogleSearchLink('Search ownership / permissions', `${place || council || 'location'} land ownership filming permission`),
    { label: 'British Film Commission', url: 'https://www.britishfilmcommission.org.uk/locations/' }
  ];

  if (controller.name.toLowerCase().includes('network rail') || controller.type.toLowerCase().includes('rail')) {
    links.unshift({ label: 'Search rail filming permission', url: 'https://www.google.com/search?q=railway+station+Network+Rail+filming+permission+property' });
  }

  if (controller.name.toLowerCase().includes('national trust')) {
    links.unshift({ label: 'National Trust filming', url: 'https://www.google.com/search?q=National+Trust+filming+permission' });
  }

  if (controller.name.toLowerCase().includes('forestry')) {
    links.unshift({ label: 'Forestry filming permission', url: 'https://www.forestryengland.uk/film-and-photography' });
  }

  if (controller.name.toLowerCase().includes('canal') || controller.type.toLowerCase().includes('water')) {
    links.unshift({ label: 'Canal / waterway filming permission', url: 'https://www.google.com/search?q=Canal+River+Trust+filming+permission' });
  }

  if (isScotland) {
    links.push({ label: 'NatureScot', url: 'https://www.nature.scot/' });
  } else if (isWales) {
    links.push({ label: 'Natural Resources Wales', url: 'https://naturalresources.wales/' });
  } else {
    links.push({ label: 'Natural England', url: 'https://www.gov.uk/government/organisations/natural-england' });
  }

  links.push({ label: 'Crown Estate', url: 'https://www.thecrownestate.co.uk/' });

  return `
    <div class="permission-links">
      <div class="card-label" style="margin-bottom:0.5rem">Useful permission links</div>
      ${quickLinks(links)}
    </div>`;
}