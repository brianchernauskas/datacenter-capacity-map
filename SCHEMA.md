# Data schema — v1.2

One JSON file per provider, in `data/<provider>.json`. The map reads them all and merges.
This file is the contract. **Fill the fields; do not invent fields, and do not change field names.**

## The one rule

Every value that appears on the page must resolve to a source id. A record with a number and
no source is worse than a record with no number, because the page will render it as if it were known.

Provenance tiers, set on the source, not the field:

| Tier | Meaning | Renders as |
|---|---|---|
| `A` | Primary, citable, publicly verifiable | green **Verified** |
| `B` | Modelled, estimated, or expert judgement | amber **Estimate** |
| `C` | Unverified placeholder — must be replaced before publication | red **Unverified** |

`kb-unverified` is the tier-C bucket. Anything still carrying it is unfinished work, and the
Data Quality panel counts it in public.

## Top level

```jsonc
{
  "schema_version": "1.0",
  "as_of": "YYYY-MM-DD",          // when this file was last refreshed
  "provider": { "id", "name", "short", "type", "color", "parent", "ticker" },
  "sources":  { "<source-id>": { "title", "url", "accessed", "tier", "note" } },
  "totals":   { "regions": {"value","src"}, "availability_zones": {...}, "announced_regions": {...} },
  "regions":  [ ... ],
  "pipeline": [ ... ],
  "capex":    { "note", "series": [] }
}
```

`provider.type` is one of `hyperscaler`, `neocloud`, `regional`, `colo`.

`totals` is the provider's **own stated** headline figure, kept separately from the sum of
the records. The page reconciles the two and shows the gap. Do not "fix" a gap by editing
a record to make the arithmetic work — the gap is the finding.

## `regions[]` — operational regions

| Field | Type | Notes |
|---|---|---|
| `id` | string | Provider's own region code. Primary key. |
| `name` | string | Provider's friendly name, verbatim. |
| `metro` | string | Metro or siting area. |
| `country` | string | |
| `geo` | enum | `North America`, `South America`, `Europe`, `Middle East`, `Africa`, `Asia Pacific` |
| `coords` | `[lon, lat]` | Best known position. Precision is declared, never assumed — see below. |
| `coords_precision` | enum | `facility`, `campus`, `metro-centroid` |
| `coords_src` | source id | |
| `coords_note` | string | Optional. What the coordinate actually refers to. |
| `azs` | int | Availability zones / equivalent. `0` if the region has none. |
| `azs_basis` | enum | `exact`, `minimum`, `none`, `preview` — see below. **Required.** |
| `azs_src` | source id | |
| `launched` | int \| null | Year GA began. `null` where the provider does not publish it. |
| `launched_src` | source id \| null | |
| `partition` | enum | `commercial`, `govcloud`, `government`, `china`, `sovereign` |
| `access` | enum | `general`, `opt-in`, `restricted` |
| `access_src` | source id | |
| `paired_with` | string \| null | Programmatic id of the paired region, resolved. |
| `paired_with_raw` | string \| null | The pair exactly as the provider printed it. |
| `paired_src` | source id \| null | |
| `status` | enum | `operational` |
| `capacity_mw` | object \| null | See below. `null` until a citable source exists. |
| `grid` | object \| null | `{ market, constraint_index, leverage, src }` — join to the Grid-Headroom Map. US only for now. |
| `notes` | string | Optional caveat shown under the record. |

## `pipeline[]` — announced, not yet live

Same shape, minus the operational fields, plus `azs_planned`, `target` (date or null),
`investment_usd` (number or null), `src`.

## `azs_basis` — providers do not count the same way

This is the field that keeps the map honest across providers, and it exists because
Azure broke the v1.0 assumption that "AZs" means the same thing everywhere.

| Value | Means | Who |
|---|---|---|
| `exact` | Provider publishes the count for this specific region | AWS |
| `minimum` | Provider publishes only *that* zones exist, plus a documented floor | Azure (min 3) |
| `none` | Region has no zones | 24 Azure regions |
| `preview` | Zone support announced but not GA | Azure North Central US |

