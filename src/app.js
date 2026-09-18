/* Data Center Capacity Map — Proxima
 * Multi-provider. Every displayed value resolves to a source id carrying a tier.
 *
 * Providers do not describe themselves the same way, and the map refuses to pretend
 * otherwise. AWS publishes exact per-region AZ counts; Azure publishes only whether a
 * region has zones, with a documented minimum of three. So AZ totals are a count for
 * one provider and a floor for the other, and the page labels them differently.
 */

const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const GEOS = ['Global', 'North America', 'Europe', 'Asia Pacific', 'Middle East', 'South America', 'Africa'];

const PARTITIONS = {
  commercial: 'Commercial',
  govcloud:   'GovCloud (US)',
  government: 'Government (US)',
  china:      'China',
  sovereign:  'EU Sovereign'
};

const ACCESS = {
  general:    'Open',
  'opt-in':   'Opt-in required',
  restricted: 'Restricted access'
};

const ZONE_STATE = {
  zones:   { label: 'Has zones',     color: '#34D399' },
  preview: { label: 'Zones in preview', color: '#FBBF24' },
  none:    { label: 'No zones',      color: '#64748B' }
};

const PRECISION = {
  facility:         { label: 'Facility',       blurb: 'Exact published facility location' },
  campus:           { label: 'Campus cluster', blurb: 'Known siting cluster, building unresolved' },
  'metro-centroid': { label: 'Metro centroid', blurb: 'Metro only — position is indicative' }
};

function zoneState(r) {
  if (r.azs_basis === 'preview') return 'preview';
  return r.azs > 0 ? 'zones' : 'none';
}

const COLOR_MODES = {
  provider: {
    label: 'Provider',
    legend: 'One file per provider. Totals are never merged across providers that count differently.',
    key: r => r._p.id,
    colorFor: r => r._p.color,
    entries: () => state.providers.map(p => [p.id, p.name, p.color])
  },
  partition: {
    label: 'Partition',
    legend: 'Commercial regions are open to any account. The others need a separate account and contract.',
    key: r => r.partition,
    scale: { commercial: '#FF9900', govcloud: '#5B8DEF', government: '#5B8DEF', china: '#E0557B', sovereign: '#22C3A6' },
    names: PARTITIONS
  },
  zones: {
    label: 'Zone support',
    legend: 'Whether the region offers availability zones at all. A quarter of Azure regions do not.',
    key: zoneState,
    scale: Object.fromEntries(Object.entries(ZONE_STATE).map(([k, v]) => [k, v.color])),
    names: Object.fromEntries(Object.entries(ZONE_STATE).map(([k, v]) => [k, v.label]))
  },
  carbon: {
    label: 'Low CO₂',
    legend: 'Google flags low-carbon regions per region. AWS and Microsoft publish no equivalent, so theirs read as not published rather than no.',
    key: r => r.low_co2 || 'not published',
    scale: { yes: '#34A853', no: '#94A3B8', 'not published': '#475569' },
    names: { yes: 'Low CO₂ (Google)', no: 'Not low CO₂', 'not published': 'Not published' }
  },
  leverage: {
    label: 'Grid leverage',
    legend: 'Buyer leverage on delivery timing, from the Grid-Headroom Map. US markets only.',
    key: r => (r.grid && r.grid.leverage) || 'Not scored',
    scale: { High: '#EF4444', Moderate: '#F59E0B', Some: '#FBBF24', Low: '#10B981', 'Not scored': '#5A6B85' },
    names: { High: 'High', Moderate: 'Moderate', Some: 'Some', Low: 'Low', 'Not scored': 'Not scored' }
  }
};

function azLabel(r) {
  if (r.azs_basis === 'preview') return 'preview';
  if (r.azs === 0) return '—';
  return r.azs_basis === 'minimum' ? r.azs + '+' : String(r.azs);
}

