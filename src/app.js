/* Data Center Capacity Map — Proxima
 * Multi-provider. Every displayed value resolves to a source id carrying a tier.
 *
 * Providers do not describe themselves the same way, and the map refuses to pretend
 * otherwise. Hyperscalers publish REGIONS and zones — AWS exact counts, Azure only a
 * documented floor. Neoclouds publish SITES and megawatts, at different power stages
 * (contracted / connected / active) and on different bases (IT load vs gross vs
 * generation). Regions and sites are drawn, counted and reconciled separately, and no
 * total is ever summed across bases without saying so.
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
  zones:   { label: 'Multi-zone (2+)',       color: '#34D399' },
  single:  { label: 'Single zone / one AD',  color: '#FB923C' },
  preview: { label: 'Zones in preview',      color: '#FBBF24' },
  none:    { label: 'No zones',              color: '#64748B' }
};

const PRECISION = {
  facility:          { label: 'Facility',       blurb: 'Exact published facility location' },
  campus:            { label: 'Campus / town',  blurb: 'Named locality, building unresolved' },
  'metro-centroid':  { label: 'Metro centroid', blurb: 'Metro only — position is indicative' },
  'region-centroid': { label: 'State / county', blurb: 'Only a state or county is published' }
};

/* Site status is the latest state the provider has DISCLOSED — never inferred from dates. */
const STATUS = {
  operational:          'Operational',
  partial:              'Partly live',
  'under-construction': 'Under construction',
  contracted:           'Contracted',
  announced:            'Announced',
  listed:               'Listed, state not given',
  paused:               'Paused'
};

const DELIVERY = {
  'self-built':    'Self-built',
  leased:          'Leased',
  'build-to-suit': 'Build-to-suit',
  colocation:      'Colocation',
  'joint-venture': 'Joint venture'
};

/* Power stages, after Nebius's own definitions. Live = power delivered into the site. */
const LIVE_STAGES = ['active', 'connected'];
// Committed pipeline excludes 'potential': a full-build ceiling is an aspiration, and summing
// ceilings next to contracts turns one 8 GW press-release number into the headline.
const PIPE_STAGES = ['contracted', 'planned', 'stated'];
const POTENTIAL_STAGES = ['potential'];
const STAGE_LABEL = { active: 'active', connected: 'connected', contracted: 'contracted',
                      planned: 'planned', potential: 'full-build potential', stated: 'stated, stage not given' };

function largest(site, stages) {
  const xs = (site.power || []).filter(p => stages.includes(p.stage) && p.mw != null);
  return xs.length ? xs.reduce((a, b) => (b.mw > a.mw ? b : a)) : null;
}
const liveOf = s => largest(s, LIVE_STAGES);
const pipeOf = s => largest(s, PIPE_STAGES);
const potOf  = s => largest(s, POTENTIAL_STAGES);

function zoneState(r) {
  if (r.azs_basis === 'preview') return 'preview';
  // Oracle calls them availability domains; one AD means no in-region zone redundancy.
  return r.azs >= 2 ? 'zones' : r.azs === 1 ? 'single' : 'none';
}

const COLOR_MODES = {
  provider: {
    label: 'Provider', sites: true,
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
    legend: 'In-region zone redundancy. A quarter of Azure regions have no zones; 50 of 55 Oracle regions have a single availability domain.',
    key: zoneState,
    scale: Object.fromEntries(Object.entries(ZONE_STATE).map(([k, v]) => [k, v.color])),
    names: Object.fromEntries(Object.entries(ZONE_STATE).map(([k, v]) => [k, v.label]))
  },
  status: {
    label: 'Site status', sites: true, regionsNA: true,
    legend: 'Latest state each neocloud has disclosed for the site. Hyperscaler regions are all live and are shown muted.',
    key: r => r.status,
    scale: { operational: '#34D399', partial: '#A3E635', 'under-construction': '#FBBF24',
             contracted: '#60A5FA', announced: '#C4B5FD', listed: '#94A3B8', paused: '#F87171' },
    names: STATUS
  },
  carbon: {
    label: 'Low CO₂',
    legend: 'Google flags low-carbon regions per region. AWS and Microsoft publish no equivalent, so theirs read as not published rather than no.',
    key: r => r.low_co2 || 'not published',
    scale: { yes: '#34A853', no: '#94A3B8', 'not published': '#475569' },
    names: { yes: 'Low CO₂ (Google)', no: 'Not low CO₂', 'not published': 'Not published' }
  },
  leverage: {
    label: 'Grid leverage', sites: true,
    legend: 'Buyer leverage on delivery timing, from the Grid-Headroom Map. US markets only.',
    key: r => (r.grid && r.grid.leverage) || 'Not scored',
    scale: { High: '#EF4444', Moderate: '#F59E0B', Some: '#FBBF24', Low: '#10B981', 'Not scored': '#5A6B85' },
    names: { High: 'High', Moderate: 'Moderate', Some: 'Some', Low: 'Low', 'Not scored': 'Not scored' }
  }
};

const NA_COLOR = '#3B4A63';   // a mode that does not apply to this kind of record

function azLabel(r) {
  if (r.azs_basis === 'preview') return 'preview';
  if (r.azs === 0) return '—';
  return r.azs_basis === 'minimum' ? r.azs + '+' : String(r.azs);
}
const statusText = s => s.status === 'listed' && s.broke_ground ? `Broke ground ${s.broke_ground.year}` : (STATUS[s.status] || s.status);
const fmtMW = p => p ? `${p.mw.toLocaleString()} MW${p.basis === 'IT' ? ' IT' : ''}` : '—';