**Never sum across mixed bases and call the result a count.** AWS publishes exact
per-region counts, so an AWS AZ total is a count. Microsoft publishes zone support as a
yes/no plus a documented minimum of three, so an Azure AZ total is a *floor*. The page
renders any total containing a `minimum` as `≥ N` and says why. If you add a provider
that publishes neither, use `none` and leave the count at zero rather than guessing.

## `totals` — do not build a check that cannot fail

`totals` holds the provider's **own published headline**, kept apart from the sum of the
records so the two can be compared. Some providers publish no such headline — Microsoft
does not state a single region count anywhere. In that case set `self_counted: true`:

```jsonc
"regions": { "value": 66, "src": "azure-regions-list", "self_counted": true,
             "note": "Counted from the Microsoft region tables, not a Microsoft headline claim." }
```

The page then reports it as a transcription rather than a reconciliation. Comparing a
number against itself always passes, and a check that always passes implies a
verification that never happened. That is worse than no check at all.

## `coords_precision` — say how well you actually know where it is

Use facility-level coordinates **whenever they are known and citable**, and fall back to
coarser positions otherwise. The point is that the map never renders a guess as a pinpoint.

| Value | Means | Drawn as |
|---|---|---|
| `facility` | Exact published facility location | Solid dot with crosshair |
| `campus` | Known siting cluster, individual building unresolved | Dashed ring |
| `metro-centroid` | Metro only, position indicative | Wide dotted ring |

Where facility precision is actually available:

- **Google** publishes data centre addresses officially at `google.com/about/datacenters/locations/`.
- **Meta** publishes them at `datacenters.atmeta.com`.
- **Microsoft** publishes region geographies but not facility addresses.
- **AWS** publishes neither. Its facilities are documented by county permitting records,
  utility filings and local press — genuine tier-A primary sources if you go and read them,
  which is a per-site research job, not a scrape.

Third-party compilers (DataCenterMap, Baxtel, Datacenters.com) hold good facility data, but it
is *their* compiled dataset. Use it to know where to look in the primary records; do not copy
their coordinates into this file. Same reasoning as the paid-analyst rule below.

## `capacity_mw` — the Tier B shape

Never a bare number. Always:

```jsonc
"capacity_mw": {
  "value": 520,          // central estimate
  "low": 400,            // plausible range
  "high": 650,
  "basis": "critical IT load",   // what is being measured — say it explicitly
  "src": "cbre-na-2026q2"
}
```

`basis` matters more than it looks. "Critical IT load", "gross MW", "utility interconnect
capacity" and "nameplate" differ by large multiples, and analysts mix them freely. A record
that does not say which one it means is not usable in a negotiation.

Leave `capacity_mw` as `null` rather than guessing. The page renders null honestly as
"not yet collected". It has no honest way to render a number you made up.

## What good sources look like

**Tier A** — provider infrastructure pages, SEC filings (10-K/10-Q), earnings call transcripts,
company press releases, government permitting and interconnection filings, CBRE / JLL /
Cushman & Wakefield quarterly data centre reports.

**Tier B** — anything modelled: your own constraint index, analyst estimates you are entitled
to use, capacity inferred from building footprint or utility filings.

**Do not ingest** paid-analyst figures (SemiAnalysis, Synergy, DC Byte, Dell'Oro) into this
file. This tool is served publicly under a gate, and republishing licensed figures is a real
exposure. Use them privately to sanity-check what you publish, not as a `src`.

## Filling a new provider

1. Copy `data/aws.json`, empty the arrays, keep the shape.
2. Fill `regions[]` from the provider's own infrastructure documentation first — it is Tier A
   and it is the spine of everything else.
3. Record `totals` from the provider's headline claim, then let the page reconcile.
4. Leave `capacity_mw` null. Come back to it once you have a market report to cite.
5. Anything you could not verify gets `kb-unverified`, not a guess and not silence.