const COLUMNS = [
  { key: 'name',      label: 'Region',    get: r => r.name,     sort: r => r.name,     type: 'text', swatch: true },
  { key: 'provider',  label: 'Provider',  get: r => r._p.short, sort: r => r._p.short, type: 'text' },
  { key: 'id',        label: 'Code',      get: r => r.id,       sort: r => r.id,       type: 'mono' },
  { key: 'geo',       label: 'Geography', get: r => r.geo,      sort: r => r.geo,      type: 'text' },
  { key: 'metro',     label: 'Location',  get: r => r.metro || '—', sort: r => r.metro || '', type: 'text' },
  { key: 'azs',       label: 'Zones',     get: azLabel,         sort: r => r.azs,      type: 'num' },
  { key: 'access',    label: 'Access',    get: r => ACCESS[r.access] || r.access, sort: r => r.access, type: 'text' },
  { key: 'paired',    label: 'Paired with', get: r => r.paired_with_raw || '—', sort: r => r.paired_with_raw || '', type: 'text' },
  { key: 'leverage',  label: 'Grid leverage', get: r => (r.grid && r.grid.leverage) || '—', sort: r => (r.grid && r.grid.constraint_index) || 0, type: 'text' }
];

const state = {
  providers: [],
  regions: [],
  pipeline: [],
  sources: {},
  world: null,
  geo: 'Global',
  provider: 'all',
  colorBy: 'provider',
  selected: null,
  sort: { key: 'azs', dir: -1 }
};

/* ── helpers ───────────────────────────────────────────────── */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function mode() { return COLOR_MODES[state.colorBy]; }
function colorOf(r) {
  const m = mode();
  if (m.colorFor) return m.colorFor(r);
  return m.scale[m.key(r)] || '#5A6B85';
}
function inScope(r) {
  return (state.geo === 'Global' || r.geo === state.geo) &&
         (state.provider === 'all' || r._p.id === state.provider);
}
function visibleRegions() { return state.regions.filter(inScope); }
function visiblePipeline() { return state.pipeline.filter(inScope); }
function srcOf(id) { return state.sources[id] || null; }

function tierChip(srcId) {
  const s = srcOf(srcId);
  if (!s) return '<span class="chip chip-neutral">no source</span>';
  const cls = s.tier === 'A' ? 'chip-a' : s.tier === 'B' ? 'chip-b' : 'chip-c';
  const txt = s.tier === 'A' ? 'Verified' : s.tier === 'B' ? 'Estimate' : 'Unverified';
  return `<span class="chip ${cls}">${txt}</span>`;
}

