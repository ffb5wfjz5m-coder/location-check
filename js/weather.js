/* ════════════════════════════════════════════════════════
   LOCATION CHECK — weather.js
   Reworked weather & wind section
   Production-focused summary + practical prep + technical detail
   ════════════════════════════════════════════════════════ */


/* ── WEATHER UNITS SYSTEM ──────────────────────────────*/
const DEFAULT_WEATHER_UNITS = {
  wind: 'mph',   // mph | kmh | knots
  temp: 'c'      // c | f
};

function getWeatherUnits() {
  try {
    const stored = JSON.parse(localStorage.getItem('wx_units'));

    if (!stored || typeof stored !== 'object') {
      return DEFAULT_WEATHER_UNITS;
    }

    return {
      wind: stored.wind || 'mph',
      temp: stored.temp || 'c'
    };

  } catch {
    return DEFAULT_WEATHER_UNITS;
  }
}

function setWeatherUnits(newUnits) {
  localStorage.setItem('wx_units', JSON.stringify(newUnits));
  applyWeatherUnits();
}

function bindWeatherUnitButtons(scope) {
  scope.querySelectorAll('.wx-unit-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      const type = btn.dataset.wxUnitType;
      const value = btn.dataset.wxUnitValue;

      if (!type || !value) return;

      setWeatherUnits({
        ...getWeatherUnits(),
        [type]: value
      });
    });
  });
}

function applyWeatherUnits() {
  const units = getWeatherUnits();

  document.querySelectorAll('.wx-unit-btn').forEach(btn => {
    const type = btn.dataset.wxUnitType;
    const value = btn.dataset.wxUnitValue;

    btn.classList.toggle('on', units[type] === value);
  });

  document.querySelectorAll('[data-temp-c]').forEach(el => {
    const c = Number(el.dataset.tempC);

    if (units.temp === 'f') {
      el.textContent = Math.round((c * 9 / 5) + 32) + '°F';
    } else {
      el.textContent = Math.round(c) + '°C';
    }
  });

  document.querySelectorAll('[data-wind-kmh]').forEach(el => {
    const kmh = Number(el.dataset.windKmh);

    if (units.wind === 'mph') {
      el.textContent = Math.round(kmh * 0.621371) + ' mph';
    } else if (units.wind === 'knots') {
      el.textContent = Math.round(kmh * 0.539957) + ' kt';
    } else {
      el.textContent = Math.round(kmh) + ' km/h';
    }
  });

  document.querySelectorAll('[data-vis-km]').forEach(el => {
    const km = Number(el.dataset.visKm);

    if (units.wind === 'mph') {
      el.textContent = Math.round(km * 0.621371) + ' mi';
    } else {
      el.textContent = Math.round(km) + ' km';
    }
  });
}

   /* ── MAIN BUILD FUNCTION ────────────────────────────────*/
function buildWeather(data) {
  const { lat, lon, date, weatherData, sunData, airQuality, marineData, features, address } = data;

  const wrapper = document.createElement('div');
  wrapper.appendChild(sectionHead('Weather & Wind'));

  const todayIdx = getTodayIndex(weatherData, date);
  let confidence = 'High';
let confidenceClass = 'fc-high';

if (todayIdx > 1 && todayIdx <= 3) {
  confidence = 'Moderate';
  confidenceClass = 'fc-med';
} else if (todayIdx > 3) {
  confidence = 'Lower';
  confidenceClass = 'fc-low';
}
  const hourlyIdxStart = todayIdx * 24;
  const hourly = extractHourly(weatherData, hourlyIdxStart);

  const sunriseH = sunData ? new Date(sunData.sunrise).getHours() + new Date(sunData.sunrise).getMinutes() / 60 : 6;
  const sunsetH  = sunData ? new Date(sunData.sunset).getHours()  + new Date(sunData.sunset).getMinutes()  / 60 : 20;

  const suit = calculateFilmingSuitability(weatherData, todayIdx, hourly, sunriseH, sunsetH);
  const shootWindows = calculateShootWindows(hourly, sunriseH, sunsetH);
  const droneAssessment = calculateDroneAssessment(weatherData, todayIdx, hourly, sunriseH, sunsetH);

  const card = document.createElement('div');
card.className = 'card';
card.innerHTML = `
  <div class="card-head">
  <span class="card-label">Forecast — ${new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
  <div class="card-head-meta">
  <span class="forecast-confidence ${confidenceClass}">
    Forecast reliability: ${confidence}
  </span>
  <span class="card-badge b-neu">Open-Meteo · ECMWF</span>
</div>
</div>
    <div class="card-body info-stack">

      ${buildWeatherUnitsToggle()}  
      ${buildQuickWeatherOverview(weatherData, todayIdx, hourly, lat, lon)}
      ${buildFilmingSuitability(weatherData, todayIdx, hourly, suit)}
      ${buildBestWorstWindows(hourly, sunriseH, sunsetH, shootWindows)}
      ${buildGoldenHourWeather(hourly, sunriseH, sunsetH, lat, lon, date)}
      ${buildShootPrep(weatherData, todayIdx, hourly, sunriseH, sunsetH)}
      ${buildDrivingConditions(weatherData, todayIdx, hourly)}
      ${buildDroneWindAssessment(weatherData, todayIdx, hourly, droneAssessment)}
      ${buildAllergyAirKitRisk(weatherData, todayIdx, hourly, airQuality, date)}

      <details class="wx-tech-details">
        <summary class="wx-tech-summary">Technical weather details</summary>
<div class="wx-tech-body info-stack">
  ${buildWeatherUnitsToggle()}
          ${buildWind(weatherData, todayIdx, hourly, lat, lon)}
          ${buildVisibilityFog(hourly)}
          ${buildPrecipitation(weatherData, todayIdx, hourly)}
          ${buildPressureHumidityDew(hourly)}
          ${buildUVPollen(weatherData, todayIdx, airQuality, date)}
          ${buildAirQuality(airQuality, date)}
          ${marineData ? buildMarineWeather(marineData, date) : ''}
          ${buildHourlyTable(hourly, sunriseH, sunsetH)}
          ${build7DayForecast(weatherData)}
          <div class="wx-link-out">
  <a href="https://www.windy.com/${lat}/${lon}" target="_blank">
    View detailed wind map ↗
  </a>
</div>
        </div>
      </details>

    </div>
  `;

  wrapper.appendChild(card);

bindWeatherUnitButtons(wrapper);
applyWeatherUnits();

return wrapper;
}


/* ── HELPERS ────────────────────────────────────────────*/
function getTodayIndex(weatherData, date) {
  const times = weatherData.daily.time || [];
  const idx = times.findIndex(t => t === date);
  return idx >= 0 ? idx : 0;
}

function extractHourly(weatherData, startIdx) {
  const h = weatherData.hourly;
  const result = [];
  for (let i = 0; i < 24; i++) {
    const idx = startIdx + i;
    result.push({
      hour:        i,
      time:        h.time?.[idx] || '',
      temp:        h.temperature_2m?.[idx] ?? null,
      feelsLike:   h.apparent_temperature?.[idx] ?? null,
      dewpoint:    h.dewpoint_2m?.[idx] ?? null,
      weatherCode: h.weathercode?.[idx] ?? 0,
      cloud:       h.cloudcover?.[idx] ?? null,
      wind:        h.windspeed_10m?.[idx] ?? null,
      gusts:       h.windgusts_10m?.[idx] ?? null,
      windDir:     h.winddirection_10m?.[idx] ?? null,
      rainProb:    h.precipitation_probability?.[idx] ?? null,
      rain:        h.precipitation?.[idx] ?? null,
      snow:        h.snowfall?.[idx] ?? null,
      visibility:  h.visibility?.[idx] ?? null,
      humidity:    h.relativehumidity_2m?.[idx] ?? null,
      pressure:    h.surface_pressure?.[idx] ?? null,
      uv:          h.uv_index?.[idx] ?? null,
      freezeLevel: h.freezinglevel_height?.[idx] ?? null,
    });
  }
  return result;
}

