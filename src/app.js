/* Data Center Capacity Map — Proxima
 * Step 1: single provider (AWS), Tier-A structural data, full provenance.
 * Every displayed value resolves back to a source id in the data file.
 */

const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const GEOS = ['Global', 'North America', 'Europe', 'Asia Pacific', 'Middle East', 'South America', 'Africa'];

const COLOR_MODES = {
  partition: {
    label: 'Partition',
    legend: 'Commercial regions are open to any AWS account. The others need a separate account and contract.',
    scale: {
      commercial: '#FF9900',
      govcloud:   '#5B8DEF',
      china:      '#E0557B',
      sovereign:  '#22C3A6'
    },
    names: { commercial: 'Commercial', govcloud: 'GovCloud (US)', china: 'China', sovereign: 'EU Sovereign' },
    key: r => r.partition
  },
  leverage: {
    label: 'Grid leverage',
    legend: 'Buyer leverage on delivery timing, from the Grid-Headroom Map. US markets only so far.',
    scale: { High: '#EF4444', Moderate: '#F59E0B', Some: '#FBBF24', Low: '#10B981', 'Not scored': '#5A6B85' },
    names: { High: 'High', Moderate: 'Moderate', Some: 'Some', Low: 'Low', 'Not scored': 'Not scored' },
    key: r => (r.grid && r.grid.leverage) || 'Not scored'
  },
  era: {
    label: 'Build era',
    legend: 'When the region came online. Newer regions tend to have spare capacity to fill.',
    scale: { '2006–2012': '#2A4A7F', '2013–2018': '#3E7BC4', '2019–2022': '#57B0E8', '2023–2026': '#9BE0F5' },
    names: { '2006–2012': '2006–2012', '2013–2018': '2013–2018', '2019–2022': '2019–2022', '2023–2026': '2023–2026' },
    key: r => r.launched <= 2012 ? '2006–2012' : r.launched <= 2018 ? '2013–2018' : r.launched <= 2022 ? '2019–2022' : '2023–2026'
  }
};

/* How precisely we know where a region physically sits. Shown on the map as a
 * positional-uncertainty ring, so a centroid never reads as a pinpoint. */
const PRECISION = {
  facility:         { label: 'Facility',       blurb: 'Exact published facility location' },
  campus:           { label: 'Campus cluster', blurb: 'Known siting cluster, building unresolved' },
  'metro-centroid': { label: 'Metro centroid', blurb: 'Metro only — position is indicative' }
};

const COLUMNS = [
  { key: 'name',      label: 'Region',    get: r => r.name,                              type: 'text', swatch: true },
  { key: 'id',        label: 'Code',      get: r => r.id,                                type: 'mono' },
  { key: 'geo',       label: 'Geography', get: r => r.geo,                               type: 'text' },
  { key: 'metro',     label: 'Metro',     get: r => r.metro,                             type: 'text' },
  { key: 'azs',       label: 'AZs',       get: r => r.azs,                               type: 'num' },
  { key: 'launched',  label: 'Launched',  get: r => r.launched,                          type: 'num' },
  { key: 'partition', label: 'Partition', get: r => COLOR_MODES.partition.names[r.partition] || r.partition, type: 'text' },
  { key: 'leverage',  label: 'Grid leverage', get: r => (r.grid && r.grid.leverage) || '—', type: 'text' }
];

const state = {
  data: null,
  world: null,
  geo: 'Global',
  colorBy: 'partition',
  selected: null,
  sort: { key: 'azs', dir: -1 }
};

/* ── helpers ───────────────────────────────────────────────── */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function mode() { return COLOR_MODES[state.colorBy]; }
function colorOf(r) { const m = mode(); return m.scale[m.key(r)] || '#5A6B85'; }
function visibleRegions() {
  const rs = state.data.regions;
  return state.geo === 'Global' ? rs : rs.filter(r => r.geo === state.geo);
}
function visiblePipeline() {
  const ps = state.data.pipeline || [];
  return state.geo === 'Global' ? ps : ps.filter(p => p.geo === state.geo);
}
function srcOf(id) { return state.data.sources[id] || null; }

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
  const link = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : `<span style="color:var(--text-muted)">${esc(s.title)}</span>`;
  return `<div class="field-src">${tierChip(srcId)} ${link}</div>`;
}

/* ── stats ─────────────────────────────────────────────────── */

