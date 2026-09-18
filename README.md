# Data Center Capacity Map

Interactive global and regional view of hyperscaler and neocloud data centre footprint —
what is live, where, and what it means for buyer leverage.

**Status: step 2 of 5 in progress.** Two providers (AWS, Azure), structural data only,
full provenance plumbing.

## What is here

| File | What it is |
|---|---|
| `index.html` | Page shell, Proxima header, gate |
| `src/app.js` | Map, table, detail, data-quality panel |
| `src/styles.css` | Styling, matching the negotiation planners |
| `data/providers.json` | Load manifest — add a provider by naming it here |
| `data/aws.json` | 39 AWS regions, sourced |
| `data/azure.json` | 66 Azure regions, sourced |
| `SCHEMA.md` | The contract every provider file must satisfy |

Served locally on port 3120 (`dc-capacity-map` in the workspace `.claude/launch.json`).
The page fetches JSON, so it needs HTTP — opening `index.html` off disk will not work.

## The design decision that matters

Every number on the page resolves to a source, and every source carries a tier:
**Verified** (primary, citable), **Estimate** (modelled), **Unverified** (placeholder).
The Data Quality panel counts them in public and reconciles record totals against each
provider's own published headline.

Capacity data is a swamp — there is no authoritative public dataset, and the good megawatt
figures sit behind analyst paywalls. A tool that shows a confident unsourced number to a
CIO is worse than useless. So the page is built to be honest about what it does not know,
and `capacity_mw` is left `null` rather than guessed.

## What Azure forced into the schema

Adding a second provider was the real test, and it broke three v1.0 assumptions:

1. **AZ counts are not universal.** AWS publishes an exact count per region. Microsoft
   publishes only whether a region has zones, with a documented minimum of three. So
   `azs_basis` now records how a count was arrived at, and any total containing a
   `minimum` renders as `≥ N`. Azure's 123 is a floor across 41 zone-enabled regions,
   not a count — and 24 Azure regions have no zones at all.
2. **Region pairing is first-class.** Azure pairs regions for geo-replication, 4 of them
   asymmetrically. AWS has no such concept, so the field is null there.
3. **Access is a spectrum.** AWS `opt_in` and Azure's restricted-access regions are the
   same idea at different strengths, so both collapsed into `access`:
   `general` / `opt-in` / `restricted`. 31 of the 105 regions are gated somehow.

## What the reconciliation found

- **AWS region count reconciles exactly:** 39 records against 39 stated.
- **AWS AZ sum is short by 1:** 123 against AWS's stated 124. The gap sits in the five
  GovCloud / China / EU Sovereign regions whose AZ counts are not published.
- **Azure has no headline to reconcile against.** Microsoft publishes no single region
  count, so 66 is flagged as a transcription, not a cross-check.
- **Sweden Central pairs with "Sweden South", which has no row in Microsoft's own region
  table.** Recorded as found rather than invented.

## Views

- **Global** — Natural Earth projection, bubble per region. Hollow bubbles have no zones.
- **Regional** — six geographies. Zooms, labels each region code, rolls stats up.
- **Provider** — all, or one at a time.
- **Colour by** — Provider, Partition, Zone support, or Grid leverage (joined from the
  Grid-Headroom Map).

Coincident regions are fanned apart at draw time only — Azure runs two regions in Virginia
and two in Canberra on identical published coordinates. The data is not altered to
separate them.

## Roadmap

1. ~~Schema + AWS by hand~~ — done.
2. ~~Azure~~ — done. Remaining: citation pass on unverified launch years, then GCP,
   Oracle, Meta and the neoclouds against the frozen schema.
3. Capacity layer — CBRE / JLL metro reports, flagged as estimates with explicit `basis`.
4. Daily intelligence digest (separate build).
5. Digest feeds `pending-changes.json` so the map maintains itself.

## Caveats

- Coordinate precision is **declared per record** (`facility` / `campus` / `metro-centroid`)
  and drawn as a positional-uncertainty ring. No facility-level records yet: AWS and
  Microsoft publish no facility addresses. Google and Meta do, so their files will.
- Microsoft publishes **no physical location at all** for the six China regions; those
  coordinates are unverified placements and flagged as such on each record.
- AWS launch years are unverified until the citation pass. Azure launch years are not
  published by Microsoft at all and are left null.
- Do not ingest paid-analyst figures into `data/` — see SCHEMA.md.