function formatWeatherTemp(c) {
  if (c === null || c === undefined) return '—';

  const units = getWeatherUnits();
  const display = units.temp === 'f'
    ? Math.round((c * 9 / 5) + 32) + '°F'
    : Math.round(c) + '°C';

  return `<span data-temp-c="${c}">${display}</span>`;
}

function formatWeatherWind(kmh) {
  if (kmh === null || kmh === undefined) return '—';

  const units = getWeatherUnits();

  let display;
  if (units.wind === 'mph') {
    display = Math.round(kmh * 0.621371) + ' mph';
  } else if (units.wind === 'knots') {
    display = Math.round(kmh * 0.539957) + ' kt';
  } else {
    display = Math.round(kmh) + ' km/h';
  }

  return `<span data-wind-kmh="${kmh}">${display}</span>`;
}

function formatWeatherVis(km) {
  if (km === null || km === undefined) return '—';

  const units = getWeatherUnits();
  const display = units.wind === 'mph'
    ? Math.round(km * 0.621371) + ' mi'
    : Math.round(km) + ' km';

  return `<span data-vis-km="${km}">${display}</span>`;
}

function buildWeatherUnitsToggle() {
  const units = getWeatherUnits();

  return `
    <div class="wx-units-toggle">
      <div class="wx-unit-group">
        <span class="wx-unit-label">Wind</span>
        <button type="button" data-wx-unit-type="wind" data-wx-unit-value="mph" class="wx-unit-btn ${units.wind === 'mph' ? 'on' : ''}">mph</button>
        <button type="button" data-wx-unit-type="wind" data-wx-unit-value="kmh" class="wx-unit-btn ${units.wind === 'kmh' ? 'on' : ''}">km/h</button>
        <button type="button" data-wx-unit-type="wind" data-wx-unit-value="knots" class="wx-unit-btn ${units.wind === 'knots' ? 'on' : ''}">kt</button>
      </div>

      <div class="wx-unit-group">
        <span class="wx-unit-label">Temp</span>
        <button type="button" data-wx-unit-type="temp" data-wx-unit-value="c" class="wx-unit-btn ${units.temp === 'c' ? 'on' : ''}">°C</button>
        <button type="button" data-wx-unit-type="temp" data-wx-unit-value="f" class="wx-unit-btn ${units.temp === 'f' ? 'on' : ''}">°F</button>
      </div>
    </div>`;
}

function pollenLevel(value) {
  if (value === null || value === undefined) return { label: '—', cls: '' };
  if (value < 10)  return { label: 'Low',        cls: 'ok' };
  if (value < 50)  return { label: 'Moderate',   cls: 'warn' };
  if (value < 150) return { label: 'High',       cls: 'flag' };
  return                 { label: 'Very high',  cls: 'flag' };
}

function aqiLabel(aqi) {
  if (!aqi) return { label: 'Good', cls: 'ok' };
  if (aqi <= 20)  return { label: 'Good',          cls: 'ok' };
  if (aqi <= 40)  return { label: 'Fair',          cls: 'ok' };
  if (aqi <= 60)  return { label: 'Moderate',      cls: 'warn' };
  if (aqi <= 80)  return { label: 'Poor',          cls: 'flag' };
  if (aqi <= 100) return { label: 'Very poor',     cls: 'flag' };
  return                { label: 'Extremely poor', cls: 'flag' };
}

function uvLabel(uv) {
  if (!uv) return { label: 'Low', cls: 'ok' };
  if (uv <= 2)  return { label: 'Low',       cls: 'ok' };
  if (uv <= 5)  return { label: 'Moderate',  cls: 'warn' };
  if (uv <= 7)  return { label: 'High',      cls: 'warn' };
  if (uv <= 10) return { label: 'Very high', cls: 'flag' };
  return               { label: 'Extreme',   cls: 'flag' };
}

function visLabel(metres) {
  if (metres === null) return { label: '—', cls: '' };
  const km = metres / 1000;
  if (km < 0.2)  return { label: 'Dense fog',  cls: 'flag' };
  if (km < 1)    return { label: 'Fog',        cls: 'flag' };
  if (km < 4)    return { label: 'Poor',       cls: 'warn' };
  if (km < 10)   return { label: 'Moderate',   cls: 'warn' };
  if (km < 20)   return { label: 'Good',       cls: 'ok' };
  return                { label: 'Excellent',  cls: 'ok' };
}

function seaStateLabel(waveH) {
  if (waveH < 0.1)  return 'Calm (glassy)';
  if (waveH < 0.5)  return 'Calm (rippled)';
  if (waveH < 1.25) return 'Slight';
  if (waveH < 2.5)  return 'Moderate';
  if (waveH < 4)    return 'Rough';
  if (waveH < 6)    return 'Very rough';
  return 'High / violent';
}