function renderStats() {
  const d = state.data;
  const rs = visibleRegions();
  const azs = rs.reduce((a, r) => a + r.azs, 0);
  const countries = new Set(rs.map(r => r.country)).size;
  const pipe = visiblePipeline().length;
  const scope = state.geo === 'Global' ? 'worldwide' : state.geo;

  const cards = [
    { val: rs.length,  label: 'Regions live',       note: scope },
    { val: azs,        label: 'Availability zones', note: 'sum of per-region counts' },
    { val: countries,  label: 'Countries',          note: 'distinct' },
    { val: pipe,       label: 'Announced',          note: pipe ? 'not yet live' : 'none in scope' },
    { val: d.provider.short, label: 'Provider',     note: 'more to follow' }
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
  $('seg-geo').innerHTML = GEOS.map(g =>
    `<button data-geo="${esc(g)}" aria-pressed="${g === state.geo}">${esc(g)}</button>`).join('');
  $('seg-color').innerHTML = Object.entries(COLOR_MODES).map(([k, m]) =>
    `<button data-color="${k}" aria-pressed="${k === state.colorBy}">${esc(m.label)}</button>`).join('');

  $('seg-geo').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    state.geo = b.dataset.geo;
    if (state.selected && !visibleRegions().some(r => r.id === state.selected)) state.selected = null;
    renderAll();
  };
  $('seg-color').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    state.colorBy = b.dataset.color;
    renderAll();
  };
}

/* ── map ───────────────────────────────────────────────────── */

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
    projection = d3.geoMercator().fitExtent([[70, 60], [W - 70, H - 60]], pts);
    // Never zoom in so far that a single-region geography fills the frame.
    projection.scale(Math.min(projection.scale(), 900));
  }
  const path = d3.geoPath(projection);

  svg.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
  svg.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));
  svg.append('g').selectAll('path').data(land.features).join('path').attr('class', 'land').attr('d', path);

  const rScale = d3.scaleSqrt().domain([1, 6]).range([4.5, 11.5]).clamp(true);
  const showLabels = state.geo !== 'Global';

  const draw = (sel, items, isPipe) => sel.selectAll('g').data(items, d => d.id).join('g')
    .attr('class', d => 'node' + (isPipe ? ' is-pipeline' : '') + (state.selected === d.id ? ' is-sel' : '') +
      (state.selected && state.selected !== d.id ? ' is-dim' : ''))
    .attr('transform', d => { const p = projection(d.coords); return `translate(${p[0]},${p[1]})`; })
    .style('color', d => isPipe ? '#9BE0F5' : colorOf(d))
    .on('click', (e, d) => { state.selected = state.selected === d.id ? null : d.id; renderAll(); })
    .call(g => {
      g.append('title').text(d => isPipe
        ? `${d.name} — announced, ${d.azs_planned} AZs planned`
        : `${d.name} (${d.id}) — ${d.azs} AZ${d.azs > 1 ? 's' : ''}, live ${d.launched}`);
      g.append('circle').attr('class', 'node-halo').attr('r', d => rScale(isPipe ? d.azs_planned : d.azs) * 2.1);
      // Positional-uncertainty ring: the looser the coordinate, the wider and softer the ring.
      g.filter(d => d.coords_precision !== 'facility')
        .append('circle')
        .attr('class', d => 'node-precision is-' + (d.coords_precision || 'metro-centroid'))
        .attr('r', d => rScale(isPipe ? d.azs_planned : d.azs) * (d.coords_precision === 'campus' ? 1.7 : 2.6));
      g.append('circle').attr('class', 'node-dot').attr('r', d => rScale(isPipe ? d.azs_planned : d.azs));
      // Facility-precision markers get a crosshair so exact siting reads as exact.
      g.filter(d => d.coords_precision === 'facility').append('path')
        .attr('class', 'node-cross')
        .attr('d', d => { const r = rScale(isPipe ? d.azs_planned : d.azs) * 2.2; return `M${-r},0H${r}M0,${-r}V${r}`; });
      if (showLabels) {
        g.append('text').attr('class', 'node-label')
          .attr('x', d => rScale(isPipe ? d.azs_planned : d.azs) + 4).attr('dy', '0.34em')
          .text(d => isPipe ? d.name + ' (planned)' : d.id);
      }
    });

  draw(svg.append('g'), pipeline, true);
  draw(svg.append('g'), regions, false);

  $('map-caption').innerHTML =
    `${esc(state.data.provider.name)} &middot; as of ${esc(state.data.as_of)}<br>` +
    `bubble size = availability zones`;

  renderLegend();
}