const REGION_COLUMNS = [
  { key: 'name',     label: 'Region',        get: r => r.name,     sort: r => r.name,     type: 'text', swatch: true },
  { key: 'provider', label: 'Provider',      get: r => r._p.short, sort: r => r._p.short, type: 'text' },
  { key: 'id',       label: 'Code',          get: r => r.id,       sort: r => r.id,       type: 'mono' },
  { key: 'geo',      label: 'Geography',     get: r => r.geo,      sort: r => r.geo,      type: 'text' },
  { key: 'metro',    label: 'Location',      get: r => r.metro || '—', sort: r => r.metro || '', type: 'text' },
  { key: 'azs',      label: 'Zones',         get: azLabel,         sort: r => r.azs,      type: 'num' },
  { key: 'access',   label: 'Access',        get: r => ACCESS[r.access] || r.access, sort: r => r.access, type: 'text' },
  { key: 'paired',   label: 'Paired with',   get: r => r.paired_with_raw || '—', sort: r => r.paired_with_raw || '', type: 'text' },
  { key: 'leverage', label: 'Grid leverage', get: r => (r.grid && r.grid.leverage) || '—', sort: r => (r.grid && r.grid.constraint_index) || 0, type: 'text' }
];

const SITE_COLUMNS = [
  { key: 'name',     label: 'Site',          get: s => s.name,     sort: s => s.name,     type: 'text', swatch: true },
  { key: 'provider', label: 'Operator',      get: s => s._p.short, sort: s => s._p.short, type: 'text' },
  { key: 'metro',    label: 'Location',      get: s => s.metro,    sort: s => s.metro,    type: 'text' },
  { key: 'status',   label: 'Status',        get: s => statusText(s), sort: s => s.status, type: 'text' },
  { key: 'live',     label: 'Live MW',       get: s => fmtMW(liveOf(s)), sort: s => (liveOf(s) || {}).mw || 0, type: 'num' },
  { key: 'pipe',     label: 'Committed pipeline', get: s => fmtMW(pipeOf(s)), sort: s => (pipeOf(s) || {}).mw || 0, type: 'num' },
  { key: 'pot',      label: 'Full-build ceiling', get: s => fmtMW(potOf(s)), sort: s => (potOf(s) || {}).mw || 0, type: 'num' },
  { key: 'host',     label: 'Delivery',      get: s => [DELIVERY[s.delivery], s.host].filter(Boolean).join(' · ') || '—', sort: s => s.delivery || '', type: 'text' },
  { key: 'invest',   label: 'Investment',    get: s => (s.investment && s.investment.text) || '—', sort: s => (s.investment && s.investment.currency === 'USD' ? s.investment.amount_bn : 0), type: 'num' },
  { key: 'anchor',   label: 'Anchor customer', get: s => (s.anchor && s.anchor.name) || '—', sort: s => (s.anchor && s.anchor.name) || '', type: 'text' },
  { key: 'leverage', label: 'Grid leverage', get: s => (s.grid && s.grid.leverage) || '—', sort: s => (s.grid && s.grid.constraint_index) || 0, type: 'text' }
];

const state = {
  providers: [],
  regions: [],
  sites: [],
  pipeline: [],
  sources: {},
  collisions: [],
  world: null,
  geo: 'Global',
  provider: 'all',          // 'all' | 'hyperscaler' | 'neocloud' | a provider id
  colorBy: 'provider',
  selected: null,
  sort: { key: 'azs', dir: -1 },
  siteSort: { key: 'live', dir: -1 }
};

/* ── helpers ───────────────────────────────────────────────── */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function mode() { return COLOR_MODES[state.colorBy]; }
function colorOf(r) {
  const m = mode();
  if (r._kind === 'site' && !m.sites) return NA_COLOR;
  if (r._kind !== 'site' && m.regionsNA) return NA_COLOR;
  if (m.colorFor) return m.colorFor(r);
  return m.scale[m.key(r)] || '#5A6B85';
}
function inScope(r) {
  const provOk = state.provider === 'all' || r._p.id === state.provider || r._p.type === state.provider;
  return provOk && (state.geo === 'Global' || r.geo === state.geo);
}
const visibleRegions  = () => state.regions.filter(inScope);
const visibleSites    = () => state.sites.filter(inScope);
const visiblePipeline = () => state.pipeline.filter(inScope);
const allVisible      = () => visibleRegions().concat(visibleSites(), visiblePipeline());
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

/* Sum one figure per site, and say plainly when the figures are on different bases. */
function sumMW(entries) {
  const xs = entries.filter(Boolean);
  const total = xs.reduce((a, p) => a + p.mw, 0);
  const bases = [...new Set(xs.map(p => p.basis))];
  return { total, n: xs.length, bases, mixed: bases.length > 1 };
}

/* ── stats ─────────────────────────────────────────────────── */