function hourLabel(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

function windowLabel(startHour, endHourExclusive) {
  return `${hourLabel(startHour)}–${hourLabel(Math.min(endHourExclusive, 24))}`;
}

function decimalHourToClock(decimalHour) {
  const safeHour = Math.max(0, Math.min(23.999, decimalHour));
  const hour = Math.floor(safeHour);
  const minute = Math.round((safeHour - hour) * 60);

  const adjustedHour = minute === 60 ? Math.min(hour + 1, 23) : hour;
  const adjustedMinute = minute === 60 ? 0 : minute;

  return `${String(adjustedHour).padStart(2, '0')}:${String(adjustedMinute).padStart(2, '0')}`;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function average(arr) {
  const vals = arr.filter(v => v !== null && v !== undefined);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function minVal(arr) {
  const vals = arr.filter(v => v !== null && v !== undefined);
  if (!vals.length) return null;
  return Math.min(...vals);
}

function maxVal(arr) {
  const vals = arr.filter(v => v !== null && v !== undefined);
  if (!vals.length) return null;
  return Math.max(...vals);
}

function isGoldenHourish(hour, sunriseH, sunsetH) {
  return (hour >= Math.floor(sunriseH) && hour <= Math.floor(sunriseH) + 1) ||
         (hour >= Math.floor(sunsetH) - 1 && hour <= Math.ceil(sunsetH));
}

function hourProductionScore(h, sunriseH, sunsetH) {
  let score = 10;

  // ── Rain probability (strongest factor)
  if ((h.rainProb || 0) >= 85) score -= 5;
  else if ((h.rainProb || 0) >= 70) score -= 4;
  else if ((h.rainProb || 0) >= 50) score -= 3;
  else if ((h.rainProb || 0) >= 30) score -= 1.5;

  // ── Actual rain amount
  if ((h.rain || 0) >= 2.0) score -= 4;
  else if ((h.rain || 0) >= 1.0) score -= 3;
  else if ((h.rain || 0) >= 0.3) score -= 2;
  else if ((h.rain || 0) > 0.0) score -= 1;

  // ── Thunder / storm
  if ((h.weatherCode || 0) >= 95) score -= 5;

  // ── Gusts
  if ((h.gusts || 0) >= 55) score -= 4;
  else if ((h.gusts || 0) >= 45) score -= 3;
  else if ((h.gusts || 0) >= 35) score -= 2;
  else if ((h.gusts || 0) >= 25) score -= 1;

  // ── Visibility
  if ((h.visibility || 99999) < 2000) score -= 3;
  else if ((h.visibility || 99999) < 5000) score -= 2;
  else if ((h.visibility || 99999) < 10000) score -= 1;

  // ── Midday harsh-light penalty
  const hour = h.hour;
  const daylightMid = (sunriseH + sunsetH) / 2;
  const distFromMid = Math.abs(hour - daylightMid);

  if (distFromMid < 1.5) score -= 1.5;
  else if (distFromMid < 3) score -= 0.75;

  // ── Golden hour bonus (only if actually usable)
  const usableGolden =
    (h.rainProb || 0) < 35 &&
    (h.gusts || 0) < 30 &&
    (h.visibility || 99999) > 8000;

  if (isGoldenHourish(h.hour, sunriseH, sunsetH) && usableGolden) {
    score += 1.5;
  }

  return clamp(score, 0, 10);
}

function groupContiguousHours(hours) {
  if (!hours.length) return [];
  const sorted = [...hours].sort((a, b) => a - b);

  const windows = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
      continue;
    }
    windows.push({ start, end: prev + 1 });
    start = curr;
    prev = curr;
  }

  windows.push({ start, end: prev + 1 });
  return windows;
}


/* ── FILMING SUITABILITY SCORING ────────────────────────*/
function calculateFilmingSuitability(weatherData, todayIdx, hourly, sunriseH, sunsetH) {
  const d = weatherData.daily;

  const rainTotal = d.precipitation_sum?.[todayIdx] ?? 0;
  const rainPct   = d.precipitation_probability_max?.[todayIdx] ?? 0;
  const gustsMax  = d.windgusts_10m_max?.[todayIdx] ?? 0;
  const windMax   = d.windspeed_10m_max?.[todayIdx] ?? 0;
  const cloud     = d.cloudcover_mean?.[todayIdx] ?? 0;
  const code      = d.weathercode?.[todayIdx] ?? 0;
  const tMin      = d.temperature_2m_min?.[todayIdx] ?? null;
  const tMax      = d.temperature_2m_max?.[todayIdx] ?? null;

  const daylight = hourly.filter(h => h.hour >= Math.floor(sunriseH) && h.hour <= Math.ceil(sunsetH));
  const minVis   = minVal(daylight.map(h => h.visibility));
  const avgRainProb = average(daylight.map(h => h.rainProb)) ?? rainPct;
  const wetHours = daylight.filter(h => (h.rain || 0) > 0.1 || (h.rainProb || 0) >= 60).length;

  let score = 10;
  const risks = [];
  const lightNotes = [];
  const operational = [];

  // Rain / storms
  if (code >= 95) {
    score -= 4;
    risks.push('Thunderstorm risk');
  }

  if (rainTotal > 15) {
    score -= 4;
    risks.push('Heavy rain forecast');
  } else if (rainTotal > 8) {
    score -= 3;
    risks.push('Persistent rain likely');
  } else if (rainTotal > 3) {
    score -= 2;
    risks.push('Showers expected');
  } else if (rainTotal > 0.5) {
    score -= 1;
    risks.push('Some rain possible');
  }

  if (rainPct > 85) {
    score -= 2;
    risks.push('Very high rain probability');
  } else if (rainPct > 60) {
    score -= 1;
    risks.push('Rain risk elevated');
  }

  if (wetHours >= 6) operational.push('Limited dry windows through the day');

  // Wind
  if (gustsMax > 60) {
    score -= 4;
    risks.push('Severe gusts');
    operational.push('Sound, stands and lightweight kit likely affected');
  } else if (gustsMax > 45) {
    score -= 3;
    risks.push('Strong gusts');
    operational.push('Exterior audio and stands will need extra care');
  } else if (gustsMax > 30) {
    score -= 2;
    risks.push('Moderate gusts');
  } else if (gustsMax > 20) {
    score -= 1;
  }

  // Visibility / fog
  if (minVis !== null) {
    if (minVis < 1000) {
      score -= 3;
      risks.push('Poor visibility / fog');
    } else if (minVis < 4000) {
      score -= 2;
      risks.push('Moderate visibility issues');
    } else if (minVis < 10000) {
      score -= 1;
    }
  }

  // Temperature extremes
  if (tMin !== null && tMin < 1) {
    score -= 1;
    operational.push('Very cold start to the day');
  }
  if (tMax !== null && tMax > 30) {
    score -= 1;
    operational.push('Hot working conditions likely');
  }

  // Light quality notes (not overly punitive)
  if (cloud > 92) lightNotes.push('Very flat light likely for most of the day');
  else if (cloud > 70) lightNotes.push('Mostly overcast — soft but subdued light');
  else if (cloud > 30 && cloud < 70) lightNotes.push('Broken cloud may create changing light');
  else if (cloud <= 20) lightNotes.push('Clear sky — direct sun and high contrast');

  // Hard caps for truly bad days
  let maxScore = 10;
  if (code >= 95) maxScore = Math.min(maxScore, 2);
  if (rainTotal > 15 && rainPct > 80) maxScore = Math.min(maxScore, 3);
  if (gustsMax > 60) maxScore = Math.min(maxScore, 4);
  if (minVis !== null && minVis < 1000) maxScore = Math.min(maxScore, 4);

  score = clamp(score, 0, maxScore);

  let label, cls;
  if (score >= 8) {
    label = 'Excellent';
    cls = 'ok';
  } else if (score >= 6) {
    label = 'Good with caveats';
    cls = 'ok';
  } else if (score >= 4) {
    label = 'Difficult';
    cls = 'warn';
  } else {
    label = 'Poor / high risk';
    cls = 'flag';
  }

  return {
    score,
    label,
    cls,
    risks,
    lightNotes,
    operational
  };
}


/* ── SHOOT WINDOW SCORING ───────────────────────────────*/
function calculateShootWindows(hourly, sunriseH, sunsetH) {
  const usableHours = hourly.filter(
    h => h.hour >= Math.floor(sunriseH) && h.hour <= Math.ceil(sunsetH)
  );

  const scored = usableHours.map(h => ({
    ...h,
    score: hourProductionScore(h, sunriseH, sunsetH)
  }));

  const bestHours = scored.filter(h => h.score >= 7).map(h => h.hour);
  const decentHours = scored.filter(h => h.score >= 6).map(h => h.hour);
  const worstHours = scored.filter(h => h.score <= 3.5).map(h => h.hour);

  let bestWindows = groupContiguousHours(bestHours);
  if (!bestWindows.length) {
    bestWindows = groupContiguousHours(decentHours);
  }

  let worstWindows = groupContiguousHours(worstHours);
  if (!worstWindows.length) {
    const sortedWorst = [...scored]
      .sort((a, b) => a.score - b.score)
      .slice(0, 2)
      .map(h => h.hour);

    worstWindows = groupContiguousHours(sortedWorst);
  }

  const scores = scored.map(h => h.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const scoreSpread = maxScore - minScore;

  const broadlySteady = scoreSpread < 1.5;

  function explainWindow(windowObj, type) {
    if (!windowObj) return '';

    const subset = usableHours.filter(
      h => h.hour >= windowObj.start && h.hour < windowObj.end
    );

    const allDay = usableHours;

    const avgRain = average(subset.map(h => h.rainProb)) ?? 0;
    const avgWind = average(subset.map(h => h.gusts)) ?? 0;
    const avgVis = average(subset.map(h => h.visibility)) ?? 20000;
    const avgHour = average(subset.map(h => h.hour)) ?? 12;

    const dayRain = average(allDay.map(h => h.rainProb)) ?? 0;
    const dayWind = average(allDay.map(h => h.gusts)) ?? 0;
    const dayVis = average(allDay.map(h => h.visibility)) ?? 20000;

    const daylightMid = (sunriseH + sunsetH) / 2;
    const nearMidday = Math.abs(avgHour - daylightMid) < 2;

    if (type === 'best') {
      if (avgRain < dayRain - 15) return 'Lower rain risk than the rest of the day';
      if (avgWind < dayWind - 8) return 'Calmer than the rest of the day';
      if (avgVis > dayVis + 3000) return 'Better visibility than the rest of the day';
      if (!nearMidday) return 'Softer / more workable light than midday';
      return 'Most workable part of the day overall';
    }

    if (type === 'worst') {
      if (avgRain > dayRain + 15) return 'Showers more likely in this window';
      if (avgWind > dayWind + 8) return 'Windier than the rest of the day';
      if (avgVis < dayVis - 3000) return 'Reduced visibility in this window';
      if (nearMidday) return 'Harsher overhead light around midday';
      return 'Least workable part of the day overall';
    }

    return '';
  }

  return { scored, bestWindows, worstWindows, explainWindow, broadlySteady };
}

/* ── QUICK WEATHER OVERVIEW ─────────────────────────────*/
function buildQuickWeatherOverview(weatherData, todayIdx, hourly, lat, lon) {
  const d = weatherData.daily;
  const code = d.weathercode?.[todayIdx] ?? 0;
  const wx = weatherCodeInfo(code);

  const cloud = d.cloudcover_mean?.[todayIdx] ?? null;
  const wind = d.windspeed_10m_max?.[todayIdx] ?? null;
  const gusts = d.windgusts_10m_max?.[todayIdx] ?? null;
  const rainPct = d.precipitation_probability_max?.[todayIdx] ?? null;
  const rain = d.precipitation_sum?.[todayIdx] ?? null;
  const tMax = d.temperature_2m_max?.[todayIdx] ?? null;
  const tMin = d.temperature_2m_min?.[todayIdx] ?? null;
  const minVis = minVal(hourly.map(h => h.visibility));
  const vis = visLabel(minVis);
  const windyRainUrl = `https://www.windy.com/${lat}/${lon}?lat=${lat}&lon=${lon}&overlay=rain`;

  const visibilityRow = minVis !== null && vis.cls !== 'ok'
    ? mrow('Visibility', vis.label)
    : '';

    let mainRisk = 'No major weather risk';

if ((d.weathercode?.[todayIdx] ?? 0) >= 95) {
  mainRisk = 'Thunderstorm risk';
} else if ((rain ?? 0) > 8) {
  mainRisk = 'Persistent rain limiting dry shooting windows';
} else if ((gusts ?? 0) > 40) {
  mainRisk = 'Gusty wind affecting stability';
} else if ((minVal(hourly.map(h => h.visibility)) ?? 99999) < 4000) {
  mainRisk = 'Poor visibility affecting usable shots';
} else if ((cloud ?? 0) > 90) {
  mainRisk = 'Very flat light for most of the day';
}

  return `
    <div class="wx-summary">
      <div class="wx-icon-big">${wx.icon}</div>
      <div class="wx-summary-main">
  <div class="wx-desc">${wx.desc}</div>
  <div class="wx-temps">${tMax !== null ? formatWeatherTemp(tMax) : '—'} / ${tMin !== null ? formatWeatherTemp(tMin) : '—'}</div>
  <div class="wx-main-risk">Main risk: ${mainRisk}</div>
</div>
      <div class="wx-summary-stats">
        ${mrow('Condition', wx.desc)}
        ${cloud !== null ? mrow('Cloud cover', cloud + '%') : ''}
        ${wind !== null ? mrow('Wind speed', formatWeatherWind(wind)) : ''}
        ${gusts !== null ? mrow('Peak gusts', formatWeatherWind(gusts)) : ''}
        ${rainPct !== null ? mrow('Rain chance', rainPct + '%') : ''}
        ${rain !== null ? mrow('Total rain', formatRain(rain)) : ''}
        ${visibilityRow}
        ${mrow('Rain radar', `<a href="${windyRainUrl}" target="_blank" class="windy-link">View in Windy ↗</a>`)}
      </div>
    </div>`;
}


/* ── FILMING SUITABILITY ────────────────────────────────*/
function buildFilmingSuitability(weatherData, todayIdx, hourly, suit) {
  const risks = suit.risks.length
    ? suit.risks.map(n => `<div class="info-list-item"><span class="info-list-icon">⚠️</span><div class="info-list-main"><div class="info-list-detail">${n}</div></div></div>`).join('')
    : '<div class="info-list-item"><span class="info-list-icon">✓</span><div class="info-list-main"><div class="info-list-detail">No major weather risk flags</div></div></div>';

  const lightNotes = suit.lightNotes.length
    ? suit.lightNotes.map(n => `<div class="info-list-item"><span class="info-list-icon">☀️</span><div class="info-list-main"><div class="info-list-detail">${n}</div></div></div>`).join('')
    : '';

  const operational = suit.operational.length
    ? suit.operational.map(n => `<div class="info-list-item"><span class="info-list-icon">🛠️</span><div class="info-list-main"><div class="info-list-detail">${n}</div></div></div>`).join('')
    : '';

  return `
    <div class="filming-suit section-block">
      <div class="info-subhead">
        <span class="info-subhead-title">Filming suitability</span>
        <span class="card-badge b-${suit.cls}">${suit.label}</span>
      </div>

      <div class="filming-score-bar">
        <div class="filming-score-fill" style="width:${suit.score * 10}%;background:${suit.score >= 8 ? 'var(--ok)' : suit.score >= 4 ? 'var(--warn)' : 'var(--flag)'}"></div>
      </div>

      <div class="info-list">
        ${risks}
        ${lightNotes}
        ${operational}
      </div>
    </div>`;
}


function buildBestWorstWindows(hourly, sunriseH, sunsetH, windowData) {
  const best = windowData.bestWindows;
  const worst = windowData.worstWindows;

  const bestText = windowData.broadlySteady
    ? 'Broadly steady all day'
    : (best.length
        ? best.slice(0, 3).map(w => windowLabel(w.start, w.end)).join(', ')
        : 'No strong window');

  const worstText = windowData.broadlySteady
    ? 'No clear red-flag window'
    : (worst.length
        ? worst.slice(0, 3).map(w => windowLabel(w.start, w.end)).join(', ')
        : 'No major red-flag window');

  return `
    <div class="best-worst section-block split-panel">
      <div class="bw-col bw-best split-col">
        <div class="bw-label">Best shooting windows</div>
        <div class="bw-time">${bestText}</div>
        <div class="bw-detail">
          ${windowData.broadlySteady
            ? 'Conditions are fairly consistent through the day.'
            : (best.length ? windowData.explainWindow(best[0], 'best') : '')}
        </div>
      </div>

      <div class="bw-divider split-divider"></div>

      <div class="bw-col bw-worst split-col">
        <div class="bw-label">Worst shooting windows</div>
        <div class="bw-time">${worstText}</div>
        <div class="bw-detail">
          ${windowData.broadlySteady
            ? 'No obvious worst period stands out.'
            : (worst.length ? windowData.explainWindow(worst[0], 'worst') : '')}
        </div>
      </div>
    </div>`;
}


/* ── GOLDEN HOUR WEATHER ────────────────────────────────*/
function buildGoldenHourWeather(hourly, sunriseH, sunsetH, lat, lon, date) {
  const srHour = Math.floor(sunriseH);
  const ssHour = Math.floor(sunsetH);

  const srData = hourly[Math.min(srHour, 23)];
  const ssData = hourly[Math.min(ssHour, 23)];
  if (!srData && !ssData) return '';

  const sunTimes = SunCalc.getTimes(new Date(`${date}T12:00:00`), lat, lon);

  const morningStart = sunTimes.sunrise;
  const morningEnd = sunTimes.goldenHourEnd;
  const eveningStart = sunTimes.goldenHour;
  const eveningEnd = sunTimes.sunset;

  function cloudQuality(cloud) {
    if (cloud < 20) return { q: 'Clear sky — strong, direct low sun', icon: '☀', worth: 'Potentially striking but high contrast' };
    if (cloud < 50) return { q: 'Broken cloud — best chance of dramatic light', icon: '🌤', worth: 'Well worth staying for if timing works' };
    if (cloud < 80) return { q: 'Mostly cloudy — softer, subdued glow', icon: '🌥', worth: 'Could still be worthwhile' };
    return { q: 'Heavy overcast — flat light likely', icon: '☁', worth: 'Probably not worth waiting purely for golden hour' };
  }

  const srQ = cloudQuality(srData?.cloud ?? 50);
  const ssQ = cloudQuality(ssData?.cloud ?? 50);

  function formatClockTime(d) {
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return `
    <div class="golden-weather section-block">
      <div class="gw-label">Golden hour conditions</div>

      <div class="gw-cols split-panel">
        <div class="gw-col split-col">
          <span class="gw-time">Morning golden hour ${formatClockTime(morningStart)}–${formatClockTime(morningEnd)}</span>
          <span class="gw-icon">${srQ.icon}</span>
          <span class="gw-q">${srQ.q}</span>
          <span class="gw-detail">${srQ.worth}</span>
        </div>

        <div class="gw-divider split-divider"></div>

        <div class="gw-col split-col">
          <span class="gw-time">Evening golden hour ${formatClockTime(eveningStart)}–${formatClockTime(eveningEnd)}</span>
          <span class="gw-icon">${ssQ.icon}</span>
          <span class="gw-q">${ssQ.q}</span>
          <span class="gw-detail">${ssQ.worth}</span>
        </div>
      </div>
    </div>`;
}

/* ── SHOOT PREP ─────────────────────────────────────────*/
function buildShootPrep(weatherData, todayIdx, hourly, sunriseH, sunsetH) {
  const d = weatherData.daily;

  const tMin = d.temperature_2m_min?.[todayIdx] ?? 15;
  const tMax = d.temperature_2m_max?.[todayIdx] ?? 15;
  const rain = d.precipitation_sum?.[todayIdx] ?? 0;
  const rainPct = d.precipitation_probability_max?.[todayIdx] ?? 0;
  const gusts = d.windgusts_10m_max?.[todayIdx] ?? 0;
  const uvMax = d.uv_index_max?.[todayIdx] ?? 0;
  const cloud = d.cloudcover_mean?.[todayIdx] ?? 50;

  const snow = hourly.some(h => (h.snow || 0) > 0);

  const clothing = [];
  const ground = [];
  const kit = [];

  if (tMin < 3 && gusts > 25) {
    clothing.push('🧥 Cold start with wind chill — exposed crew will feel it early');
  } else if (tMin < 3) {
    clothing.push('🧥 Very cold start — proper layers needed for early call');
  } else if (tMin < 8 && gusts > 20) {
    clothing.push('🧥 Cool and breezy — layer up for the first part of the day');
  } else if (tMin < 10) {
    clothing.push('🧥 Cool start — layer up for early call');
  } else if (tMax > 26) {
    clothing.push('☀ Warm working day — lighter clothing and hydration sensible');
  }

  if (rain > 5 || rainPct > 75) {
    clothing.push('🌧 Wet day expected — waterproof outer layers worth having close');
  } else if (rain > 1 || rainPct > 45) {
    clothing.push('🌦 Passing rain possible — keep a waterproof layer nearby');
  }

  if (uvMax >= 6 && cloud < 50) {
    clothing.push('🕶 Bright sun likely at times — sunglasses / sun protection useful');
  }

  if (snow) {
    ground.push('❄️ Snow / slush possible — footing may be awkward under load');
  } else if (rain > 8) {
    ground.push('🥾 Surfaces likely wet underfoot — waterproof footwear worth considering');
  } else if (rain > 3) {
    ground.push('🥾 Some dampness underfoot likely — take care with footing');
  } else {
    ground.push('👍 No obvious footing issues from weather conditions');
  }

  if ((rain > 3 || rainPct > 60) && gusts > 30) {
    kit.push('🌧 Wet and breezy — protect kit and secure lightweight stands / modifiers');
  } else if (rain > 5 || rainPct > 75) {
    kit.push('🌧 Rain risk is significant — plan for covers, staging and dry storage');
  } else if (rain > 1 || rainPct > 45) {
    kit.push('🌦 Showers possible — keep rain protection close');
  }

  if (gusts > 45) {
    kit.push('💨 Strong gusts — stands, modifiers and loose kit will need careful management');
  } else if (gusts > 30) {
    kit.push('💨 Gusts will affect lightweight stands / modifiers — secure them properly');
  }

  if (uvMax >= 5 && cloud < 40) {
    kit.push('📺 Bright sun may affect monitor visibility around midday');
  }

  if (!kit.length) {
    kit.push('👍 No major kit / set concerns');
  }

  const trimList = (items, max = 2) => items.slice(0, max);

  const clothingOut = trimList(clothing.length ? clothing : ['👍 No major crew comfort concerns'], 2);
  const groundOut = trimList(ground, 1);
  const kitOut = trimList(kit, 2);

  const renderList = (title, items) => `
    <div class="wtw-group">
      <div class="wtw-label">${title}</div>
      <div class="guidance-list">
        ${items.map(i => {
          const match = i.match(/^(\S+)\s+(.*)$/);
          const icon = match ? match[1] : '';
          const text = match ? match[2] : i;

          return `
            <div class="guidance-item">
              <span class="guidance-icon">${icon}</span>
              <div class="guidance-text">${text}</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  return `
    <div class="what-to-wear">
      ${renderList('Shoot prep — clothing', clothingOut)}
      ${renderList('Ground & footing', groundOut)}
      ${renderList('Kit & set prep', kitOut)}
    </div>`;
}

/* ── DRIVING CONDITIONS ───────────────────────────────*/
function buildDrivingConditions(weatherData, todayIdx, hourly) {
  const d = weatherData.daily;

  const rain = d.precipitation_sum?.[todayIdx] ?? 0;
  const rainPct = d.precipitation_probability_max?.[todayIdx] ?? 0;
  const gusts = d.windgusts_10m_max?.[todayIdx] ?? 0;

  const earlyHours = hourly.filter(h => h.hour >= 4 && h.hour <= 9);
  const earlyMinTemp = minVal(earlyHours.map(h => h.temp)) ?? (d.temperature_2m_min?.[todayIdx] ?? 10);
  const earlyFog = earlyHours.some(h => (h.visibility || 99999) < 4000);
  const earlyRain = earlyHours.some(h => (h.rain || 0) > 0.2 || (h.rainProb || 0) > 60);

  const items = [];

  if (earlyMinTemp <= 1 && rain > 0.5) {
    items.push('🧊 Risk of icy patches early — especially on untreated / rural roads');
  } else if (earlyMinTemp <= 1) {
    items.push('🧊 Cold early start — watch for isolated icy patches');
  }

  if (earlyFog) items.push('🌫 Reduced visibility early morning — slower travel likely on rural routes');

  if (rain > 8 || rainPct > 75) {
    items.push('🌧 Wet roads likely — braking distances increased, allow extra travel time');
  } else if (rain > 2 || earlyRain) {
    items.push('🌦 Damp roads possible — allow a little extra travel time');
  }

  if (gusts > 45) {
    items.push('💨 Strong gusts — take care on motorways and exposed routes');
  } else if (gusts > 30) {
    items.push('💨 Noticeable crosswinds on exposed roads');
  }

  const output = items.length
    ? items.slice(0, 2)
    : ['👍 No major travel concerns from forecast weather'];

  return `
    <div class="driving-conditions">
      <div class="wtw-group">
        <div class="wtw-label">Driving conditions</div>
        <div class="guidance-list">
          ${output.map(i => {
            const match = i.match(/^(\S+)\s+(.*)$/);
            const icon = match ? match[1] : '';
            const text = match ? match[2] : i;

            return `
              <div class="guidance-item">
                <span class="guidance-icon">${icon}</span>
                <div class="guidance-text">${text}</div>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

/* ── DRONE SUITABILITY ──────────────────────────────────*/
function calculateDroneAssessment(weatherData, todayIdx, hourly, sunriseH, sunsetH) {
  const gustsMax = weatherData.daily.windgusts_10m_max?.[todayIdx] ?? 0;
  const usable = hourly.filter(h => h.hour >= Math.max(0, Math.floor(sunriseH) - 1) &&
                                    h.hour <= Math.min(23, Math.ceil(sunsetH) + 1));

  const flyableHours = usable.filter(h =>
    (h.gusts || 999) < 25 &&
    (h.rain || 0) < 0.1 &&
    (h.rainProb || 100) < 40 &&
    (h.visibility || 99999) > 5000
  ).map(h => h.hour);

  const windows = groupContiguousHours(flyableHours);

  let status, cls, note;
  if (gustsMax < 25) {
  status = 'Good to fly';
  cls = 'ok';
  note = 'Wind conditions are generally comfortable for most drone work.';
} else if (gustsMax < 35) {
  status = 'Flyable with care';
  cls = 'warn';
  note = 'Some gusts present — manageable with experience and careful flying.';
} else if (gustsMax < 45) {
  status = 'Challenging conditions';
  cls = 'warn';
  note = 'Stronger gusts likely — stability and shot consistency may be affected.';
} else {
  status = 'Limited / not recommended';
  cls = 'flag';
  note = 'High gusts likely — flying windows will be limited and conditions unstable.';
}
if (windows.length && (cls === 'warn' || cls === 'flag')) {
  note += ' Short flyable windows may still be available.';
}

  let windowText = 'No reliable flying window';
  if (windows.length) {
    const fullDay = windows.length === 1 &&
      windows[0].start <= Math.max(0, Math.floor(sunriseH) - 1) &&
      windows[0].end >= Math.min(24, Math.ceil(sunsetH) + 2);

    if (fullDay) {
      windowText = 'Flyable for most of the working day';
    } else {
      windowText = windows.slice(0, 3).map(w => windowLabel(w.start, w.end)).join(', ');
    }
  }

  return { status, cls, note, windowText };
}

function buildDroneWindAssessment(weatherData, todayIdx, hourly, droneAssessment) {
  return `
    <div class="drone-wind">
      <div class="drone-wind-head">
        <span class="card-label">Drone suitability</span>
        <span class="card-badge b-${droneAssessment.cls}">${droneAssessment.status}</span>
      </div>

      <div class="guidance-list">
        <div class="guidance-item">
          <span class="guidance-icon">🚁</span>
          <div class="guidance-text">${droneAssessment.note}</div>
        </div>

        <div class="guidance-item">
          <span class="guidance-icon">🕒</span>
          <div class="guidance-text">${droneAssessment.windowText}</div>
        </div>
      </div>
    </div>`;
}


/* ── ALLERGY / AIR / KIT RISK ───────────────────────────*/
function buildAllergyAirKitRisk(weatherData, todayIdx, hourly, airQuality, date) {
  const midday = hourly[12] || hourly[0];
  const humidity = midday?.humidity ?? null;
  const dewpoint = midday?.dewpoint ?? null;
  const temp = midday?.temp ?? null;
  const dewDiff = (temp !== null && dewpoint !== null) ? temp - dewpoint : null;

  let grassPollen = null, treePollen = null, weedPollen = null, aqi = null;

  if (airQuality) {
    const times = airQuality.hourly?.time || [];
    const todayIdxAQ = times.findIndex(t => t && t.startsWith(date));

    if (todayIdxAQ >= 0) {
      const noonIdx = todayIdxAQ + 12;
      grassPollen = airQuality.hourly?.grass_pollen?.[noonIdx] ?? null;
      treePollen = (airQuality.hourly?.alder_pollen?.[noonIdx] ?? 0) + (airQuality.hourly?.birch_pollen?.[noonIdx] ?? 0);
      weedPollen = (airQuality.hourly?.mugwort_pollen?.[noonIdx] ?? 0) + (airQuality.hourly?.ragweed_pollen?.[noonIdx] ?? 0);
      aqi = airQuality.hourly?.european_aqi?.[noonIdx] ?? null;
    }
  }

  const pollenMax = Math.max(grassPollen ?? 0, treePollen ?? 0, weedPollen ?? 0);
  const allergy = pollenLevel(pollenMax);
  const aq = aqiLabel(aqi);

  let kitRisk = 'Low';
  let kitCls = 'ok';
  let kitNote = 'No major environmental kit concerns.';
  let lensNote = '';

  if (dewDiff !== null && dewDiff < 2) {
    lensNote = 'Lens fogging very likely — allow gear to acclimatise before use.';
    kitRisk = 'High';
    kitCls = 'flag';
    kitNote = 'Condensation / lens fogging risk is high — acclimatise gear carefully.';
  } else if (dewDiff !== null && dewDiff < 4) {
    lensNote = 'Some condensation risk when moving between temperatures.';
    kitRisk = 'Moderate';
    kitCls = 'warn';
    kitNote = 'Humidity is elevated — keep cloths and dry storage handy.';
  } else if ((humidity ?? 0) > 90) {
    kitRisk = 'Moderate';
    kitCls = 'warn';
    kitNote = 'Humidity is elevated — keep cloths and dry storage handy.';
  }

  let allergyNote = 'No major allergy concern.';
  if (allergy.label === 'Moderate') allergyNote = 'Mild symptoms possible — antihistamines worth considering.';
  if (allergy.label === 'High') allergyNote = 'Hayfever likely — bring antihistamines, tissues, eye drops.';
  if (allergy.label === 'Very high') allergyNote = 'Severe hayfever risk — crew may need to come prepared.';

  return `
    <div class="uv-pollen">
      <div class="uv-pollen-head">
        <span class="card-label">Allergy / air / kit risk</span>
      </div>

      <div class="wx-risk-rows">
        <div class="mrow">
          <span class="mrow-label">Allergy risk</span>
          <span class="card-badge b-${allergy.cls || 'neu'}">${allergy.label}</span>
        </div>

        ${aqi !== null ? `
          <div class="mrow">
            <span class="mrow-label">Air quality</span>
            <span class="card-badge b-${aq.cls}">${aq.label}</span>
          </div>
        ` : ''}

        <div class="mrow">
          <span class="mrow-label">Kit humidity</span>
          <span class="card-badge b-${kitCls}">${kitRisk}</span>
        </div>

        ${dewDiff !== null ? `
          <div class="mrow">
            <span class="mrow-label">Lens fog risk</span>
            <span class="card-badge b-${dewDiff < 2 ? 'flag' : dewDiff < 4 ? 'warn' : 'ok'}">
              ${dewDiff < 2 ? 'High' : dewDiff < 4 ? 'Moderate' : 'Low'}
            </span>
          </div>
        ` : ''}
      </div>

      <div class="risk-summary">
        <div class="risk-summary-title">Quick prep note</div>

        <div class="guidance-list">
          <div class="guidance-item">
            <span class="guidance-icon">🌿</span>
            <div class="guidance-text">${allergyNote}</div>
          </div>

          <div class="guidance-item">
            <span class="guidance-icon">🎥</span>
            <div class="guidance-text">${kitNote}</div>
          </div>

          ${lensNote ? `
            <div class="guidance-item">
              <span class="guidance-icon">🌫</span>
              <div class="guidance-text">${lensNote}</div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>`;
}


/* ── TECHNICAL WEATHER: WIND ────────────────────────────*/
function buildWind(weatherData, todayIdx, hourly, lat, lon) {
  const d = weatherData.daily;
  const maxW = d.windspeed_10m_max?.[todayIdx] ?? 0;
  const maxG = d.windgusts_10m_max?.[todayIdx] ?? 0;
  const dir = d.winddirection_10m_dominant?.[todayIdx] ?? 0;
  const bf = beaufortNum(maxG);
  const bfLbl = beaufortLabel(maxG);

  const dirs = hourly.filter(h => h.windDir !== null).map(h => h.windDir);
  const dirVariance = dirs.length > 1 ? Math.max(...dirs) - Math.min(...dirs) : 0;
  const consistent = dirVariance < 45;

  return `
    <div class="wind-section">
      <div class="wind-head">
        <span class="card-label">Wind</span>

        <div class="wind-head-right">
          <a href="https://www.windy.com/${lat}/${lon}" target="_blank" class="windy-link">View on Windy ↗</a>
          <span class="card-badge b-${bf <= 3 ? 'ok' : bf <= 5 ? 'warn' : 'flag'}">Beaufort ${bf} — ${bfLbl}</span>
        </div>
      </div>

      ${mrow('Max speed', formatWeatherWind(maxW))}
      ${mrow('Peak gusts', formatWeatherWind(maxG))}
      ${mrow('Dominant direction', compassDir(dir) + ' (' + Math.round(dir) + '°)')}
      ${mrow('Direction consistency', consistent ? 'Steady' : 'Variable')}
    </div>`;
}


/* ── TECHNICAL WEATHER: VISIBILITY ──────────────────────*/
function buildVisibilityFog(hourly) {
  const visData = hourly.filter(h => h.visibility !== null);
  if (!visData.length) return '';

  const minVis = Math.min(...visData.map(h => h.visibility));
  const avgVis = visData.reduce((s, h) => s + h.visibility, 0) / visData.length;
  const { label: visLbl, cls: visCls } = visLabel(minVis);

  const morningFog = hourly.slice(5, 10).some(h => h.visibility !== null && h.visibility < 1000);
  const fogNote = morningFog ? 'Morning fog likely — may affect call time and road safety' : '';

  return `
    <div class="visibility-section">
      <div class="vis-head">
        <span class="card-label">Visibility</span>
        <span class="card-badge b-${visCls}">${visLbl}</span>
      </div>

      ${mrow('Minimum visibility', formatWeatherVis(minVis / 1000))}
      ${mrow('Average visibility', formatWeatherVis(avgVis / 1000))}
      ${fogNote ? `<div class="fog-note">⚠ ${fogNote}</div>` : ''}
    </div>`;
}


/* ── TECHNICAL WEATHER: PRECIP ──────────────────────────*/
function buildPrecipitation(weatherData, todayIdx, hourly) {
  const d = weatherData.daily;
  const total = d.precipitation_sum?.[todayIdx] ?? 0;
  const hrs = d.precipitation_hours?.[todayIdx] ?? 0;
  const rainPct = d.precipitation_probability_max?.[todayIdx] ?? 0;
  const hasSnow = hourly.some(h => (h.snow || 0) > 0);
  const code = d.weathercode?.[todayIdx] ?? 0;
  const thunder = code >= 95;

  const precipCls = total > 10 ? 'flag' : total > 2 ? 'warn' : 'ok';
  const precipLbl = total > 10 ? 'Heavy rain' : total > 2 ? 'Rain expected' : total > 0 ? 'Light rain' : 'Dry';

  return `
    <div class="precip-section">
      <div class="precip-head">
        <span class="card-label">Precipitation</span>
        <span class="card-badge b-${precipCls}">${precipLbl}</span>
      </div>

      ${mrow('Total rainfall', formatRain(total))}
      ${mrow('Rain probability', rainPct + '%')}
      ${hrs > 0 ? mrow('Hours of rain', hrs + 'h') : ''}
      ${hasSnow ? mrow('Snow', 'Snow forecast') : ''}
      ${thunder ? `<div class="thunder-warn">⛈ Thunderstorm risk — suspend outdoor ops if lightning is present</div>` : ''}
    </div>`;
}


/* ── TECHNICAL WEATHER: UV & POLLEN ─────────────────────*/
function buildUVPollen(weatherData, todayIdx, airQuality, date) {
  const uvMax = weatherData.daily.uv_index_max?.[todayIdx] ?? null;
  const { label: uvLbl, cls: uvCls } = uvLabel(uvMax);

  let grassPollen = null, treePollen = null, weedPollen = null;

  if (airQuality) {
    const times = airQuality.hourly?.time || [];
    const todayIdxAQ = times.findIndex(t => t && t.startsWith(date));

    if (todayIdxAQ >= 0) {
      const noonIdx = todayIdxAQ + 12;
      grassPollen = airQuality.hourly?.grass_pollen?.[noonIdx] ?? null;
      treePollen = (airQuality.hourly?.alder_pollen?.[noonIdx] ?? 0) + (airQuality.hourly?.birch_pollen?.[noonIdx] ?? 0);
      weedPollen = (airQuality.hourly?.mugwort_pollen?.[noonIdx] ?? 0) + (airQuality.hourly?.ragweed_pollen?.[noonIdx] ?? 0);
    }
  }

  const gp = pollenLevel(grassPollen);
  const tp = pollenLevel(treePollen);
  const wp = pollenLevel(weedPollen);

  return `
    <div class="uv-pollen">
      <div class="uv-pollen-head">
        <span class="card-label">UV & pollen</span>
        <span class="card-badge b-${uvCls}">UV ${uvLbl}</span>
      </div>

      ${uvMax !== null ? mrow('UV index', uvMax.toFixed(1) + ' — ' + uvLbl) : ''}
      ${grassPollen !== null ? mrow('Grass pollen', gp.label) : ''}
      ${treePollen !== null ? mrow('Tree pollen', tp.label) : ''}
      ${weedPollen !== null ? mrow('Weed pollen', wp.label) : ''}
      ${!airQuality ? `<div class="pollen-note">Pollen data unavailable for this location</div>` : ''}
    </div>`;
}


/* ── TECHNICAL WEATHER: AIR QUALITY ─────────────────────*/
function buildAirQuality(airQuality, date) {
  if (!airQuality) return '';

  const times = airQuality.hourly?.time || [];
  const todayIdxAQ = times.findIndex(t => t && t.startsWith(date));
  if (todayIdxAQ < 0) return '';

  const noonIdx = todayIdxAQ + 12;
  const aqi = airQuality.hourly?.european_aqi?.[noonIdx] ?? null;
  const pm25 = airQuality.hourly?.pm2_5?.[noonIdx] ?? null;
  const no2 = airQuality.hourly?.nitrogen_dioxide?.[noonIdx] ?? null;
  const { label: aqLbl, cls: aqCls } = aqiLabel(aqi);

  return `
    <div class="air-quality">
      <div class="aq-head">
        <span class="card-label">Air quality</span>
        <span class="card-badge b-${aqCls}">${aqLbl}</span>
      </div>

      ${aqi !== null ? mrow('European AQI', aqi + ' — ' + aqLbl) : ''}
      ${pm25 !== null ? mrow('PM2.5', pm25.toFixed(1) + ' μg/m³') : ''}
      ${no2 !== null ? mrow('NO₂', no2.toFixed(1) + ' μg/m³') : ''}
    </div>`;
}


/* ── TECHNICAL WEATHER: MARINE ──────────────────────────*/
function buildMarineWeather(marineData, date) {
  if (!marineData) return '';

  const times = marineData.hourly?.time || [];
  const todayIdx = times.findIndex(t => t && t.startsWith(date));
  if (todayIdx < 0) return '';

  const noonIdx = todayIdx + 12;
  const waveH = marineData.hourly?.wave_height?.[noonIdx] ?? null;
  const swellH = marineData.hourly?.swell_wave_height?.[noonIdx] ?? null;
  const waveDir = marineData.hourly?.wave_direction?.[noonIdx] ?? null;
  const wavePer = marineData.hourly?.wave_period?.[noonIdx] ?? null;

  if (waveH === null) return '';

  const seaState = seaStateLabel(waveH);
  const seaCls = waveH < 1.25 ? 'ok' : waveH < 2.5 ? 'warn' : 'flag';

  return `
    <div class="marine-section">
      <div class="marine-head">
        <span class="card-label">Sea conditions</span>
        <span class="card-badge b-${seaCls}">${seaState}</span>
      </div>

      ${waveH !== null ? mrow('Wave height', waveH.toFixed(1) + 'm') : ''}
      ${swellH !== null ? mrow('Swell height', swellH.toFixed(1) + 'm') : ''}
      ${waveDir !== null ? mrow('Wave direction', compassDir(waveDir)) : ''}
      ${wavePer !== null ? mrow('Wave period', wavePer.toFixed(0) + 's') : ''}
    </div>`;
}


/* ── TECHNICAL WEATHER: PRESSURE / HUMIDITY ─────────────*/
function buildPressureHumidityDew(hourly) {
  const pressureData = hourly.filter(h => h.pressure !== null);
  if (!pressureData.length) return '';

  const pressureStart = pressureData[0]?.pressure ?? null;
  const pressureEnd = pressureData[pressureData.length - 1]?.pressure ?? null;
  const trend = pressureStart && pressureEnd
    ? pressureEnd > pressureStart + 2 ? '↑ Rising — improving conditions likely'
    : pressureEnd < pressureStart - 2 ? '↓ Falling — conditions may deteriorate'
    : '→ Steady'
    : '—';

  const midday = hourly[12] || hourly[0];
  const humidity = midday?.humidity ?? null;
  const dewpoint = midday?.dewpoint ?? null;
  const temp = midday?.temp ?? null;

  const dewDiff = (temp !== null && dewpoint !== null) ? temp - dewpoint : null;
  let fogRisk = 'Low';
  if (dewDiff !== null && dewDiff < 2) fogRisk = 'High';
  else if (dewDiff !== null && dewDiff < 4) fogRisk = 'Moderate';

  return `
    <div class="pressure-section">
      <div class="card-label" style="margin-bottom:0.5rem">Pressure, humidity & dew point</div>

      ${pressureStart !== null ? mrow('Pressure', Math.round(pressureStart) + ' hPa') : ''}
      ${mrow('Pressure trend', trend)}
      ${humidity !== null ? mrow('Midday humidity', humidity + '%') : ''}
      ${dewpoint !== null ? mrow('Dew point', formatWeatherTemp(dewpoint)) : ''}
      ${mrow('Lens fog risk', fogRisk)}
    </div>`;
}


/* ── TECHNICAL WEATHER: HOURLY TABLE ────────────────────*/
function buildHourlyTable(hourly, sunriseH, sunsetH) {
  const sunriseTime = decimalHourToClock(sunriseH);
  const sunsetTime = decimalHourToClock(sunsetH);
  const goldenMorningEnd = decimalHourToClock(sunriseH + 1);
  const goldenEveningStart = decimalHourToClock(sunsetH - 1);

  const eventRowsByHour = {};

  function addEventRow(hour, html) {
    const key = Math.max(0, Math.min(23, Math.floor(hour)));
    if (!eventRowsByHour[key]) eventRowsByHour[key] = [];
    eventRowsByHour[key].push(html);
  }

  addEventRow(sunriseH, `
    <tr class="wx-event-row wx-sunrise-row">
      <td class="ht-time">${sunriseTime}</td>
      <td class="ht-wx">🌅</td>
      <td colspan="9">Sunrise</td>
    </tr>
  `);

  addEventRow(sunriseH + 1, `
    <tr class="wx-event-row wx-golden-row">
      <td class="ht-time">${goldenMorningEnd}</td>
      <td class="ht-wx">🌅</td>
      <td colspan="9">Golden hour ends</td>
    </tr>
  `);

  addEventRow(sunsetH - 1, `
    <tr class="wx-event-row wx-golden-row">
      <td class="ht-time">${goldenEveningStart}</td>
      <td class="ht-wx">🌇</td>
      <td colspan="9">Golden hour starts</td>
    </tr>
  `);

  addEventRow(sunsetH, `
    <tr class="wx-event-row wx-sunset-row">
      <td class="ht-time">${sunsetTime}</td>
      <td class="ht-wx">🌇</td>
      <td colspan="9">Sunset</td>
    </tr>
  `);

  const rows = hourly.map(h => {
    const isDaylight = h.hour >= sunriseH && h.hour < sunsetH;
    const hourDecimal = h.hour;

    const isGolden =
      (hourDecimal >= sunriseH && hourDecimal <= sunriseH + 1) ||
      (hourDecimal >= sunsetH - 1 && hourDecimal <= sunsetH);

    const wx = weatherCodeInfo(h.weatherCode, !isDaylight);
    const eventRows = eventRowsByHour[h.hour]?.join('') || '';

    return `<tr class="${isGolden ? 'golden-row' : ''} ${!isDaylight ? 'night-row' : ''}">
      <td class="ht-time">
        ${String(h.hour).padStart(2, '0')}:00
        ${!isDaylight ? '<span class="ht-night-marker">☾</span>' : ''}
      </td>
      <td class="ht-wx">${wx.icon}</td>
      <td class="ht-temp">${h.temp !== null ? formatWeatherTemp(h.temp) : '—'}</td>
      <td class="ht-feels">${h.feelsLike !== null ? formatWeatherTemp(h.feelsLike) : '—'}</td>
      <td class="ht-wind">${h.wind !== null ? formatWeatherWind(h.wind) : '—'}</td>
      <td class="ht-gust">${h.gusts !== null ? formatWeatherWind(h.gusts) : '—'}</td>
      <td class="ht-dir">${h.windDir !== null ? compassDir(h.windDir) : '—'}</td>
      <td class="ht-bf">${h.gusts !== null ? 'B' + beaufortNum(h.gusts) : '—'}</td>
      <td class="ht-rain">${h.rainProb !== null ? h.rainProb + '%' : '—'}</td>
      <td class="ht-vis">${h.visibility !== null ? formatWeatherVis(h.visibility / 1000) : '—'}</td>
      <td class="ht-cloud">${h.cloud !== null ? h.cloud + '%' : '—'}</td>
    </tr>${eventRows}`;
  }).join('');

  return `
    <div class="hourly-table-wrap section-block data-table-wrap">
      <div class="info-subhead">
        <span class="info-subhead-title">24-hour forecast</span>
      </div>

      <div class="hourly-scroll data-table-scroll">
        <table class="hourly-table data-table">
          <thead>
            <tr>
              <th>Time</th><th>Wx</th><th>Temp</th><th>Feels</th>
              <th>Wind</th><th>Gusts</th><th>Dir</th><th>BF</th>
              <th>Rain%</th><th>Vis</th><th>Cloud</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}


/* ── TECHNICAL WEATHER: 7-DAY ───────────────────────────*/
function build7DayForecast(weatherData) {
  const d = weatherData.daily;
  if (!d.time || !d.time.length) return '';

  const days = d.time.map((t, i) => {
    const code = d.weathercode?.[i] ?? 0;
    const wx = weatherCodeInfo(code);
    const tMax = d.temperature_2m_max?.[i] ?? null;
    const tMin = d.temperature_2m_min?.[i] ?? null;
    const gusts = d.windgusts_10m_max?.[i] ?? 0;
    const rain = d.precipitation_sum?.[i] ?? 0;
    const rainPct = d.precipitation_probability_max?.[i] ?? 0;
    const cloud = d.cloudcover_mean?.[i] ?? 0;
    const date = new Date(t);

    const dayName = i === 0 ? 'Today'
      : i === 1 ? 'Tomorrow'
      : date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

    let dotCls = 'ok';
    if (rain > 10 || gusts > 50 || code >= 95) dotCls = 'flag';
    else if (rain > 2 || gusts > 30 || cloud > 85) dotCls = 'warn';

    return `
      <div class="fc-day">
        <div class="fc-name">${dayName}</div>
        <div class="fc-icon">${wx.icon}</div>
        <div class="fc-temps">
          ${tMax !== null ? formatWeatherTemp(tMax) : '—'}
          <span class="fc-tmin"> / ${tMin !== null ? formatWeatherTemp(tMin) : '—'}</span>
        </div>
        <div class="fc-meta">
          <span>${formatWeatherWind(gusts)} gusts</span>
          <span>${rainPct}% · ${formatRain(rain)}</span>
          <span>${cloud}% cloud</span>
        </div>
        <div class="fc-dot dot-${dotCls}"></div>
      </div>`;
  }).join('');

  return `
    <div class="forecast-7day section-block">
      <div class="info-subhead">
        <span class="info-subhead-title">7-day overview</span>
      </div>

      <div class="fc-strip">${days}</div>

      <div class="fc-legend info-note">
        <span class="dot dot-ok"></span> Good
        <span class="dot dot-warn"></span> Moderate
        <span class="dot dot-flag"></span> Challenging
      </div>
    </div>`;
}