function renderLegend() {
  const m = mode();
  const present = new Set(visibleRegions().map(m.key));
  const rows = Object.keys(m.scale)
    .filter(k => present.has(k))
    .map(k => `<div class="legend-row"><span class="legend-swatch" style="background:${m.scale[k]}"></span>${esc(m.names[k] || k)}</div>`)
    .join('');

  const pipeRow = visiblePipeline().length
    ? `<div class="legend-row"><span class="legend-swatch" style="background:transparent;border:1.5px dashed #9BE0F5"></span>Announced, not live</div>`
    : '';

  const sizes = [1, 3, 6].map(n => {
    const r = d3.scaleSqrt().domain([1, 6]).range([4.5, 11.5]).clamp(true)(n) * 2;
    return `<div class="legend-size"><div class="ring" style="width:${r}px;height:${r}px"></div>${n}</div>`;
  }).join('');

  const precPresent = new Set(visibleRegions().map(r => r.coords_precision || 'metro-centroid'));
  const precRows = Object.keys(PRECISION).filter(k => precPresent.has(k)).map(k =>
    `<div class="legend-row"><span class="legend-prec is-${k}"></span>${esc(PRECISION[k].label)}</div>`).join('');

  $('legend').innerHTML =
    `<h4>${esc(m.label)}</h4>${rows}${pipeRow}` +
    `<div class="legend-sizes">${sizes}<div style="font-size:.68rem;opacity:.65;padding-bottom:2px">AZs</div></div>` +
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
  const r = state.data.regions.find(x => x.id === state.selected)
         || (state.data.pipeline || []).find(x => x.id === state.selected);
  if (!r) { state.selected = null; return renderDetail(); }
  el.className = 'detail';

  const isPipe = !r.azs;
  const fields = isPipe ? [
    { label: 'Status',        val: 'Announced, not yet live', src: r.src },
    { label: 'AZs planned',   val: r.azs_planned,             src: r.src },
    { label: 'Target date',   val: r.target,                  src: r.src },
    { label: 'Investment',    val: r.investment_usd,          src: null }
  ] : [
    { label: 'Availability zones', val: r.azs,       src: r.azs_src },
    { label: 'Launched',           val: r.launched,  src: r.launched_src },
    { label: 'Partition',          val: COLOR_MODES.partition.names[r.partition] || r.partition, src: 'aws-regions-doc' },
    { label: 'Opt-in required',    val: r.opt_in ? 'Yes' : 'No', src: 'aws-regions-doc' },
    { label: 'Capacity (MW)',      val: r.capacity_mw, src: null },
    { label: 'Coordinate precision', val: PRECISION[r.coords_precision] && PRECISION[r.coords_precision].label, src: r.coords_src },
    { label: 'Grid market',        val: r.grid && r.grid.market, src: r.grid && r.grid.src },
    { label: 'Constraint index',   val: r.grid && r.grid.constraint_index, src: r.grid && r.grid.src },
    { label: 'Buyer leverage',     val: r.grid && r.grid.leverage, src: r.grid && r.grid.src }
  ];

  const fieldHtml = fields.map(f => {
    const empty = f.val === null || f.val === undefined || f.val === '';
    return `<div class="field" ${empty ? '' : `style="border-left-color:${colorOf(r)}"`}>
      <div class="field-label">${esc(f.label)}</div>
      <div class="field-val${empty ? ' muted' : ''}">${empty ? 'not yet collected' : esc(f.val)}</div>
      ${empty ? '' : srcLine(f.src)}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-title"><span class="dot-inline" style="background:${isPipe ? '#9BE0F5' : colorOf(r)}"></span>${esc(r.name)}</div>
        <div class="detail-code">${esc(r.id)} &middot; ${esc(r.metro || r.country)} &middot; ${esc(r.geo)}</div>
      </div>
      <div>${esc(state.data.provider.short)}</div>
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
    const va = col.get(a), vb = col.get(b);
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return cmp * state.sort.dir;
  });

  $('thead-row').innerHTML = COLUMNS.map(c => {
    const active = c.key === state.sort.key;
    return `<th data-key="${c.key}" ${active ? `aria-sort="${state.sort.dir === 1 ? 'ascending' : 'descending'}"` : ''}>
      ${esc(c.label)} <span class="arrow">${active ? (state.sort.dir === 1 ? '▲' : '▼') : '◆'}</span></th>`;
  }).join('');

  $('tbody').innerHTML = rs.map(r => `<tr data-id="${esc(r.id)}" class="${state.selected === r.id ? 'is-sel' : ''}">` +
    COLUMNS.map(c => {
      const cls = c.type === 'mono' ? 'mono' : c.type === 'num' ? 'num' : '';
      const sw = c.swatch ? `<span class="dot-inline" style="background:${colorOf(r)}"></span>` : '';
      return `<td class="${cls}">${sw}${esc(c.get(r))}</td>`;
    }).join('') + '</tr>').join('');

  $('table-count').textContent =
    `${rs.length} region${rs.length === 1 ? '' : 's'}` + (state.geo === 'Global' ? '' : ` in ${state.geo}`) + ' — click a row to inspect';

  $('thead-row').onclick = e => {
    const th = e.target.closest('th'); if (!th) return;
    const k = th.dataset.key;
    state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === 'name' || k === 'id' ? 1 : -1 };
    renderAll();
  };
  $('tbody').onclick = e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    state.selected = state.selected === tr.dataset.id ? null : tr.dataset.id;
    renderAll();
  };
}

/* ── data quality ──────────────────────────────────────────── */

function renderDataQuality() {
  const d = state.data;
  const counts = { A: 0, B: 0, C: 0, none: 0 };
  d.regions.forEach(r => {
    const ids = [r.azs_src, r.launched_src, r.grid && r.grid.src].filter(Boolean);
    ids.forEach(id => { const s = srcOf(id); counts[s ? s.tier : 'none']++; });
    if (r.capacity_mw === null) counts.none++;
  });
  const total = counts.A + counts.B + counts.C + counts.none;

  const bar = (label, n, color) => `
    <div class="dq-row">
      <span>${esc(label)}</span>
      <div class="dq-bar"><div class="dq-fill" style="width:${total ? (n / total * 100).toFixed(1) : 0}%;background:${color}"></div></div>
      <span style="font-variant-numeric:tabular-nums;color:var(--text-secondary)">${n}</span>
    </div>`;

  const azSum = d.regions.reduce((a, r) => a + r.azs, 0);
  const azStated = d.totals.availability_zones.value;
  const regStated = d.totals.regions.value;

  const checks = [
    {
      ok: d.regions.length === regStated,
      text: d.regions.length === regStated
        ? `Region count reconciles: ${d.regions.length} records against ${regStated} stated by AWS.`
        : `Region count does not reconcile: ${d.regions.length} records against ${regStated} stated by AWS.`
    },
    {
      ok: azSum === azStated,
      text: azSum === azStated
        ? `AZ count reconciles: ${azSum} against ${azStated} stated by AWS.`
        : `AZ count is short by ${azStated - azSum}: ${azSum} summed against ${azStated} stated by AWS. The gap sits in the ${d.regions.filter(r => r.azs_src === 'kb-unverified').length} regions whose AZ count is still unverified (GovCloud, China, EU Sovereign) — AWS does not publish per-region AZ counts for those partitions on the same page.`
    }
  ];

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
    ${checks.map(c => `<div class="recon ${c.ok ? 'ok' : 'warn'}">
      <span class="recon-icon">${c.ok ? '✓' : '!'}</span><span>${esc(c.text)}</span></div>`).join('')}`;
}

/* ── sources ───────────────────────────────────────────────── */

function renderSources() {
  $('sources').innerHTML = Object.entries(state.data.sources).map(([id, s]) => `
    <div class="source-item">
      <div class="source-title">
        ${tierChip(id)}
        ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}
        <span style="color:var(--text-muted);font-weight:400;font-size:.76rem">accessed ${esc(s.accessed)}</span>
      </div>
      <div class="source-note">${esc(s.note)}</div>
    </div>`).join('');

  $('footer').innerHTML =
    `Schema v${esc(state.data.schema_version)} &middot; data as of ${esc(state.data.as_of)} &middot; ` +
    `coordinates are metro centroids, not physical facility locations. ` +
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

Promise.all([
  fetch('data/aws.json').then(r => { if (!r.ok) throw new Error('aws.json ' + r.status); return r.json(); }),
  fetch(WORLD_URL).then(r => { if (!r.ok) throw new Error('world atlas ' + r.status); return r.json(); })
]).then(([data, world]) => {
  state.data = data;
  state.world = world;
  renderAll();
}).catch(err => {
  document.querySelector('main').innerHTML =
    `<div class="detail"><strong>Could not load.</strong><br>${esc(err.message)}` +
    `<br><br>This page reads <code>data/aws.json</code> over fetch, so it needs to be served over HTTP — opening the file directly will not work.</div>`;
  console.error(err);
});