function srcLine(srcId) {
  const s = srcOf(srcId);
  if (!s) return '';
  const link = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`
                     : `<span style="color:var(--text-muted)">${esc(s.title)}</span>`;
  return `<div class="field-src">${tierChip(srcId)} ${link}</div>`;
}

/* ── stats ─────────────────────────────────────────────────── */

function renderStats() {
  const rs = visibleRegions();
  const azSum = rs.reduce((a, r) => a + r.azs, 0);
  const anyFloor = rs.some(r => r.azs_basis === 'minimum');
  const countries = new Set(rs.map(r => r.country)).size;
  const withZones = rs.filter(r => r.azs > 0).length;
  const restricted = rs.filter(r => r.access !== 'general').length;
  const scope = state.geo === 'Global' ? 'worldwide' : state.geo;

  const cards = [
    { val: rs.length, label: 'Regions live', note: scope },
    { val: (anyFloor ? '≥ ' : '') + azSum, label: 'Availability zones',
      note: anyFloor ? 'a floor — Azure counts are not published' : 'exact per-region counts' },
    { val: withZones + '/' + rs.length, label: 'Zone-enabled', note: 'regions offering zones' },
    { val: countries, label: 'Countries', note: 'distinct' },
    { val: restricted, label: 'Gated regions', note: 'opt-in or restricted' }
  ];

  $('stats').innerHTML = cards.map(c => `
    <div class="stat">
      <div class="stat-val">${esc(c.val)}</div>
      <div class="stat-label">${esc(c.label)}</div>
      <div class="stat-note">${esc(c.note)}</div>
    </div>`).join('');
}

/* ── controls ──────────────────────────────────────────────── */

function renderControls() {
  const provs = [['all', 'All providers']].concat(state.providers.map(p => [p.id, p.name]));
  $('seg-provider').innerHTML = provs.map(([id, label]) =>
    `<button data-provider="${esc(id)}" aria-pressed="${id === state.provider}">${esc(label)}</button>`).join('');
  $('seg-geo').innerHTML = GEOS.map(g =>
    `<button data-geo="${esc(g)}" aria-pressed="${g === state.geo}">${esc(g)}</button>`).join('');
  $('seg-color').innerHTML = Object.entries(COLOR_MODES).map(([k, m]) =>
    `<button data-color="${k}" aria-pressed="${k === state.colorBy}">${esc(m.label)}</button>`).join('');

  const reselect = () => {
    if (state.selected && !visibleRegions().concat(visiblePipeline()).some(r => r.uid === state.selected)) state.selected = null;
  };
  $('seg-provider').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    state.provider = b.dataset.provider; reselect(); renderAll();
  };
  $('seg-geo').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    state.geo = b.dataset.geo; reselect(); renderAll();
  };
  $('seg-color').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    state.colorBy = b.dataset.color; renderAll();
  };
}

/* ── map ───────────────────────────────────────────────────── */

/* Several regions share a city — Azure runs two in Virginia and two in Canberra, and
 * Microsoft publishes no location at all for China. Rather than falsify the data to
 * separate them, coincident points are fanned out at draw time only. */
function deOverlap(items, projection) {
  const buckets = new Map();
  items.forEach(d => {
    const p = projection(d.coords);
    const k = Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push({ d, p });
  });
  const out = new Map();
  buckets.forEach(group => {
    if (group.length === 1) { out.set(group[0].d.uid, group[0].p); return; }
    const spread = 6 + group.length;
    group.forEach((g, i) => {
      const a = (i / group.length) * Math.PI * 2 - Math.PI / 2;
      out.set(g.d.uid, [g.p[0] + Math.cos(a) * spread, g.p[1] + Math.sin(a) * spread]);
    });
  });
  return out;
}

function renderMap() {
  const W = 1320, H = 620;
  const svg = d3.select('#map').attr('viewBox', `0 0 ${W} ${H}`);
  svg.selectAll('*').remove();

  const regions = visibleRegions();
  const pipeline = visiblePipeline();
  const land = topojson.feature(state.world, state.world.objects.countries);

  let projection;
  if (state.geo === 'Global') {
    projection = d3.geoNaturalEarth1().fitExtent([[12, 18], [W - 12, H - 18]], { type: 'Sphere' });
  } else {
    const pts = { type: 'MultiPoint', coordinates: regions.concat(pipeline).map(r => r.coords) };
    const MAX_SCALE = 900;
    projection = d3.geoMercator().fitExtent([[70, 60], [W - 70, H - 60]], pts);
    // Cap the zoom so a geography with two clustered regions does not fill the frame.
    // fitExtent sets scale AND a matching translate, so capping the scale alone leaves
    // the projection inconsistent and throws every point off-canvas — recentre explicitly.
    if (projection.scale() > MAX_SCALE) {
      projection.scale(MAX_SCALE)
                .center(d3.geoCentroid(pts))
                .translate([W / 2, H / 2]);
    }
  }
  const path = d3.geoPath(projection);

  svg.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
  svg.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));
  svg.append('g').selectAll('path').data(land.features).join('path').attr('class', 'land').attr('d', path);

  const pos = deOverlap(regions.concat(pipeline), projection);
  const rScale = d3.scaleSqrt().domain([0, 6]).range([3.5, 11.5]).clamp(true);
  const sizeOf = d => rScale(d.azs_planned != null ? d.azs_planned : Math.max(d.azs, 1.4));
  const showLabels = state.geo !== 'Global';

  const draw = (sel, items, isPipe) => sel.selectAll('g').data(items, d => d.uid).join('g')
    .attr('class', d => 'node' + (isPipe ? ' is-pipeline' : '') + (state.selected === d.uid ? ' is-sel' : '') +
      (state.selected && state.selected !== d.uid ? ' is-dim' : ''))
    .attr('transform', d => { const p = pos.get(d.uid); return `translate(${p[0]},${p[1]})`; })
    .style('color', d => isPipe ? '#9BE0F5' : colorOf(d))
    .on('click', (e, d) => { state.selected = state.selected === d.uid ? null : d.uid; renderAll(); })
    .call(g => {
      g.append('title').text(d => isPipe
        ? `${d.name} — announced`
        : `${d.name} (${d.id}) · ${d._p.short} · ${d.azs > 0 ? azLabel(d) + ' zones' : 'no zones'}`);
      g.append('circle').attr('class', 'node-halo').attr('r', d => sizeOf(d) * 2.1);
      g.filter(d => d.coords_precision !== 'facility')
        .append('circle')
        .attr('class', d => 'node-precision is-' + (d.coords_precision || 'metro-centroid'))
        .attr('r', d => sizeOf(d) * (d.coords_precision === 'campus' ? 1.7 : 2.6));
      g.append('circle')
        .attr('class', d => 'node-dot' + (!isPipe && d.azs === 0 ? ' is-hollow' : ''))
        .attr('r', sizeOf);
      g.filter(d => d.coords_precision === 'facility').append('path')
        .attr('class', 'node-cross')
        .attr('d', d => { const r = sizeOf(d) * 2.2; return `M${-r},0H${r}M0,${-r}V${r}`; });
      if (showLabels) {
        g.append('text').attr('class', 'node-label')
          .attr('x', d => sizeOf(d) + 4).attr('dy', '0.34em')
          .text(d => isPipe ? d.name + ' (planned)' : d.id);
      }
    });

  draw(svg.append('g'), pipeline, true);
  draw(svg.append('g'), regions, false);

  const provNames = (state.provider === 'all' ? state.providers : state.providers.filter(p => p.id === state.provider))
    .map(p => p.name).join(' · ');
  $('map-caption').innerHTML = `${esc(provNames)}<br>bubble size = availability zones · hollow = no zones`;

  renderLegend();
}

function renderLegend() {
  const m = mode();
  const rs = visibleRegions();
  let rows;
  if (m.entries) {
    const present = new Set(rs.map(m.key));
    rows = m.entries().filter(([id]) => present.has(id))
      .map(([, name, color]) => `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span>${esc(name)}</div>`).join('');
  } else {
    const present = new Set(rs.map(m.key));
    rows = Object.keys(m.scale).filter(k => present.has(k))
      .map(k => `<div class="legend-row"><span class="legend-swatch" style="background:${m.scale[k]}"></span>${esc(m.names[k] || k)}</div>`).join('');
  }

  const precPresent = new Set(rs.map(r => r.coords_precision || 'metro-centroid'));
  const precRows = Object.keys(PRECISION).filter(k => precPresent.has(k)).map(k =>
    `<div class="legend-row"><span class="legend-prec is-${k}"></span>${esc(PRECISION[k].label)}</div>`).join('');

  $('legend').innerHTML =
    `<h4>${esc(m.label)}</h4>${rows}` +
    `<div class="legend-prec-block"><h4>Location precision</h4>${precRows}</div>` +
    `<div style="margin-top:8px;font-size:.66rem;opacity:.6;line-height:1.4">${esc(m.legend)}</div>`;
}

/* ── detail ────────────────────────────────────────────────── */

function renderDetail() {
  const el = $('detail');
  if (!state.selected) {
    el.className = 'detail is-empty';
    el.textContent = 'Select a region on the map or in the table to inspect its record and provenance.';
    return;
  }
  const r = state.regions.concat(state.pipeline).find(x => x.uid === state.selected);
  if (!r) { state.selected = null; return renderDetail(); }
  el.className = 'detail';

  const isPipe = r.azs == null;
  const zoneVal = isPipe ? null
    : r.azs_basis === 'preview' ? 'In preview'
    : r.azs === 0 ? 'None'
    : r.azs_basis === 'minimum' ? `${r.azs} or more` : String(r.azs);

  const fields = isPipe ? [
    { label: 'Status',      val: 'Announced, not yet live', src: r.src },
    { label: 'AZs planned', val: r.azs_planned,             src: r.src },
    { label: 'Target date', val: r.target,                  src: r.src }
  ] : [
    { label: 'Availability zones', val: zoneVal, src: r.azs_src,
      hint: r.azs_basis === 'minimum' ? 'Microsoft publishes zone support, not zone counts. Three is the documented minimum.'
          : r.azs_basis === 'exact' ? 'Exact count, published per region.' : null },
    { label: 'Launched',     val: r.launched, src: r.launched_src, missing: 'not published' },
    { label: 'Partition',    val: PARTITIONS[r.partition] || r.partition, src: r.azs_src },
    { label: 'Access',       val: ACCESS[r.access] || r.access, src: r.access_src },
    { label: 'Paired with',  val: r.paired_with_raw, src: r.paired_src, missing: 'no pair' },
    { label: 'Capacity (MW)', val: r.capacity_mw, src: null },
    { label: 'Coordinate precision', val: PRECISION[r.coords_precision] && PRECISION[r.coords_precision].label, src: r.coords_src },
    { label: 'Low CO₂', val: r.low_co2 === 'not published' ? null : (r.low_co2 === 'yes' ? 'Yes' : 'No'),
      src: r.low_co2_src, missing: 'not published by this provider' },
    { label: 'Grid market',      val: r.grid && r.grid.market, src: r.grid && r.grid.src },
    { label: 'Constraint index', val: r.grid && r.grid.constraint_index, src: r.grid && r.grid.src },
    { label: 'Buyer leverage',   val: r.grid && r.grid.leverage, src: r.grid && r.grid.src }
  ];

  const fieldHtml = fields.map(f => {
    const empty = f.val === null || f.val === undefined || f.val === '';
    return `<div class="field" ${empty ? '' : `style="border-left-color:${colorOf(r)}"`}>
      <div class="field-label">${esc(f.label)}</div>
      <div class="field-val${empty ? ' muted' : ''}">${empty ? esc(f.missing || 'not yet collected') : esc(f.val)}</div>
      ${empty ? '' : srcLine(f.src)}
      ${!empty && f.hint ? `<div class="field-hint">${esc(f.hint)}</div>` : ''}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-title"><span class="dot-inline" style="background:${colorOf(r)}"></span>${esc(r.name)}</div>
        <div class="detail-code">${esc(r.id)} · ${esc(r.metro || r.country)} · ${esc(r.geo)}</div>
      </div>
      <div class="detail-prov" style="color:${r._p.color}">${esc(r._p.name)}</div>
    </div>
    <div class="detail-grid">${fieldHtml}</div>
    ${r.coords_note ? `<div class="detail-note"><strong>Siting:</strong> ${esc(r.coords_note)} — ${esc(r.coords[1])}, ${esc(r.coords[0])}</div>` : ''}
    ${r.notes ? `<div class="detail-note">${esc(r.notes)}</div>` : ''}`;
}

/* ── table ─────────────────────────────────────────────────── */

function renderTable() {
  const rs = visibleRegions().slice();
  const col = COLUMNS.find(c => c.key === state.sort.key) || COLUMNS[0];
  rs.sort((a, b) => {
    const va = col.sort(a), vb = col.sort(b);
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return cmp * state.sort.dir;
  });

  $('thead-row').innerHTML = COLUMNS.map(c => {
    const active = c.key === state.sort.key;
    return `<th data-key="${c.key}" ${active ? `aria-sort="${state.sort.dir === 1 ? 'ascending' : 'descending'}"` : ''}>
      ${esc(c.label)} <span class="arrow">${active ? (state.sort.dir === 1 ? '▲' : '▼') : '◆'}</span></th>`;
  }).join('');

  $('tbody').innerHTML = rs.map(r => `<tr data-uid="${esc(r.uid)}" class="${state.selected === r.uid ? 'is-sel' : ''}">` +
    COLUMNS.map(c => {
      const cls = c.type === 'mono' ? 'mono' : c.type === 'num' ? 'num' : '';
      const sw = c.swatch ? `<span class="dot-inline" style="background:${colorOf(r)}"></span>` : '';
      return `<td class="${cls}">${sw}${esc(c.get(r))}</td>`;
    }).join('') + '</tr>').join('');

  $('table-count').textContent = `${rs.length} region${rs.length === 1 ? '' : 's'} in scope — click a row to inspect`;

  $('thead-row').onclick = e => {
    const th = e.target.closest('th'); if (!th) return;
    const k = th.dataset.key;
    state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir }
                                      : { key: k, dir: (k === 'name' || k === 'id') ? 1 : -1 };
    renderAll();
  };
  $('tbody').onclick = e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    state.selected = state.selected === tr.dataset.uid ? null : tr.dataset.uid;
    renderAll();
  };
}

/* ── data quality ──────────────────────────────────────────── */

function renderDataQuality() {
  const counts = { A: 0, B: 0, C: 0, none: 0 };
  state.regions.forEach(r => {
    [r.azs_src, r.launched_src, r.access_src, r.coords_src, r.paired_src, r.grid && r.grid.src]
      .filter(Boolean).forEach(id => { const s = srcOf(id); counts[s ? s.tier : 'none']++; });
    if (r.capacity_mw === null) counts.none++;
  });
  const total = counts.A + counts.B + counts.C + counts.none;

  const bar = (label, n, color) => `
    <div class="dq-row">
      <span>${esc(label)}</span>
      <div class="dq-bar"><div class="dq-fill" style="width:${total ? (n / total * 100).toFixed(1) : 0}%;background:${color}"></div></div>
      <span style="font-variant-numeric:tabular-nums;color:var(--text-secondary)">${n}</span>
    </div>`;

  const checks = [];
  state.providers.forEach(p => {
    const rs = state.regions.filter(r => r._p.id === p.id);
    const stated = p._totals.regions;
    if (stated && stated.self_counted) {
      // Comparing our own count against our own count would always pass, which would
      // imply a verification that never happened. Say what it actually is instead.
      checks.push({
        ok: null,
        text: `${p.short}: ${rs.length} regions counted from the provider's own tables. There is no published headline region count to reconcile against, so this figure is a transcription, not a cross-check.`
      });
    } else if (stated && stated.value != null) {
      checks.push({
        ok: rs.length === stated.value,
        text: `${p.short}: region count ${rs.length === stated.value ? 'reconciles' : 'does NOT reconcile'} — ${rs.length} records against ${stated.value} stated.`
      });
    }
    const azStated = p._totals.availability_zones;
    const azSum = rs.reduce((a, r) => a + r.azs, 0);
    if (azStated && azStated.value != null) {
      checks.push({
        ok: azSum === azStated.value,
        text: azSum === azStated.value
          ? `${p.short}: AZ count reconciles — ${azSum} against ${azStated.value} stated.`
          : `${p.short}: AZ count is short by ${azStated.value - azSum} — ${azSum} summed against ${azStated.value} stated. The gap sits in the ${rs.filter(r => r.azs_basis !== 'exact').length} regions whose AZ count is not published per region.`
      });
    } else {
      checks.push({
        ok: null,
        text: `${p.short}: no AZ total can be reconciled. Microsoft publishes zone support but not per-region zone counts, so the ${azSum} shown is a floor across ${rs.filter(r => r.azs > 0).length} zone-enabled regions, not a count.`
      });
    }
    // Paired regions that point at a region with no record anywhere in the register.
    const ids = new Set(rs.map(r => r.id));
    const dangling = rs.filter(r => r.paired_with_raw && !r.paired_with);
    if (dangling.length) {
      checks.push({
        ok: false,
        text: `${p.short}: ${dangling.length === 1 ? '1 region pairs' : dangling.length + ' regions pair'} with a region that has no row in the provider's own table — ${dangling.map(d => `${d.name} → ${d.paired_with_raw}`).join('; ')}. Left as found rather than invented.`
      });
    }
  });

  $('dq').innerHTML = `
    <div class="section-head" style="margin-bottom:0">
      <h2>Data quality</h2>
      <span class="sub">every field on this page resolves to a source</span>
    </div>
    <div class="dq-bars">
      ${bar('Verified', counts.A, 'var(--tier-a)')}
      ${bar('Estimate', counts.B, 'var(--tier-b)')}
      ${bar('Unverified', counts.C, 'var(--tier-c)')}
      ${bar('Not collected', counts.none, 'var(--surface-3)')}
    </div>
    ${checks.map(c => `<div class="recon ${c.ok === true ? 'ok' : c.ok === false ? 'warn' : 'info'}">
      <span class="recon-icon">${c.ok === true ? '✓' : c.ok === false ? '!' : 'i'}</span><span>${esc(c.text)}</span></div>`).join('')}`;
}