function renderStats() {
  const rs = visibleRegions(), ss = visibleSites();
  const scope = state.geo === 'Global' ? 'worldwide' : state.geo;
  const cards = [];

  if (rs.length) {
    const azSum = rs.reduce((a, r) => a + r.azs, 0);
    const anyFloor = rs.some(r => r.azs_basis === 'minimum');
    cards.push(
      { val: rs.length, label: 'Hyperscaler regions', note: scope },
      { val: (anyFloor ? '≥ ' : '') + azSum, label: 'Zones / ADs',
        note: anyFloor ? 'a floor — Azure counts are not published' : 'exact per-region counts' },
      { val: rs.filter(r => r.access !== 'general').length, label: 'Gated regions', note: 'opt-in or restricted' });
  }
  const cap = ss.filter(s => s._p.type === 'captive');
  const build = ss.filter(s => s._p.type !== 'captive');
  if (build.length) {
    const live = sumMW(build.map(liveOf));
    const pipe = sumMW(build.map(pipeOf));
    const anchored = build.filter(s => s.anchor).length;
    cards.push(
      { val: build.length, label: 'AI build sites', note: `neoclouds and Oracle; ${build.filter(s => liveOf(s)).length} with live MW disclosed` },
      { val: (live.mixed ? '≈ ' : '') + live.total.toLocaleString(), label: 'MW live at named sites',
        note: live.mixed ? `mixed bases (${live.bases.join(' / ')}) — indicative` : 'fleet totals are larger — see Data quality' },
      { val: (pipe.mixed ? '≈ ' : '') + pipe.total.toLocaleString(), label: 'MW in named pipeline',
        note: 'contracted or planned; excludes full-build ceilings' },
      { val: anchored, label: 'Pre-sold sites', note: 'anchor customer disclosed' });
  }
  if (cap.length) {
    const usd = cap.filter(s => s.investment && s.investment.currency === 'USD');
    cards.push(
      { val: cap.length, label: 'Captive sites', note: 'built for own use, not sold as cloud' },
      { val: '$' + Math.round(usd.reduce((a, s) => a + s.investment.amount_bn, 0)) + 'bn+', label: 'Stated investment',
        note: `${usd.length} USD-denominated sites; stated minimums; no MW published` });
  }
  if (!cards.length) cards.push({ val: 0, label: 'Nothing in scope', note: 'change the filters' });

  $('stats').innerHTML = cards.map(c => `
    <div class="stat">
      <div class="stat-val">${esc(c.val)}</div>
      <div class="stat-label">${esc(c.label)}</div>
      <div class="stat-note">${esc(c.note)}</div>
    </div>`).join('');
}

/* ── controls ──────────────────────────────────────────────── */

