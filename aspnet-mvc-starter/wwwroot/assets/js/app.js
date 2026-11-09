/**
 * TERRA.SINAL — interface do observatório.
 * Dados reais (Earth Engine) e previsões do modelo ML.NET servidos pela Web API ASP.NET Core.
 */
(function () {
  'use strict';

  const API = window.TERRA_API;
  const $ = id => document.getElementById(id);

  // ------------------------------------------------------------------ constantes e formatação
  const viewTitles = {
    inicio: ['Apresentação', 'Conhecer o sistema, o território e as três fontes de dados.'],
    dashboard: ['Estado da paisagem', 'Três fontes de observação. Uma leitura integrada do território.'],
    mapa: ['Mapa de stress', 'Classe prevista e anomalias por distrito.'],
    temporal: ['Análise temporal', 'Comparar a resposta da vegetação às mudanças de chuva e radar.'],
    recomendacoes: ['Apoio à decisão', 'Recomendações auditáveis por classe de stress.'],
    modelos: ['Modelo de inteligência artificial', 'Avaliação transparente, previsão e retreino (ML.NET).'],
    dados: ['Dados e importação', 'Validação antes da integração no dataset do modelo.'],
    historico: ['Histórico e auditoria', 'Registos rastreáveis de previsões e decisões humanas.'],
    api: ['API e integração .NET', 'Contratos REST activos em ASP.NET Core.']
  };
  const BR = { Buzi: 'Búzi', Muanza: 'Muanza' };
  const CLASSES = ['normal', 'moderado', 'severo'];
  const CLASS_LABEL = { normal: 'Normal', moderado: 'Moderado', severo: 'Severo' };
  const CLASS_LONG = { normal: 'Vegetação normal', moderado: 'Stress moderado', severo: 'Stress severo' };
  const CLASS_COLOR = { normal: '#69a77a', moderado: '#dca16a', severo: '#c37660' };
  const GREY = '#b9c2bb';
  const MONTHS = ['Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.'];
  const palette = { ndvi: '#588c64', rain: '#c79f5e', soil: '#7197aa', anomaly: '#ca8364', vh: '#9b7bb0' };

  const state = {
    page: 'dashboard', region: 'Buzi', period: null, mapLayer: 'stress',
    observation: null, series: {}, charts: {}, maps: {}, mapLayers: {}, sites: [],
    metrics: null, rules: [], history: []
  };

  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const fmt = (v, d = 2) => isNum(v) ? Number(v).toLocaleString('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const signed = (v, d = 2) => isNum(v) ? (v < 0 ? '−' : '+') + fmt(Math.abs(v), d) : '—';
  const pct = v => isNum(v) ? fmt(v * 100, 0) + '%' : '—';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const monthLabel = p => { if (!p) return '—'; const [y, m] = p.split('-'); return `${MONTHS[Number(m) - 1] || m} ${y}`; };
  const shortLabel = p => { const [y, m] = p.split('-'); return `${MONTHS[Number(m) - 1].replace('.', '')} ${y.slice(2)}`; };
  const classLabel = c => c ? CLASS_LABEL[c] || c : '—';
  const classColor = c => CLASS_COLOR[c] || GREY;
  const zColor = z => !isNum(z) ? GREY : z < -1 ? CLASS_COLOR.severo : z < -0.5 ? CLASS_COLOR.moderado : CLASS_COLOR.normal;

  function toast(message, type = 'success') {
    const wrap = $('toastArea'); if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast show align-items-center text-bg-' + (type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : 'success') + ' border-0';
    el.setAttribute('role', 'status');
    const content = document.createElement('div'); content.className = 'd-flex';
    const body = document.createElement('div'); body.className = 'toast-body'; body.textContent = message;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn-close btn-close-white me-2 m-auto';
    close.setAttribute('aria-label', 'Fechar'); close.onclick = () => el.remove();
    content.append(body, close); el.append(content); wrap.append(el);
    setTimeout(() => el.remove(), 5500);
  }
  function bind(name, value) { document.querySelectorAll('[data-bind="' + name + '"]').forEach(el => { el.textContent = value; }); }
  function busy(button, on, label) {
    if (!button) return;
    if (on) { button.dataset.label = button.innerHTML; button.disabled = true; button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ' + esc(label || 'A processar…'); }
    else { button.disabled = false; if (button.dataset.label) button.innerHTML = button.dataset.label; }
  }

  // ------------------------------------------------------------------ navegação
  function showPage(page) {
    if (!viewTitles[page]) page = 'dashboard';
    state.page = page;
    document.querySelectorAll('[data-view]').forEach(el => { const on = el.dataset.view === page; el.hidden = !on; el.classList.toggle('is-visible', on); });
    document.querySelectorAll('.nav-item').forEach(el => { const on = el.dataset.page === page; el.classList.toggle('is-active', on); el.setAttribute('aria-current', on ? 'page' : 'false'); });
    $('crumb').textContent = viewTitles[page][0]; $('pageTitle').textContent = viewTitles[page][0]; $('pageSub').textContent = viewTitles[page][1];
    $('globalFilters').style.display = ['inicio', 'api', 'dados', 'historico'].includes(page) ? 'none' : 'flex';
    $('sidebar').classList.remove('is-open'); $('mobileShade').classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (page === 'dashboard') { drawDashboardChart(); ensureMap('dashboardMap'); }
    if (page === 'mapa') ensureMap('largeMap');
    if (page === 'temporal') drawTemporalCharts();
    if (page === 'historico') loadHistory();
    if (page === 'modelos') loadModel();
  }
  function navigate(page) { if (location.hash.slice(1) !== page) location.hash = page; else showPage(page); }

  // ------------------------------------------------------------------ dados
  async function getSeries(region) {
    if (!state.series[region]) state.series[region] = await API.timeSeries(region);
    return state.series[region];
  }
  function invalidateData() { state.series = {}; }

  async function loadPeriods(keep) {
    const periods = await API.periods(state.region);
    const select = $('periodSelect');
    select.innerHTML = periods.map(p => `<option value="${esc(p)}">${esc(monthLabel(p))}</option>`).join('');
    if (!(keep && periods.includes(state.period))) state.period = periods[0] || null;
    select.value = state.period || '';
    const last = periods[0]; if (last && $('lastYear')) $('lastYear').textContent = last.slice(0, 4);
  }

  async function refresh() {
    if (!state.period) return;
    try {
      const [obs, sites] = await Promise.all([API.observation(state.region, state.period), API.mapSites(state.period)]);
      state.sites = sites;
      reflect(obs);
    } catch (err) { toast(err.message, 'danger'); }
  }

  function reflect(obs) {
    state.observation = obs;
    const p = obs.previsao;
    const rule = obs.recomendacao;
    bind('region', BR[obs.region] || obs.region);
    bind('periodText', monthLabel(obs.period));
    bind('conjunto', { treino: 'ano de treino', teste: 'ano de teste', novo: 'fora do treino', 'excluído': 'excluído do treino' }[obs.conjunto] || obs.conjunto);
    bind('ndvi', isNum(obs.ndvi) ? fmt(obs.ndvi) : 's/ dados');
    bind('ndviZ', signed(obs.ndviZ));
    bind('cobertura', pct(obs.cobertura));
    bind('classeObservada', obs.classeObservada ? classLabel(obs.classeObservada) : (isNum(obs.ndvi) ? 'não fiável' : 'sem NDVI'));
    bind('chuvaMm', fmt(obs.chuvaMm, 0));
    bind('chuvaZ', signed(obs.chuvaZ));
    bind('chuvaLag1', fmt(obs.chuvaLag1, 0)); bind('chuvaLag2', fmt(obs.chuvaLag2, 0)); bind('chuvaLag3', fmt(obs.chuvaLag3, 0));
    bind('vv', fmt(obs.vv, 1)); bind('vh', fmt(obs.vh, 1)); bind('vvZ', signed(obs.vvZ));
    bind('stressClass', p ? CLASS_LONG[p.classe] : 'Sem previsão');
    bind('confianca', p ? pct(p.confianca) : '—');
    bind('modelVersion', p ? p.versaoModelo : (state.metrics?.version || '—'));
    bind('recommendation', rule ? rule.texto : (obs.previsaoErro || 'Sem previsão para este período.'));
    bind('ruleId', rule ? rule.id : '—');
    bind('ndviEvidence', isNum(obs.ndvi) ? `${fmt(obs.ndvi)} / ${signed(obs.ndviZ)}` : 'sem NDVI (nuvens)');
    bind('rainEvidence', `${fmt(obs.chuvaMm, 0)} / ${fmt(obs.chuvaLag1, 0)} mm`);
    bind('radarEvidence', `${fmt(obs.vv, 1)} / ${fmt(obs.vh, 1)} dB`);
    bind('probText', p ? `${pct(p.probNormal)} / ${pct(p.probModerado)} / ${pct(p.probSevero)}` : '—');
    bind('lagsText', `${fmt(obs.chuvaLag1, 0)} / ${fmt(obs.chuvaLag2, 0)} / ${fmt(obs.chuvaLag3, 0)} mm`);
    bind('radarZText', `${signed(obs.vvZ)} / ${signed(obs.vhZ)}`);
    bind('ndviObsText', isNum(obs.ndvi) ? `${fmt(obs.ndvi)} (${signed(obs.ndviZ)}) → ${obs.classeObservada ? classLabel(obs.classeObservada) : 'não fiável'}` : 'sem NDVI');

    const color = p ? classColor(p.classe) : GREY;
    document.querySelectorAll('.decision-condition, .recommendation-primary').forEach(el => { el.style.borderLeft = '4px solid ' + color; });
    const kpi = document.querySelector('.kpi-stress .kpi-value'); if (kpi) kpi.style.color = color;
    const pill = $('stressPill'); if (pill) pill.className = 'pill ' + (!p ? 'pill-neutral' : p.classe === 'normal' ? 'pill-green' : p.classe === 'moderado' ? 'pill-amber' : 'pill-priority');
    const rainBar = $('rainBar'); if (rainBar) rainBar.style.width = Math.min(100, (obs.chuvaMm || 0) / 4) + '%';
    const radarBar = $('radarBar'); if (radarBar) radarBar.style.width = Math.max(0, Math.min(100, ((obs.vv + 14) / 7) * 100)) + '%';

    const bars = $('probBars');
    if (bars) {
      bars.innerHTML = p ? CLASSES.map(c => {
        const v = c === 'normal' ? p.probNormal : c === 'moderado' ? p.probModerado : p.probSevero;
        return `<div class="prob-bar" title="${esc(CLASS_LABEL[c])}: ${pct(v)}"><span style="width:${(v * 100).toFixed(1)}%;background:${CLASS_COLOR[c]}"></span><small>${esc(CLASS_LABEL[c])} ${pct(v)}</small></div>`;
      }).join('') : `<small class="text-muted">${esc(obs.previsaoErro || '')}</small>`;
    }
    const notes = $('obsNotes');
    if (notes) notes.innerHTML = (obs.notas || []).map(n => `<li>${esc(n)}</li>`).join('');

    if (state.page === 'dashboard') { drawDashboardChart(); updateMap('dashboardMap'); }
    if (state.page === 'temporal') drawTemporalCharts();
    if (state.page === 'mapa') updateMap('largeMap');
    renderMapSites();
  }

  // ------------------------------------------------------------------ gráficos
  function createChart(id, config) {
    const canvas = $(id);
    if (!canvas || canvas.closest('[hidden]')) return;
    if (typeof Chart === 'undefined') { drawFallbackChart(id, config); return; }
    const old = canvas.parentElement.querySelector('.fallback-svg'); if (old) old.remove();
    canvas.style.display = '';
    if (state.charts[id]) state.charts[id].destroy();
    state.charts[id] = new Chart(canvas, config);
  }
  function drawFallbackChart(id, config) {
    const canvas = $(id), holder = canvas.parentElement;
    const old = holder.querySelector('.fallback-svg'); if (old) old.remove();
    canvas.style.display = 'none';
    const labels = config.data.labels || [], series = config.data.datasets || [];
    const vals = series.flatMap(d => d.data.map(Number).filter(Number.isFinite));
    if (!vals.length) return;
    const min = Math.min(0, ...vals), max = Math.max(...vals);
    const width = 640, height = 250, left = 44, right = 16, top = 18, bottom = 40, cw = width - left - right, ch = height - top - bottom;
    const x = i => left + (labels.length <= 1 ? 0.5 : i / (labels.length - 1)) * cw, y = v => top + ch - (v - min) / (max - min || 1) * ch;
    let out = `<svg class="fallback-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico">`;
    for (let i = 0; i <= 4; i++) { const yy = top + i * ch / 4; out += `<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" stroke="#e9eee8"/><text x="${left - 9}" y="${yy + 3}" font-size="10" fill="#92a595" text-anchor="end">${fmt(max - i * (max - min) / 4, 1)}</text>`; }
    series.forEach(d => {
      const color = d.borderColor || d.backgroundColor || '#648f70';
      const pts = d.data.map((v, i) => Number.isFinite(Number(v)) && v !== null ? `${x(i)},${y(v)}` : null).filter(Boolean).join(' ');
      out += `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${pts}"/>`;
    });
    holder.insertAdjacentHTML('beforeend', out + '</svg>');
  }
  function chartOptions(yMin, yMax, extra) {
    const o = {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 10 }, color: '#819588' } }, tooltip: { backgroundColor: '#1c3e32' } },
      scales: { x: { grid: { display: false }, ticks: { color: '#90a194', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { min: yMin, max: yMax, grid: { color: '#eff1ea' }, ticks: { color: '#90a194', font: { size: 10 } } } }
    };
    return extra ? extra(o) : o;
  }
  const line = (label, data, color, opts) => Object.assign({ label, data, borderColor: color, backgroundColor: color, borderWidth: 2, tension: .3, fill: false, pointRadius: 2, pointHoverRadius: 5, spanGaps: false }, opts || {});

  async function drawDashboardChart() {
    if (state.page !== 'dashboard' || !state.period) return;
    try {
      const all = await getSeries(state.region);
      const idx = all.findIndex(r => r.period === state.period);
      const rows = all.slice(Math.max(0, idx - 23), idx + 1);
      if (state.page !== 'dashboard') return;
      createChart('dashboardChart', {
        type: 'line',
        data: { labels: rows.map(r => shortLabel(r.period)), datasets: [
          line('NDVI (z)', rows.map(r => r.ndviZ), palette.ndvi),
          line('Chuva (z)', rows.map(r => r.chuvaZ), palette.rain),
          line('Radar VV (z)', rows.map(r => r.vvZ), palette.soil)
        ] },
        options: chartOptions(-4, 4)
      });
    } catch (e) { console.warn(e); }
  }

  async function drawTemporalCharts() {
    if (state.page !== 'temporal') return;
    try {
      const rows = await getSeries(state.region);
      if (state.page !== 'temporal') return;
      const labels = rows.map(r => shortLabel(r.period));
      createChart('ndviChart', {
        type: 'line',
        data: { labels, datasets: [
          line('NDVI', rows.map(r => r.ndvi), palette.ndvi, { yAxisID: 'y' }),
          line('Anomalia (z)', rows.map(r => r.ndviZ), palette.anomaly, { yAxisID: 'y1', borderDash: [4, 3], pointRadius: 1 })
        ] },
        options: chartOptions(0, 0.9, o => { o.scales.y1 = { position: 'right', min: -4, max: 4, grid: { display: false }, ticks: { color: '#c08a6c', font: { size: 10 } } }; return o; })
      });
      createChart('rainChart', {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Chuva (mm)', data: rows.map(r => r.chuvaMm), backgroundColor: rows.map(r => r.period === state.period ? '#8f6a30' : '#c7a36b'), borderRadius: 3 }] },
        options: chartOptions(0, undefined)
      });
      createChart('soilChart', {
        type: 'line',
        data: { labels, datasets: [line('VV (dB)', rows.map(r => r.vv), palette.soil), line('VH (dB)', rows.map(r => r.vh), palette.vh)] },
        options: chartOptions(undefined, undefined)
      });
      const toNum = c => c ? CLASSES.indexOf(c) : null;
      createChart('classChart', {
        type: 'line',
        data: { labels, datasets: [
          line('Prevista (ML.NET)', rows.map(r => toNum(r.previsao?.classe)), '#2f6a50', { stepped: true, pointRadius: 0 }),
          line('Observada (NDVI)', rows.map(r => toNum(r.classeObservada)), '#c37660', { showLine: false, pointRadius: 3 })
        ] },
        options: chartOptions(-0.2, 2.2, o => { o.scales.y.ticks.stepSize = 1; o.scales.y.ticks.callback = v => CLASS_LABEL[CLASSES[v]] || ''; return o; })
      });
    } catch (e) { toast(e.message, 'danger'); }
  }

  // ------------------------------------------------------------------ mapa
  function siteColor(site) {
    if (state.mapLayer === 'ndvi') return zColor(site.ndviZ);
    if (state.mapLayer === 'rain') return zColor(site.chuvaZ);
    return classColor(site.stressClass);
  }
  function siteText(site) {
    return `${site.label} · ${monthLabel(site.period)} · prevista: ${classLabel(site.stressClass)}` +
      (isNum(site.confidence) ? ` (${pct(site.confidence)})` : '') +
      ` · observada: ${site.observedClass ? classLabel(site.observedClass) : '—'}`;
  }
  function buildFallbackMap(id) {
    const target = $(id); if (!target) return;
    const shown = state.sites.filter(s => id === 'largeMap' || s.region === state.region);
    const pctX = s => Math.max(9, Math.min(91, ((s.lng - 34.0) / 1.3) * 100));
    const pctY = s => Math.max(12, Math.min(88, ((-18.4 - s.lat) / 2.0) * 100));
    target.innerHTML = '<div class="offline-map"><div class="offline-river"></div><span class="offline-map-label">SOFALA</span><span class="offline-region" style="top:18%;left:68%">MUANZA</span><span class="offline-region" style="top:74%;left:25%">BÚZI</span><small class="offline-map-info">Mapa esquemático (sem ligação ao OpenStreetMap)</small></div>';
    const inner = target.querySelector('.offline-map');
    shown.forEach(site => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'offline-pin';
      b.style.left = pctX(site) + '%'; b.style.top = pctY(site) + '%'; b.style.background = siteColor(site);
      b.title = siteText(site); b.setAttribute('aria-label', b.title); b.onclick = () => toast(b.title);
      inner.append(b);
    });
  }
  function ensureMap(id) {
    if (!$(id)) return;
    if (typeof L === 'undefined') { buildFallbackMap(id); renderMapSites(); return; }
    if (!state.maps[id]) {
      $(id).innerHTML = '';
      const map = L.map(id, { zoomControl: true, scrollWheelZoom: false }).setView([-19.4, 34.7], 8);
      state.maps[id] = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 16, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    }
    updateMap(id);
    setTimeout(() => state.maps[id] && state.maps[id].invalidateSize(), 120);
  }
  function updateMap(singleId) {
    const ids = singleId ? [singleId] : ['dashboardMap', 'largeMap'];
    ids.forEach(id => {
      if (!$(id)) return;
      if (typeof L === 'undefined') { buildFallbackMap(id); return; }
      const map = state.maps[id]; if (!map) return;
      (state.mapLayers[id] || []).forEach(layer => map.removeLayer(layer));
      state.mapLayers[id] = [];
      state.sites.filter(s => id === 'largeMap' || s.region === state.region).forEach(site => {
        const marker = L.circleMarker([site.lat, site.lng], { radius: id === 'largeMap' ? 22 : 16, color: '#fff', weight: 3, fillColor: siteColor(site), fillOpacity: .88 })
          .bindPopup(`<strong>${esc(site.label)}</strong><br>${esc(monthLabel(site.period))}<br>Prevista: <b>${esc(classLabel(site.stressClass))}</b>${isNum(site.confidence) ? ' (' + pct(site.confidence) + ')' : ''}<br>Observada (NDVI): ${esc(site.observedClass ? classLabel(site.observedClass) : '—')}<br>NDVI z: ${signed(site.ndviZ)} · Chuva z: ${signed(site.chuvaZ)}`)
          .addTo(map);
        state.mapLayers[id].push(marker);
      });
      if (id === 'dashboardMap') {
        const s = state.sites.find(x => x.region === state.region);
        if (s) map.setView([s.lat, s.lng], 8);
      } else map.setView([-19.4, 34.7], 8);
    });
    renderMapSites();
  }
  function renderMapSites() {
    const el = $('mapSiteList'); if (!el) return;
    el.innerHTML = '';
    state.sites.forEach(site => {
      const b = document.createElement('button'); b.className = 'site-row'; b.type = 'button';
      b.innerHTML = `<i class="legend-dot" style="background:${siteColor(site)}"></i><span><b>${esc(site.label)}</b><small>Prevista ${esc(classLabel(site.stressClass))}${isNum(site.confidence) ? ' · ' + pct(site.confidence) : ''} · NDVI z ${signed(site.ndviZ)} · chuva z ${signed(site.chuvaZ)}</small></span><i class="bi bi-arrow-up-right"></i>`;
      b.onclick = () => { const map = state.maps.largeMap; if (map) { map.setView([site.lat, site.lng], 9); const m = (state.mapLayers.largeMap || []).find(x => x.getLatLng().lat === site.lat); if (m) m.openPopup(); } };
      el.append(b);
    });
  }

  // ------------------------------------------------------------------ recomendações
  async function loadRules() {
    try {
      state.rules = await API.recommendations();
      const grid = $('rulesGrid'); if (!grid) return;
      const css = { normal: 'healthy-label', moderado: 'moderate-label', severo: 'severe-label' };
      grid.innerHTML = state.rules.map(r => `<div class="rule-card"><span class="rule-number ${css[r.classe] || ''}">${esc(r.id)} · ${esc(r.titulo.toUpperCase())}</span><p>${esc(r.texto)}</p><small class="text-muted">Prioridade ${esc(r.prioridade)}</small></div>`).join('');
    } catch (e) { console.warn(e); }
  }
  async function recordDecision() {
    const obs = state.observation; if (!obs) return;
    if (!obs.previsao) { toast(obs.previsaoErro || 'Não há previsão para este período.', 'warning'); return; }
    const button = $('recordDecision');
    busy(button, true, 'A registar…');
    try {
      const r = await API.review({ region: obs.region, period: obs.period, note: $('decisionNote').value.trim() });
      $('decisionNote').value = '';
      toast(r.message || 'Análise registada.');
    } catch (e) { toast(e.message, 'danger'); }
    finally { busy(button, false); }
  }

  // ------------------------------------------------------------------ modelo
  async function loadModelStatus() {
    const badge = $('modelStatusBadge'), pill = $('aiStatusPill');
    try {
      const s = await API.modelStatus();
      if (s.available) {
        if (badge) { badge.innerHTML = `<span style="background:#5f9a6e"></span> DADOS REAIS ${esc(s.firstPeriod?.slice(0, 4))}–${esc(s.lastPeriod?.slice(0, 4))} · MODELO ${esc(s.version)}`; badge.classList.add('status-ok'); }
        if (pill) { pill.textContent = 'ONLINE · ' + s.activeModel; pill.className = 'pill pill-green'; }
      } else {
        if (badge) badge.innerHTML = '<span style="background:#c37660"></span> MODELO INDISPONÍVEL';
        if (pill) { pill.textContent = 'MODELO INDISPONÍVEL'; pill.className = 'pill pill-priority'; }
        toast('Modelo ML.NET indisponível: ' + (s.error || ''), 'danger');
      }
      if ($('datasetInfo')) $('datasetInfo').textContent = `Dataset actual: ${s.dataRows} linhas, de ${monthLabel(s.firstPeriod)} a ${monthLabel(s.lastPeriod)}.`;
      return s;
    } catch (e) {
      if (badge) badge.innerHTML = '<span style="background:#c37660"></span> API INDISPONÍVEL';
      return null;
    }
  }

  async function loadModel(force) {
    if (state.metrics && !force) { renderMetrics(); return; }
    try { state.metrics = await API.modelMetrics(); renderMetrics(); }
    catch (e) { toast(e.message, 'danger'); }
  }

  function renderMetrics() {
    const m = state.metrics; if (!m) return;
    const f3 = v => isNum(v) ? v.toFixed(3).replace('.', ',') : '—';
    const active = m.models.find(x => x.isActive) || m.models[m.models.length - 1];
    $('aiActive').textContent = m.activeModel;
    $('aiVer').textContent = m.version;
    $('aiTrainedAt').textContent = new Date(m.trainedAtUtc).toLocaleString('pt-PT');
    $('aiLastYear').textContent = m.lastTrainingYear;
    $('govLastYear').textContent = m.lastTrainingYear;
    $('aiRows').textContent = `${m.trainRows} meses de treino, ${m.testRows} de teste`;
    $('aiAcc').textContent = f3(active.accuracy); $('aiPrec').textContent = f3(active.precisionMacro);
    $('aiRec').textContent = f3(active.recallMacro); $('aiF1').textContent = f3(active.f1Macro);

    $('modelCards').innerHTML = m.models.map((x, i) => `
      <article class="panel model-card ${x.isActive ? 'model-best' : ''}">
        <div class="model-top"><span class="model-tag">MODELO ${String.fromCharCode(65 + i)}</span>
          <span class="pill ${x.isActive ? 'pill-green' : 'pill-neutral'}">${x.isActive ? 'ACTIVO' : (i === 0 ? 'REFERÊNCIA' : 'COMPARAÇÃO')}</span></div>
        <h3>${esc(x.name)}</h3>
        <div class="metric-row">
          <div><small>EXATIDÃO</small><b>${f3(x.accuracy)}</b></div>
          <div><small>PRECISÃO</small><b>${f3(x.precisionMacro)}</b></div>
          <div><small>RECALL</small><b>${f3(x.recallMacro)}</b></div>
          <div><small>F1-MACRO</small><b>${f3(x.f1Macro)}</b></div>
        </div>
      </article>`).join('');

    const sel = $('cmModelSelect');
    const current = sel.value;
    sel.innerHTML = m.models.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('');
    sel.value = current && m.models[current] ? current : String(m.models.indexOf(active));
    renderConfusion();
  }

  function renderConfusion() {
    const m = state.metrics; if (!m) return;
    const model = m.models[Number($('cmModelSelect').value)] || m.models[0];
    const tbody = $('aiConfusionTable').querySelector('tbody');
    tbody.innerHTML = model.confusionMatrix.map((row, i) =>
      `<tr><th>${esc(classLabel(m.classes[i]))}</th>${row.map((v, j) => `<td class="${i === j ? 'heat-high' : (v > 0 ? 'heat-off' : '')}">${v}</td>`).join('')}</tr>`).join('');
    const f3 = v => v.toFixed(3).replace('.', ',');
    $('perClassTable').querySelector('tbody').innerHTML = model.perClass.map(c =>
      `<tr><td>${esc(classLabel(c.classe))}</td><td>${f3(c.precisao)}</td><td>${f3(c.recall)}</td><td>${f3(c.f1)}</td><td>${c.suporte}</td></tr>`).join('');
  }

  function renderPrediction(res) {
    const p = res.prediction, el = $('aiVerifyResult');
    const probs = CLASSES.map(c => {
      const v = c === 'normal' ? p.probNormal : c === 'moderado' ? p.probModerado : p.probSevero;
      return `<div class="prob-bar"><span style="width:${(v * 100).toFixed(1)}%;background:${CLASS_COLOR[c]}"></span><small>${esc(CLASS_LABEL[c])} ${pct(v)}</small></div>`;
    }).join('');
    el.innerHTML = `
      <div class="predict-card" style="border-left:4px solid ${classColor(p.classe)}">
        <div class="d-flex justify-content-between flex-wrap gap-2">
          <strong>${esc(BR[res.region] || res.region)} · ${esc(monthLabel(res.period))}: ${esc(CLASS_LONG[p.classe])}</strong>
          <span class="pill pill-neutral">${esc(res.origin === 'manual' ? 'valores introduzidos' : 'dados do dataset')} · ${esc(p.versaoModelo)}</span>
        </div>
        <div class="prob-bars">${probs}</div>
        <p class="mb-1 mt-2"><b>${esc(res.recommendation.id)}</b> — ${esc(res.recommendation.texto)}</p>
        ${res.observedClass ? `<p class="mb-1 small">Classe observada (NDVI): <b>${esc(classLabel(res.observedClass))}</b></p>` : ''}
        <ul class="notes-list">${(res.notes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul>
        ${res.savedId ? `<p class="small text-success mb-0"><i class="bi bi-check2-circle"></i> Registado no histórico (#${res.savedId}).</p>` : ''}
        ${res.saveWarning ? `<p class="small text-danger mb-0">${esc(res.saveWarning)}</p>` : ''}
      </div>`;
  }

  async function predictSelected() {
    if (!state.observation) { toast('Seleccione primeiro uma região e um período.', 'warning'); return; }
    const button = $('aiVerifyBtn');
    busy(button, true, 'A prever…');
    try {
      const res = await API.predict({ region: state.region, period: state.period, save: true });
      renderPrediction(res);
      toast('Previsão calculada pelo modelo ML.NET.');
    } catch (e) { $('aiVerifyResult').textContent = e.message; toast(e.message, 'danger'); }
    finally { busy(button, false); }
  }

  function fillManualForm() {
    const o = state.observation; if (!o) return;
    $('mpRegion').value = o.region;
    $('mpPeriod').value = o.period;
    $('mpRain').value = isNum(o.chuvaMm) ? o.chuvaMm.toFixed(1) : '';
    $('mpLag1').value = isNum(o.chuvaLag1) ? o.chuvaLag1.toFixed(1) : '';
    $('mpLag2').value = isNum(o.chuvaLag2) ? o.chuvaLag2.toFixed(1) : '';
    $('mpLag3').value = isNum(o.chuvaLag3) ? o.chuvaLag3.toFixed(1) : '';
    $('mpVv').value = isNum(o.vv) ? o.vv.toFixed(2) : '';
    $('mpVh').value = isNum(o.vh) ? o.vh.toFixed(2) : '';
  }

  async function predictManual(ev) {
    ev.preventDefault();
    const num = id => { const v = $(id).value; return v === '' ? null : Number(v); };
    const payload = {
      region: $('mpRegion').value, period: $('mpPeriod').value,
      chuvaMm: num('mpRain'), chuvaLag1: num('mpLag1'), chuvaLag2: num('mpLag2'), chuvaLag3: num('mpLag3'),
      vv: num('mpVv'), vh: num('mpVh'), save: true
    };
    if (Object.values(payload).some(v => v === null || v === '')) { toast('Preencha todos os campos.', 'warning'); return; }
    const button = ev.submitter || $('manualPredictForm').querySelector('[type=submit]');
    busy(button, true, 'A prever…');
    try { renderPrediction(await API.predict(payload)); toast('Previsão com valores introduzidos concluída.'); }
    catch (e) { $('aiVerifyResult').textContent = e.message; toast(e.message, 'danger'); }
    finally { busy(button, false); }
  }

  async function trainModel() {
    if (!confirm('Retreinar o modelo com o dataset actual? O modelo actual fica arquivado e o novo passa a ser usado nas previsões.')) return;
    const button = $('trainBtn');
    busy(button, true, 'A treinar…');
    try {
      const r = await API.train();
      toast(`Novo modelo activo: ${r.version} (${r.linhasTreino} meses de treino, ${r.linhasTeste} de teste).`);
      invalidateData();
      await Promise.all([loadModel(true), loadModelStatus()]);
      await refresh();
    } catch (e) { toast(e.message, 'danger'); }
    finally { busy(button, false); }
  }

  // ------------------------------------------------------------------ dados (admin)
  async function importDataset() {
    const file = $('datasetFile').files[0], box = $('validationResult'), dryRun = $('dryRun').checked;
    if (!file) { toast('Seleccione primeiro um ficheiro.', 'warning'); return; }
    if (!/\.csv$/i.test(file.name)) { toast('Só são aceites ficheiros CSV.', 'danger'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('Ficheiro superior a 5 MB.', 'danger'); return; }
    const button = $('validateBtn');
    busy(button, true, dryRun ? 'A validar…' : 'A importar…');
    const render = (r, ok) => {
      box.classList.remove('empty-validation');
      const items = [...(r.erros || []).map(t => 'ERRO: ' + t), ...(r.avisos || []).map(t => 'AVISO: ' + t)];
      const summary = ok
        ? `${r.linhasLidas} linha(s) válidas · ${r.novas} nova(s) · ${r.actualizadas} a substituir · ${r.totalDepois} no dataset. ${r.simulacao ? 'Simulação: nada foi gravado — desmarque «Só validar» para importar.' : 'Importação gravada.'}`
        : `${(r.erros || []).length} erro(s). Corrija o ficheiro: nada foi importado.`;
      box.innerHTML = `<div class="validation-summary ${ok ? '' : 'validation-error'}">${esc(summary)}</div>` +
        (items.length ? `<ul class="validation-list">${items.slice(0, 40).map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '');
    };
    try {
      const r = await API.importDataset(file, dryRun);
      render(r, true);
      if (!r.simulacao) {
        toast('Dados importados. As previsões já usam os novos meses.');
        invalidateData();
        await loadPeriods(true); await loadModelStatus(); await refresh();
      }
    } catch (e) {
      if (e.body && Array.isArray(e.body.erros)) render(e.body, false);
      else { box.textContent = e.message; }
      toast(e.message, 'danger');
    } finally { busy(button, false); }
  }
  function sampleCsv() {
    const text = 'distrito,ano,mes,ndvi_medio,pixels_validos,n_imagens_s2,chuva_mm,vv_medio,vh_medio,n_imagens_s1\r\n' +
      'Buzi,2026,1,0.58,700000,30,210.5,-9.9,-16.0,18\r\nMuanza,2026,1,,0,0,250.2,-9.4,-15.6,18\r\n';
    download(text, 'terra-sinal-modelo-importacao.csv');
  }

  // ------------------------------------------------------------------ histórico
  async function loadHistory() {
    const root = $('historyBody'); if (!root) return;
    root.innerHTML = '<tr><td colspan="9">A carregar…</td></tr>';
    try {
      state.history = await API.predictionsHistory();
      $('historyCount').textContent = state.history.length + ' registos';
      if (!state.history.length) { root.innerHTML = '<tr><td colspan="9">Ainda não há registos. Use «Prever e registar» ou «Registar análise».</td></tr>'; return; }
      const tag = c => `<span class="class-tag ${c === 'severo' ? 'class-severe' : c === 'normal' ? 'class-healthy' : ''}">${esc(classLabel(c))}</span>`;
      root.innerHTML = state.history.map(r => `<tr>
        <td>${esc(new Date(r.recordedAt).toLocaleString('pt-PT'))}<br><small>${esc(monthLabel(r.period))}</small></td>
        <td>${esc(BR[r.region] || r.region)}</td><td>${tag(r.stressClass)}</td>
        <td>${r.observedClass ? tag(r.observedClass) : '—'}</td><td>${pct(r.confidence)}</td>
        <td>${esc(r.ruleId)}</td><td>${esc(r.modelVersion)}</td><td>${esc(r.status)}<br><small>${esc(r.origin)}</small></td>
        <td>${esc(r.user)}${r.note ? `<br><small>${esc(r.note)}</small>` : ''}</td></tr>`).join('');
    } catch (e) { root.innerHTML = `<tr><td colspan="9">${esc(e.message)}</td></tr>`; }
  }

  // ------------------------------------------------------------------ exportação
  const csvEncode = rows => rows.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
  function download(content, name, mime = 'text/csv;charset=utf-8') {
    const blob = new Blob(['﻿', content], { type: mime });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportObservations() {
    try {
      const rows = await getSeries(state.region);
      download(csvEncode([
        ['period', 'region', 'ndvi', 'ndviZ', 'cobertura', 'classeObservada', 'chuvaMm', 'chuvaZ', 'chuvaLag1', 'chuvaLag2', 'chuvaLag3', 'vv', 'vh', 'vvZ', 'vhZ', 'classePrevista', 'probNormal', 'probModerado', 'probSevero', 'versaoModelo', 'conjunto'],
        ...rows.map(r => [r.period, r.region, r.ndvi, r.ndviZ, r.cobertura, r.classeObservada, r.chuvaMm, r.chuvaZ, r.chuvaLag1, r.chuvaLag2, r.chuvaLag3, r.vv, r.vh, r.vvZ, r.vhZ,
          r.previsao?.classe, r.previsao?.probNormal, r.previsao?.probModerado, r.previsao?.probSevero, r.previsao?.versaoModelo, r.conjunto])
      ]), `terra-sinal-${state.region.toLowerCase()}-serie.csv`);
    } catch (e) { toast(e.message, 'danger'); }
  }
  function exportHistory() {
    download(csvEncode([['recordedAt', 'period', 'region', 'stressClass', 'observedClass', 'confidence', 'ruleId', 'modelVersion', 'status', 'origin', 'user', 'note'],
      ...state.history.map(r => [r.recordedAt, r.period, r.region, r.stressClass, r.observedClass, r.confidence, r.ruleId, r.modelVersion, r.status, r.origin, r.user, r.note])]), 'terra-sinal-auditoria.csv');
  }

  // ------------------------------------------------------------------ arranque
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

  async function init() {
    if (!$('regionSelect') || !$('sideNav')) return;
    on('regionSelect', 'change', async ev => { state.region = ev.target.value; await loadPeriods(true); refresh(); });
    on('periodSelect', 'change', ev => { state.period = ev.target.value; refresh(); });
    on('mapLayer', 'change', ev => { state.mapLayer = ev.target.value; updateMap(); });
    on('menuBtn', 'click', () => { $('sidebar').classList.toggle('is-open'); $('mobileShade').classList.toggle('active'); });
    on('mobileShade', 'click', () => { $('sidebar').classList.remove('is-open'); $('mobileShade').classList.remove('active'); });
    document.querySelectorAll('[data-navigate]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.navigate)));
    window.addEventListener('hashchange', () => showPage(location.hash.substring(1)));
    on('exportBtn', 'click', exportObservations);
    on('exportHistory', 'click', exportHistory);
    on('refreshHistory', 'click', loadHistory);
    on('recordDecision', 'click', recordDecision);
    on('validateBtn', 'click', importDataset);
    on('sampleBtn', 'click', sampleCsv);
    on('trainBtn', 'click', trainModel);
    on('aiVerifyBtn', 'click', predictSelected);
    on('mpFill', 'click', fillManualForm);
    on('manualPredictForm', 'submit', predictManual);
    on('cmModelSelect', 'change', renderConfusion);

    $('regionSelect').value = state.region;
    loadModelStatus();
    loadRules();
    try { await loadPeriods(false); }
    catch (e) { toast('Não foi possível carregar os períodos: ' + e.message, 'danger'); }
    await refresh();
    fillManualForm();
    showPage(location.hash.slice(1) || 'dashboard');
  }
  document.addEventListener('DOMContentLoaded', init);
})();