/* ── sources ───────────────────────────────────────────────── */

function renderSources() {
  $('sources').innerHTML = Object.entries(state.sources).map(([id, s]) => `
    <div class="source-item">
      <div class="source-title">
        ${tierChip(id)}
        ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}
        <span style="color:var(--text-muted);font-weight:400;font-size:.76rem">accessed ${esc(s.accessed)}</span>
      </div>
      <div class="source-note">${esc(s.note)}</div>
    </div>`).join('');

  $('footer').innerHTML =
    `Schema v1.3 · ${esc(state.providers.map(p => p.short + ' as of ' + p._asOf).join(' · '))} · ` +
    `coordinates are metro centroids unless a record says otherwise, never physical facility locations. ` +
    `Capacity in megawatts is deliberately left uncollected until a citable source exists for it.`;
}

/* ── boot ──────────────────────────────────────────────────── */

function renderAll() {
  renderStats();
  renderControls();
  renderMap();
  renderDetail();
  renderTable();
  renderDataQuality();
  renderSources();
}

const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' → ' + r.status); return r.json(); });

getJSON('data/providers.json')
  .then(man => Promise.all([
    Promise.all(man.providers.map(id => getJSON(`data/${id}.json`))),
    getJSON(WORLD_URL)
  ]))
  .then(([files, world]) => {
    state.world = world;
    files.forEach(f => {
      const p = Object.assign({}, f.provider, { _totals: f.totals || {}, _asOf: f.as_of });
      state.providers.push(p);
      Object.assign(state.sources, f.sources);
      (f.regions || []).forEach(r => { r._p = p; r.uid = p.id + ':' + r.id; state.regions.push(r); });
      (f.pipeline || []).forEach(r => { r._p = p; r.uid = p.id + ':' + r.id; state.pipeline.push(r); });
    });
    renderAll();
  })
  .catch(err => {
    document.querySelector('main').innerHTML =
      `<div class="detail"><strong>Could not load.</strong><br>${esc(err.message)}` +
      `<br><br>This page reads JSON over fetch, so it must be served over HTTP.</div>`;
    console.error(err);
  });