function renderControls() {
  const hyper = state.providers.filter(p => p.type === 'hyperscaler');
  const neo   = state.providers.filter(p => p.type === 'neocloud');
  const captive = state.providers.filter(p => p.type === 'captive');
  const btn = (id, label, cls) =>
    `<button data-provider="${esc(id)}" aria-pressed="${id === state.provider}"${cls ? ` class="${cls}"` : ''}>${esc(label)}</button>`;
  $('seg-provider').innerHTML =
    btn('all', 'All') + btn('hyperscaler', 'Hyperscalers', 'is-group') + btn('neocloud', 'Neoclouds', 'is-group') + btn('captive', 'Captive', 'is-group') +
    hyper.concat(neo, captive).map(p => btn(p.id, p.short)).join('');
  $('seg-geo').innerHTML = GEOS.map(g =>
    `<button data-geo="${esc(g)}" aria-pressed="${g === state.geo}">${esc(g)}</button>`).join('');
  $('seg-color').innerHTML = Object.entries(COLOR_MODES).map(([k, m]) =>
    `<button data-color="${k}" aria-pressed="${k === state.colorBy}">${esc(m.label)}</button>`).join('');

  const reselect = () => {
    if (state.selected && !allVisible().some(r => r.uid === state.selected)) state.selected = null;
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

/* Several records share a point — Azure runs two regions in Virginia, Crusoe runs two
 * campuses in Abilene, Nebius and Nscale both list Keflavík. Rather than falsify the
 * data to separate them, coincident points are fanned out at draw time only. */
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

const RING = { campus: 1.7, 'metro-centroid': 2.6, 'region-centroid': 3.4 };

/* Greedy label placement. Larger points claim label space first; each label tries right,
 * left, above and below its marker, and is only drawn where it overlaps no marker and no
 * label already placed. Labels that fit nowhere are hidden and shown on hover. The
 * selected point always gets its label. Returns the number hidden. */
function placeLabels(svg, pos, radiusOf, W, H, clearLeft = 0) {
  const items = [];
  svg.selectAll('g.node').each(function (d) {
    const t = this.querySelector('.node-label');
    if (!t || !d) return;
    const p = pos.get(d.uid);
    items.push({ d, t, x: p[0], y: p[1], r: radiusOf(d) });
  });
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  // Every marker is an obstacle, not just every label — a name printed across a
  // neighbouring point is as unreadable as two names on top of each other.
  const SW = 1.5;   // marker outline stroke extends past the radius
  const taken = items.map(it => ({ x0: it.x - it.r - SW, y0: it.y - it.r - SW, x1: it.x + it.r + SW, y1: it.y + it.r + SW }));
  if (clearLeft) taken.push({ x0: 0, y0: 0, x1: clearLeft, y1: H });   // the strip under the legend
  // The caption floats over the top-right corner; keep labels out from under it too.
  const cap = $('map-caption'), svgBox = $('map').getBoundingClientRect();
  if (getComputedStyle(cap).position === 'absolute' && svgBox.width) {
    const c = cap.getBoundingClientRect(), k = W / svgBox.width;
    taken.push({ x0: (c.left - svgBox.left) * k - 4, y0: (c.top - svgBox.top) * k - 4,
                 x1: (c.right - svgBox.left) * k + 4, y1: (c.bottom - svgBox.top) * k + 4 });
  }
  const priority = it => (state.selected === it.d.uid ? 1e9 : 0) + it.r * 10 + (it.d._kind === 'region' ? 2 : 0);
  items.sort((a, b) => priority(b) - priority(a));

  const LH = 10, GAP = 3, PAD = 1;
  let hidden = 0;
  items.forEach(it => {
    const w = it.t.getComputedTextLength();
    const { x, y, r } = it;
    const cands = [
      { lx: r + GAP,    ly: 0,              dy: '0.34em', anchor: 'start',  box: [x + r + GAP, y - LH / 2] },
      { lx: -(r + GAP), ly: 0,              dy: '0.34em', anchor: 'end',    box: [x - r - GAP - w, y - LH / 2] },
      { lx: 0,          ly: -(r + GAP + 1), dy: '0',      anchor: 'middle', box: [x - w / 2, y - r - GAP - LH] },
      { lx: 0,          ly: r + GAP + 8,    dy: '0',      anchor: 'middle', box: [x - w / 2, y + r + GAP] }
    ];
    const fits = c => {
      const b = { x0: c.box[0] - PAD, y0: c.box[1] - PAD, x1: c.box[0] + w + PAD, y1: c.box[1] + LH + PAD };
      if (b.x0 < 2 || b.y0 < 2 || b.x1 > W - 2 || b.y1 > H - 2) return null;
      return taken.some(o => hit(b, o)) ? null : b;
    };
    let chosen = null, box = null;
    for (const c of cands) { box = fits(c); if (box) { chosen = c; break; } }
    if (!chosen && state.selected === it.d.uid) chosen = cands[0];   // always label the selection
    if (!chosen) { it.t.classList.add('is-hidden'); hidden++; return; }
    it.t.setAttribute('x', chosen.lx);
    it.t.setAttribute('y', chosen.ly);
    it.t.setAttribute('dy', chosen.dy);
    it.t.setAttribute('text-anchor', chosen.anchor);
    if (box) taken.push(box);
  });
  return hidden;
}

function renderMap() {
  const W = 1320, H = 620;
  const svg = d3.select('#map').attr('viewBox', `0 0 ${W} ${H}`);
  svg.selectAll('*').remove();

  const regions = visibleRegions(), sites = visibleSites(), pipeline = visiblePipeline();
  const everything = regions.concat(sites, pipeline);
  const land = topojson.feature(state.world, state.world.objects.countries);

  // The legend floats over the map's left edge on wide screens. In regional views, fit the
  // points into the space to its right so no marker or label ends up underneath it.
  const legendEl = $('legend'), svgEl = $('map');
  const legendFloats = getComputedStyle(legendEl).position === 'absolute';
  const toSvg = W / (svgEl.getBoundingClientRect().width || W);
  const LEGEND_PX = 16 + 260 + 14;   // left offset + max-width + breathing room, in CSS px
  const reserveLeft = legendFloats ? Math.round(LEGEND_PX * toSvg) : 0;

  let projection, clearLeft = 0;
  if (state.geo === 'Global' || !everything.length) {
    projection = d3.geoNaturalEarth1().fitExtent([[12, 18], [W - 12, H - 18]], { type: 'Sphere' });
  } else {
    clearLeft = reserveLeft;
    const pts = { type: 'MultiPoint', coordinates: everything.map(r => r.coords) };
    const MAX_SCALE = 900;
    const x0 = 70 + clearLeft;
    projection = d3.geoMercator().fitExtent([[x0, 60], [W - 70, H - 60]], pts);
    // fitExtent sets scale AND a matching translate, so capping the scale alone leaves
    // the projection inconsistent and throws every point off-canvas — recentre explicitly.
    if (projection.scale() > MAX_SCALE) {
      projection.scale(MAX_SCALE).center(d3.geoCentroid(pts)).translate([(x0 + W - 70) / 2, H / 2]);
    }
  }
  const path = d3.geoPath(projection);

  svg.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
  svg.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));
  svg.append('g').selectAll('path').data(land.features).join('path').attr('class', 'land').attr('d', path);

  const pos = deOverlap(everything, projection);
  const azScale = d3.scaleSqrt().domain([0, 6]).range([3.5, 11.5]).clamp(true);
  const mwScale = d3.scaleSqrt().domain([0, 2000]).range([4, 17]).clamp(true);
  const sizeOf = d => {
    if (d._kind === 'site') { const p = liveOf(d) || pipeOf(d) || potOf(d); return mwScale(p ? p.mw : 0); }
    return azScale(d.azs_planned != null ? d.azs_planned : Math.max(d.azs, 1.4));
  };
  const showLabels = state.geo !== 'Global';
  const selCls = d => (state.selected === d.uid ? ' is-sel' : '') + (state.selected && state.selected !== d.uid ? ' is-dim' : '');
  const click = (e, d) => { state.selected = state.selected === d.uid ? null : d.uid; renderAll(); };
  const place = d => { const p = pos.get(d.uid); return `translate(${p[0]},${p[1]})`; };
  const precisionRing = g => g.filter(d => d.coords_precision !== 'facility').append('circle')
    .attr('class', d => 'node-precision is-' + (d.coords_precision || 'metro-centroid'))
    .attr('r', d => sizeOf(d) * (RING[d.coords_precision] || 2.6));
  const crosshair = g => g.filter(d => d.coords_precision === 'facility').append('path')
    .attr('class', 'node-cross')
    .attr('d', d => { const r = sizeOf(d) * 2.2; return `M${-r},0H${r}M0,${-r}V${r}`; });

  // Hyperscaler regions and announced regions: circles.
  const drawRegions = (sel, items, isPipe) => sel.selectAll('g').data(items, d => d.uid).join('g')
    .attr('class', d => 'node' + (isPipe ? ' is-pipeline' : '') + selCls(d))
    .attr('transform', place)
    .style('color', d => isPipe ? '#9BE0F5' : colorOf(d))
    .on('click', click)
    .call(g => {
      g.append('title').text(d => isPipe ? `${d.name} — announced`
        : `${d.name} (${d.id}) · ${d._p.short} · ${d.azs > 0 ? azLabel(d) + ' zones' : 'no zones'}`);
      g.append('circle').attr('class', 'node-halo').attr('r', d => sizeOf(d) * 2.1);
      precisionRing(g);
      g.append('circle').attr('class', d => 'node-dot' + (!isPipe && d.azs === 0 ? ' is-hollow' : '')).attr('r', sizeOf);
      crosshair(g);
      if (showLabels) g.append('text').attr('class', 'node-label').attr('x', d => sizeOf(d) + 4).attr('dy', '0.34em')
        .text(d => isPipe ? d.name + ' (planned)' : d.id);
    });

  // Neocloud sites: diamonds sized by MW. Hollow = no live MW disclosed yet.
  const drawSites = sel => sel.selectAll('g').data(sites, d => d.uid).join('g')
    .attr('class', d => 'node is-site' + (d.status === 'paused' ? ' is-paused' : '') + selCls(d))
    .attr('transform', place)
    .style('color', colorOf)
    .on('click', click)
    .call(g => {
      g.append('title').text(d => {
        const l = liveOf(d), p = pipeOf(d) || potOf(d);
        return `${d.name} · ${d._p.short} · ${STATUS[d.status] || d.status}` +
          (l ? ` · ${fmtMW(l)} live` : '') + (p ? ` · ${fmtMW(p)} ${STAGE_LABEL[p.stage]}` : '');
      });
      g.append('circle').attr('class', 'node-halo').attr('r', d => sizeOf(d) * 1.9);
      precisionRing(g);
      g.append('path')
        .attr('class', d => 'site-dot' + (liveOf(d) ? '' : ' is-hollow'))
        .attr('d', d => { const r = sizeOf(d) * 1.25; return `M0,${-r}L${r},0L0,${r}L${-r},0Z`; });
      crosshair(g);
      if (showLabels) g.append('text').attr('class', 'node-label').attr('x', d => sizeOf(d) * 1.25 + 4).attr('dy', '0.34em')
        .text(d => d.name);
    });

  drawRegions(svg.append('g'), pipeline, true);
  drawRegions(svg.append('g'), regions, false);
  drawSites(svg.append('g'));

  // Hovering brings a point (and its label) above its neighbours within its layer.
  svg.selectAll('g.node').on('mouseenter.raise', function () { d3.select(this).raise(); });

  // Caption and legend both float over the map, and placeLabels measures them, so they must
  // hold their final size BEFORE placement. The hidden-count line is reserved up front and
  // its number filled in afterwards, so the caption's height does not change underneath.
  const provNames = state.providers.filter(p => state.provider === 'all' || p.id === state.provider || p.type === state.provider)
    .map(p => p.short).join(' · ');
  const keys = [];
  if (regions.length) keys.push('● region, size = zones, hollow = no zones');
  if (sites.length) keys.push('◆ site, size = disclosed MW, hollow = no live MW');
  $('map-caption').innerHTML = `${esc(provNames)}<br>${esc(keys.join(' · '))}` +
    (showLabels ? `<br><span id="hidden-count">— labels hidden to avoid overlap — hover a point to see its name</span>` : '');
  renderLegend();

  const hidden = showLabels ? placeLabels(svg, pos, d => sizeOf(d) * (d._kind === 'site' ? 1.25 : 1), W, H, clearLeft) : 0;
  if (showLabels) {
    $('hidden-count').textContent = hidden
      ? `${hidden} labels hidden to avoid overlap — hover a point to see its name`
      : 'all labels shown';
  }
}

