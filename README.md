# Data Center Capacity Map

Interactive global and regional view of hyperscaler and neocloud data centre footprint —
what is live, where, and what it means for buyer leverage.

**Status: step 1 of 5.** One provider (AWS), structural data only, full provenance plumbing.

## What is here

| File | What it is |
|---|---|
| `index.html` | Page shell, Proxima header, gate |
| `src/app.js` | Map, table, detail, data-quality panel |
| `src/styles.css` | Styling, matching the negotiation planners |
| `data/aws.json` | **The actual deliverable of step 1** — 39 AWS regions, sourced |
| `SCHEMA.md` | The contract every future provider file must satisfy |

Served locally on port 3120 (`dc-capacity-map` in the workspace `.claude/launch.json`).
The page fetches JSON, so it needs HTTP — opening `index.html` off disk will not work.

## The design decision that matters

Every number on the page resolves to a source, and every source carries a tier:
**Verified** (primary, citable), **Estimate** (modelled), **Unverified** (placeholder).
The Data Quality panel counts them in public and reconciles record totals against the
provider's own headline claim.

This is deliberate. Capacity data is a swamp — there is no authoritative public dataset,
and the good megawatt figures sit behind analyst paywalls. A tool that shows a confident
unsourced number to a CIO is worse than useless. So the page is built to be honest about
what it does not know, and `capacity_mw` is left `null` rather than guessed.

Current state of the AWS file, as the page reports it:

- Region count reconciles exactly: 39 records against 39 stated by AWS.
- AZ sum is short by 1: 123 against 124 stated. The gap sits entirely in the five
  GovCloud / China / EU Sovereign regions whose AZ counts are not published on the
  same page — visible, flagged, not papered over.
- 44 unverified fields, all of them launch years, which come from model knowledge
  and need a citation pass.
- 39 uncollected capacity figures, by design.

## Views

- **Global** — Natural Earth projection, bubble per region sized by AZ count.
- **Regional** — North America, Europe, Asia Pacific, Middle East, South America, Africa.
  Zooms, labels each region code, rolls the stat strip up to that geography.
- **Colour by** — Partition (commercial / GovCloud / China / sovereign), Grid leverage
  (joined from the Grid-Headroom Map), or Build era.

## Roadmap

1. ~~Schema + AWS by hand~~ — done, this commit.
2. **Citation pass on the 44 unverified fields**, then parallel agent fill for Azure, GCP,
   Oracle, Meta, and the neoclouds against the frozen schema.
3. Capacity layer — CBRE / JLL metro reports, flagged as estimates with explicit `basis`.
4. Daily intelligence digest (separate build).
5. Digest feeds `pending-changes.json` so the map maintains itself.

## Caveats

- Coordinate precision is **declared per record** (`facility` / `campus` / `metro-centroid`)
  and drawn as a positional-uncertainty ring, so a centroid never reads as a pinpoint.
  Currently 3 campus-level and 36 metro-level; no facility-level records yet, because AWS
  publishes no facility addresses. Google and Meta do, so their files will carry real
  facility coordinates.
- Launch years are unverified until step 2.
- Do not ingest paid-analyst figures into `data/` — see SCHEMA.md.
