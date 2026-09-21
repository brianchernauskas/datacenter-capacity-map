# Data Center Capacity Map

Interactive global and regional view of hyperscaler and neocloud data centre footprint —
what is live, where, and what it means for buyer leverage.

**Status: step 2 of 5 complete.** Eleven providers — four hyperscalers (203 regions), six
neoclouds, and Meta as a captive operator (71 sites in all) — with full provenance plumbing.

## What is here

| File | What it is |
|---|---|
| `index.html` | Page shell, Proxima header, gate |
| `src/app.js` | Map, table, detail, data-quality panel |
| `src/styles.css` | Styling, matching the negotiation planners |
| `data/providers.json` | Load manifest — add a provider by naming it here |
| `data/aws.json` | 39 AWS regions, sourced |
| `data/azure.json` | 66 Azure regions, sourced |
| `data/gcp.json` | 43 GCP regions, sourced |
| `data/oracle.json` | 55 Oracle regions across seven realms, plus 4 Stargate build sites |
| `data/{coreweave,nebius,iren,crusoe,lambda,nscale}.json` | 34 neocloud sites with disclosed MW, sourced |
| `data/meta.json` | 33 Meta sites with stated investment and groundbreaking year |
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
   `general` / `opt-in` / `restricted`. 31 of the 148 regions are gated somehow, all
   of them AWS or Azure — every GCP region is open.

## What GCP added

GCP slotted into the v1.2 schema without breaking it — the first provider that did — but
it publishes one thing the others do not:

- **Low CO₂ per region.** Google flags 19 of its 43 regions as low-carbon. AWS and
  Microsoft publish no equivalent, so their records carry `"low_co2": "not published"`
  rather than `"no"`, and the carbon layer renders that as a distinct third state. A
  missing value must never read as a negative one.
- **Locality-level siting for 10 regions.** Google's region table names a town
  ("Council Bluffs, Iowa", "The Dalles, Oregon") rather than a metro, which earns
  `campus` precision. It still is not facility precision — see Caveats.
- **Zone count can overstate physical separation.** Google states that Stockholm, Mexico,
  Osaka and Montréal run their three zones across only one or two physical data centres
  and are expanding. Those four carry a note saying so.

## What the neoclouds forced into the schema

Neoclouds do not have regions or zones. They have **sites and megawatts**, and each company
discloses them differently — which is itself the most useful thing the map shows:

| Company | Discloses |
|---|---|
| CoreWeave (public) | Fleet totals only — 1.5 GW active, ~3.7 GW contracted. **Names no sites.** |
| Nebius (public) | Year-end targets plus site-by-site announcements |
| IREN (public) | Every site by name in its filing, plus forward IT-capacity targets |
| Crusoe, Lambda, Nscale (private) | Individual site announcements; no fleet totals |

So v1.4 adds `sites[]`, each with a list of **power figures that carry their own stage**
(active / connected / contracted / planned / potential — Nebius's vocabulary) **and basis**
(IT / gross / generation / unspecified). Full-build ceilings are shown per site but never
summed into a headline; totals across bases are marked `≈`.

- **CoreWeave's named sites account for 7% of the 1.5 GW it reports active, and 21% of its
  3.7 GW contracted.** The rest has no public location. For a buyer, that is the point:
  most of the capacity you are being sold cannot be sited from public information.
- **Five of 34 sites are pre-sold** to a named anchor — Microsoft (three), OpenAI's Stargate,
  and an undisclosed single customer.
- **A widely repeated CoreWeave / Core Scientific site breakdown was rejected.** Core
  Scientific's own release says ~590 MW across *six* sites and itemises only Denton. The
  circulating five-site split does not match it.
- **First facility-precision record in the dataset:** CoreWeave Lancaster, from a
  press-reported street address.

## What Oracle and Meta added

- **Oracle carries regions and sites in one file.** It sells 55 cloud regions across seven
  isolated realms (commercial, Serbia, US Government, US Defense, UK, Australia, EU
  Sovereign) and operates four OpenAI Stargate campuses built by Vantage, Related Digital
  and BorderPlex/STACK. Stargate Abilene stays under Crusoe so it is not counted twice.
- **50 of Oracle's 55 regions have a single availability domain** — no in-region zone
  redundancy. Only Frankfurt, London, Ashburn, Chicago and Phoenix have three. The zone
  view now separates multi-zone, single-zone and no-zone regions, because a one-AD region
  read as "has zones" before.
- **Meta discloses dollars, not megawatts.** Its own fleet page gives 33 sites, each with an
  announced investment ($104bn+ across the USD-denominated ones, Richland Parish alone
  $50bn+) and a groundbreaking year, but no power figures and no operational status. Its
  sites are drawn hollow at minimum size, because size means disclosed MW and Meta
  discloses none. It is typed `captive`: it sells no cloud, but it competes with every
  buyer's providers for power, interconnects and GPUs in the same markets.

## What the reconciliation found

- **GCP reconciles exactly on both counts** — 43 regions and 130 zones against Google's
  own stated headline. The only provider so far that does.
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
- **Colour by** — Provider, Partition, Zone support, Low CO₂, or Grid leverage (joined
  from the Grid-Headroom Map).

Coincident regions are fanned apart at draw time only — Azure runs two regions in Virginia
and two in Canberra on identical published coordinates. The data is not altered to
separate them.

## Roadmap

1. ~~Schema + AWS by hand~~ — done.
2. ~~Azure~~, ~~GCP~~, ~~neoclouds~~, ~~Oracle~~, ~~Meta~~ — done. Remaining: citation pass
   on unverified AWS launch years; label crowding in dense regional views.
3. Capacity layer — CBRE / JLL metro reports, flagged as estimates with explicit `basis`.
4. Daily intelligence digest (separate build).
5. Digest feeds `pending-changes.json` so the map maintains itself.

## Caveats

- Coordinate precision is **declared per record** (`facility` / `campus` / `metro-centroid`)
  and drawn as a positional-uncertainty ring. **One facility-level record** (CoreWeave
  Lancaster). Google publishes owned campuses by town only, so GCP contributes 10 `campus`
  records; AWS and Microsoft publish neither.
- Neocloud MW are **as each company states them**, on differing stages and bases, and
  mostly as of the last announcement rather than today. Several announcements are over a
  year old; `as_of` on every figure says how old.
- Microsoft publishes **no physical location at all** for the six China regions; those
  coordinates are unverified placements and flagged as such on each record.
- AWS launch years are unverified until the citation pass. Azure launch years are not
  published by Microsoft at all and are left null.
- Do not ingest paid-analyst figures into `data/` — see SCHEMA.md.