function renderLegend() {
  const m = mode();
  const recs = visibleRegions().concat(visibleSites());
  const applicable = recs.filter(r => colorOf(r) !== NA_COLOR);
  let rows;
  if (m.entries) {
    const present = new Set(applicable.map(m.key));
    rows = m.entries().filter(([id]) => present.has(id))
      .map(([, name, color]) => `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span>${esc(name)}</div>`).join('');
  } else {
    const present = new Set(applicable.map(m.key));
    rows = Object.keys(m.scale).filter(k => present.has(k))
      .map(k => `<div class="legend-row"><span class="legend-swatch" style="background:${m.scale[k]}"></span>${esc(m.names[k] || k)}</div>`).join('');
  }
  if (applicable.length < recs.length) {
    const what = m.regionsNA ? 'Hyperscaler regions (n/a)' : 'Sites (n/a)';
    rows += `<div class="legend-row"><span class="legend-swatch" style="background:${NA_COLOR}"></span>${esc(what)}</div>`;
  }

  const precPresent = new Set(recs.map(r => r.coords_precision || 'metro-centroid'));
  const precRows = Object.keys(PRECISION).filter(k => precPresent.has(k)).map(k =>
    `<div class="legend-row"><span class="legend-prec is-${k}"></span>${esc(PRECISION[k].label)}</div>`).join('');

  $('legend').innerHTML =
    `<h4>${esc(m.label)}</h4>${rows}` +
    `<div class="legend-prec-block"><h4>Location precision</h4>${precRows}</div>` +
    `<div style="margin-top:8px;font-size:.66rem;opacity:.6;line-height:1.4">${esc(m.legend)}</div>`;
}

/* ── detail ────────────────────────────────────────────────── */

function fieldHtml(fields, r) {
  return fields.map(f => {
    const empty = f.val === null || f.val === undefined || f.val === '';
    return `<div class="field" ${empty ? '' : `style="border-left-color:${colorOf(r) === NA_COLOR ? r._p.color : colorOf(r)}"`}>
      <div class="field-label">${esc(f.label)}</div>
      <div class="field-val${empty ? ' muted' : ''}">${empty ? esc(f.missing || 'not yet collected') : esc(f.val)}</div>
      ${empty ? '' : srcLine(f.src)}
      ${!empty && f.hint ? `<div class="field-hint">${esc(f.hint)}</div>` : ''}
    </div>`;
  }).join('');
}

function renderDetail() {
  const el = $('detail');
  if (!state.selected) {
    el.className = 'detail is-empty';
    el.textContent = 'Select a region or site on the map or in a table to inspect its record and provenance.';
    return;
  }
  const r = state.regions.concat(state.sites, state.pipeline).find(x => x.uid === state.selected);
  if (!r) { state.selected = null; return renderDetail(); }
  el.className = 'detail';

  let fields;
  if (r._kind === 'site') {
    const powerFields = (r.power || []).map(p => ({
      label: `Power — ${STAGE_LABEL[p.stage] || p.stage}`,
      val: `${p.mw.toLocaleString()} MW` + (p.basis !== 'unspecified' ? ` (${p.basis})` : ''),
      src: p.src,
      hint: [p.note, `as of ${p.as_of}`, p.basis === 'unspecified' ? 'basis not stated — IT load or gross unknown' : null]
              .filter(Boolean).join(' · ')
    }));
    if (!powerFields.length) powerFields.push({ label: 'Power', val: null, missing: 'no MW figure published' });
    fields = [
      { label: 'Status', val: STATUS[r.status] || r.status, src: r.status_src, hint: r.online },
      ...powerFields,
      { label: 'Investment', val: r.investment && r.investment.text, src: r.investment && r.investment.src, missing: 'not disclosed',
        hint: r.investment && r.investment.basis },
      { label: 'Broke ground', val: r.broke_ground && r.broke_ground.year, src: r.broke_ground && r.broke_ground.src, missing: 'not disclosed' },
      { label: 'Delivery model', val: DELIVERY[r.delivery], src: r.delivery_src, missing: 'not stated' },
      { label: 'Building owner / partner', val: r.host, src: r.delivery_src, missing: r.delivery === 'self-built' ? 'operator-owned' : 'not stated' },
      { label: 'Anchor customer', val: r.anchor && r.anchor.name, src: r.anchor && r.anchor.src, missing: 'not disclosed' },
      { label: 'GPUs', val: r.gpus ? [r.gpus.count ? r.gpus.count.toLocaleString() : null, r.gpus.model].filter(Boolean).join(' ') : null,
        src: r.gpus && r.gpus.src, missing: 'not disclosed' },
      { label: 'Coordinate precision', val: PRECISION[r.coords_precision] && PRECISION[r.coords_precision].label, src: r.coords_src },
      { label: 'Grid market',      val: r.grid && r.grid.market, src: r.grid && r.grid.src, missing: 'not scored' },
      { label: 'Buyer leverage',   val: r.grid && r.grid.leverage, src: r.grid && r.grid.src, missing: 'not scored' }
    ];
  } else if (r.azs == null) {
    fields = [
      { label: 'Status',      val: 'Announced, not yet live', src: r.src },
      { label: 'AZs planned', val: r.azs_planned,             src: r.src },
      { label: 'Target date', val: r.target,                  src: r.src }
    ];
  } else {
    const zoneVal = r.azs_basis === 'preview' ? 'In preview' : r.azs === 0 ? 'None'
      : r.azs_basis === 'minimum' ? `${r.azs} or more` : String(r.azs);
    fields = [
      { label: 'Availability zones', val: zoneVal, src: r.azs_src,
        hint: r.azs_basis === 'minimum' ? 'Microsoft publishes zone support, not zone counts. Three is the documented minimum.'
            : r.azs_basis === 'exact' && r.azs === 1 ? 'Exactly one — no in-region zone redundancy.'
            : r.azs_basis === 'exact' ? 'Exact count, published per region.' : null },
      { label: 'Launched',     val: r.launched, src: r.launched_src, missing: 'not published' },
      { label: 'Partition',    val: (PARTITIONS[r.partition] || r.partition) + (r.realm ? ` (realm ${r.realm})` : ''), src: r.azs_src },
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
  }

  const dot = colorOf(r) === NA_COLOR ? r._p.color : colorOf(r);
  const sub = r._kind === 'site' ? `${esc(r.metro)} · ${esc(r.country)}` : `${esc(r.id)} · ${esc(r.metro || r.country)} · ${esc(r.geo)}`;
  el.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-title"><span class="dot-inline${r._kind === 'site' ? ' is-diamond' : ''}" style="background:${dot}"></span>${esc(r.name)}</div>
        <div class="detail-code">${sub}</div>
      </div>
      <div class="detail-prov" style="color:${r._p.color}">${esc(r._p.name)}</div>
    </div>
    <div class="detail-grid">${fieldHtml(fields, r)}</div>
    ${r.coords_note ? `<div class="detail-note"><strong>Siting:</strong> ${esc(r.coords_note)} — ${esc(r.coords[1])}, ${esc(r.coords[0])}</div>` : ''}
    ${r.notes ? `<div class="detail-note">${esc(r.notes)}</div>` : ''}`;
}

/* ── tables ────────────────────────────────────────────────── */

function renderTable(cfg) {
  const rows = cfg.rows.slice();
  const col = cfg.columns.find(c => c.key === cfg.sort.key) || cfg.columns[0];
  rows.sort((a, b) => {
    const va = col.sort(a), vb = col.sort(b);
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return cmp * cfg.sort.dir;
  });

  $(cfg.wrap).style.display = rows.length ? '' : 'none';
  $(cfg.thead).innerHTML = cfg.columns.map(c => {
    const active = c.key === cfg.sort.key;
    return `<th data-key="${c.key}" ${active ? `aria-sort="${cfg.sort.dir === 1 ? 'ascending' : 'descending'}"` : ''}>
      ${esc(c.label)} <span class="arrow">${active ? (cfg.sort.dir === 1 ? '▲' : '▼') : '◆'}</span></th>`;
  }).join('');

  $(cfg.tbody).innerHTML = rows.map(r => `<tr data-uid="${esc(r.uid)}" class="${state.selected === r.uid ? 'is-sel' : ''}">` +
    cfg.columns.map(c => {
      const cls = c.type === 'mono' ? 'mono' : c.type === 'num' ? 'num' : '';
      const col = colorOf(r) === NA_COLOR ? r._p.color : colorOf(r);
      const sw = c.swatch ? `<span class="dot-inline${r._kind === 'site' ? ' is-diamond' : ''}" style="background:${col}"></span>` : '';
      return `<td class="${cls}">${sw}${esc(c.get(r))}</td>`;
    }).join('') + '</tr>').join('');

  $(cfg.count).textContent = `${rows.length} ${cfg.noun}${rows.length === 1 ? '' : 's'} in scope — click a row to inspect`;

  $(cfg.thead).onclick = e => {
    const th = e.target.closest('th'); if (!th) return;
    const k = th.dataset.key;
    const s = cfg.sort;
    const next = s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: (k === 'name' || k === 'id') ? 1 : -1 };
    Object.assign(s, next);
    renderAll();
  };
  $(cfg.tbody).onclick = e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    state.selected = state.selected === tr.dataset.uid ? null : tr.dataset.uid;
    renderAll();
  };
}

function renderTables() {
  renderTable({ rows: visibleRegions(), columns: REGION_COLUMNS, sort: state.sort, noun: 'region',
                wrap: 'regions-section', thead: 'thead-row', tbody: 'tbody', count: 'table-count' });
  renderTable({ rows: visibleSites(), columns: SITE_COLUMNS, sort: state.siteSort, noun: 'site',
                wrap: 'sites-section', thead: 'site-thead-row', tbody: 'site-tbody', count: 'site-count' });
}

/* ── data quality ──────────────────────────────────────────── */

function renderDataQuality() {
  const counts = { A: 0, B: 0, C: 0, none: 0 };
  const tally = id => { if (!id) return; const s = srcOf(id); counts[s ? s.tier : 'none']++; };
  state.regions.forEach(r => {
    [r.azs_src, r.launched_src, r.access_src, r.coords_src, r.paired_src, r.low_co2_src, r.grid && r.grid.src].forEach(tally);
    if (r.capacity_mw === null) counts.none++;
  });
  state.sites.forEach(s => {
    [s.status_src, s.coords_src, s.delivery_src, s.anchor && s.anchor.src, s.gpus && s.gpus.src, s.grid && s.grid.src,
     s.investment && s.investment.src, s.broke_ground && s.broke_ground.src].forEach(tally);
    (s.power || []).forEach(p => tally(p.src));
    if (!(s.power || []).length) counts.none++;
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
    const hasSites = state.sites.some(s => s._p.id === p.id);
    if (hasSites && !rs.length) return neocloudChecks(p, checks);
    if (hasSites) (p._notes || []).forEach(n => checks.push({ ok: null, text: `${p.short}: ${n}` }));
    const stated = p._totals.regions;
    if (stated && stated.self_counted) {
      // Comparing our own count against our own count would always pass, which would
      // imply a verification that never happened. Say what it actually is instead.
      checks.push({ ok: null, text: `${p.short}: ${rs.length} regions counted from the provider's own tables. There is no published headline region count to reconcile against, so this figure is a transcription, not a cross-check.` });
    } else if (stated && stated.value != null) {
      checks.push({ ok: rs.length === stated.value,
        text: `${p.short}: region count ${rs.length === stated.value ? 'reconciles' : 'does NOT reconcile'} — ${rs.length} records against ${stated.value} stated.` });
    }
    const azStated = p._totals.availability_zones;
    const azSum = rs.reduce((a, r) => a + r.azs, 0);
    if (azStated && azStated.value != null) {
      checks.push({ ok: azSum === azStated.value,
        text: azSum === azStated.value
          ? `${p.short}: AZ count reconciles — ${azSum} against ${azStated.value} stated.`
          : `${p.short}: AZ count is short by ${azStated.value - azSum} — ${azSum} summed against ${azStated.value} stated. The gap sits in the ${rs.filter(r => r.azs_basis !== 'exact').length} regions whose AZ count is not published per region.` });
    } else if (rs.some(r => r.azs_basis === 'minimum')) {
      checks.push({ ok: null, text: `${p.short}: no AZ total can be reconciled. ${p.short} publishes zone support but not per-region zone counts, so the ${azSum} shown is a floor across ${rs.filter(r => r.azs > 0).length} zone-enabled regions, not a count.` });
    } else if (rs.length) {
      checks.push({ ok: null, text: `${p.short}: ${azSum} zones summed from exact per-region counts, with no published headline to reconcile against. ${rs.filter(r => r.azs === 1).length} of ${rs.length} regions have exactly one.` });
    }
    const dangling = rs.filter(r => r.paired_with_raw && !r.paired_with);
    if (dangling.length) {
      checks.push({ ok: false, text: `${p.short}: ${dangling.length === 1 ? '1 region pairs' : dangling.length + ' regions pair'} with a region that has no row in the provider's own table — ${dangling.map(d => `${d.name} → ${d.paired_with_raw}`).join('; ')}. Left as found rather than invented.` });
    }
  });

  state.collisions.forEach(c => checks.push({ ok: false,
    text: `Source id "${c.id}" is defined differently by ${c.files.join(' and ')}. The page is showing the ${c.files[c.files.length - 1]} version.` }));

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

/* A neocloud's named sites almost never add up to what it reports for the fleet. That
 * gap is the finding: it is how much of the company's capacity has no public location. */
function neocloudChecks(p, checks) {
  const ss = state.sites.filter(s => s._p.id === p.id);
  const fleet = (p._totals.power || []);
  const isTarget = p._totals.power_kind === 'target';

  if (!fleet.length) {
    checks.push({ ok: null, text: `${p.short}: ${ss.length} named site${ss.length === 1 ? '' : 's'}. No fleet-wide power figure is published, so there is nothing to reconcile the sites against.` });
  }
  fleet.forEach(f => {
    const stages = LIVE_STAGES.includes(f.stage) ? LIVE_STAGES : POTENTIAL_STAGES.includes(f.stage) ? POTENTIAL_STAGES : PIPE_STAGES;
    const stageWord = stages === LIVE_STAGES ? 'live' : stages === POTENTIAL_STAGES ? 'full-build ceiling' : 'committed pipeline';
    const s = sumMW(ss.map(x => largest(x, stages)));
    const share = f.mw ? Math.round(s.total / f.mw * 100) : 0;
    const basis = s.mixed || s.bases.some(b => b !== f.basis) ? ' Site figures and the fleet figure are not on a common basis, so this is indicative only.' : '';
    if (isTarget) {
      checks.push({ ok: null, text: `${p.short}: target of ${f.mw.toLocaleString()} MW ${f.stage} (${f.note || 'target'}). Named sites carry ${s.total.toLocaleString()} MW at ${stageWord} stages. A target is not an actual, so this is context, not a reconciliation.${basis}` });
    } else {
      checks.push({ ok: false, text: `${p.short}: named sites account for ${s.total.toLocaleString()} MW of the ${f.mw.toLocaleString()} MW ${f.stage} it reports (as of ${f.as_of}) — ${share}%. The remaining ${(f.mw - s.total).toLocaleString()} MW has no public location.${basis}` });
    }
  });
  (p._notes || []).forEach(n => checks.push({ ok: /reject|does not match|not in the primary/i.test(n) ? false : null, text: `${p.short}: ${n}` }));
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
    `Schema v1.5 · ${state.providers.length} providers · data as of ${esc([...new Set(state.providers.map(p => p._asOf))].join(' / '))} · ` +
    `positions are metro or town centroids unless a record says facility; town and address coordinates geocoded via OpenStreetMap. ` +
    `Megawatts are shown exactly as each company states them — stage and basis differ between companies and are never silently summed.`;
}

/* ── boot ──────────────────────────────────────────────────── */

function renderAll() {
  renderStats();
  renderControls();
  renderMap();
  renderDetail();
  renderTables();
  renderDataQuality();
  renderSources();
}

const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' → ' + r.status); return r.json(); });

getJSON('data/providers.json')
  .then(man => Promise.all([
    Promise.all(man.providers.map(id => getJSON(`data/${id}.json`).then(f => [id, f]))),
    getJSON(WORLD_URL)
  ]))
  .then(([files, world]) => {
    state.world = world;
    const seen = {};
    files.forEach(([fid, f]) => {
      const p = Object.assign({}, f.provider, { _totals: f.totals || {}, _asOf: f.as_of, _notes: f.provider_notes || [] });
      state.providers.push(p);
      // Source ids are merged across files, so a clash silently replaces one definition
      // with another. Record it; shared ids with identical content are fine.
      Object.entries(f.sources || {}).forEach(([id, s]) => {
        if (seen[id] && JSON.stringify(seen[id].s) !== JSON.stringify(s)) {
          const c = state.collisions.find(x => x.id === id) || (state.collisions.push({ id, files: [seen[id].file] }), state.collisions[state.collisions.length - 1]);
          c.files.push(fid);
        }
        seen[id] = { s, file: fid };
        state.sources[id] = s;
      });
      const tag = kind => r => { r._p = p; r._kind = kind; r.uid = p.id + ':' + r.id; return r; };
      (f.regions  || []).map(tag('region')).forEach(r => state.regions.push(r));
      (f.sites    || []).map(tag('site')).forEach(r => state.sites.push(r));
      (f.pipeline || []).map(tag('pipeline')).forEach(r => state.pipeline.push(r));
    });
    renderAll();
  })
  .catch(err => {
    document.querySelector('main').innerHTML =
      `<div class="detail"><strong>Could not load.</strong><br>${esc(err.message)}` +
      `<br><br>This page reads JSON over fetch, so it must be served over HTTP.</div>`;
    console.error(err);
  });
