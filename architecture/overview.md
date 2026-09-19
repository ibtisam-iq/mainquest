# System overview

The technical shape of mainquest. [REFERENCE.md](../REFERENCE.md) explains the same system in plain language. This file is the precise version.

## Components

| Component | Where it lives | Runs when | Language |
|---|---|---|---|
| Upstream pipeline | A separate project on the owner's machine | Whenever the owner collects or enriches data | Python |
| Source copy | `data/raw/companies.csv`, gitignored | Replaced by hand at each refresh | CSV |
| Geocoder | `scripts/geocode.ts` | On demand, only for new addresses | TypeScript on Node |
| Ingest | `scripts/ingest/` | On demand, after a new source copy | TypeScript on Node |
| Validator | `scripts/validate.ts` | After every ingest, and before every hosted build | TypeScript on Node |
| Published dataset | `data/*.json`, committed | Written by the ingest | JSON |
| Cross-check | `scripts/ingest/crosscheck.ts` | On demand, while upstream files are available | TypeScript on Node |
| Browser download | `public/data/`, gitignored | Written by `scripts/publish-data.ts` before every dev run and build | JSON |
| Website | `app/`, `components/` | At build time and in the browser | TypeScript, React, Next.js |
| Host | Vercel | Always | n/a |

Nothing runs on a server at request time. The site is generated ahead of time and served as files. There is no process to keep alive, no database connection, and no per-request cost.

The upstream pipeline stays outside this repository. The only thing that crosses the boundary is one CSV file, copied by hand, and even that copy is ignored by git. Once collection is finished, the upstream folder can be archived and deleted, and mainquest keeps working from its committed dataset.

## Data flow

```
  upstream master CSV  ->  data/raw/companies.csv  ->  geocode  ->  ingest  ->  data/*.json  ->  Next.js build  ->  browser
   (separate project)       (gitignored copy)          (new         (offline,    (committed)      (validate first)
                                                        addresses)   deterministic)
```

**Source to copy.** A plain file copy. The master is the only file needed: every other upstream file is a subset of its rows, and the ingest recreates each of those views.

**Copy to geocode.** `npm run geocode` finds addresses with street or area detail that are not yet in `data/geo/cache.json`, and looks them up with OpenStreetMap Nominatim at no more than one request per second. Results, including misses, are cached and committed, so an address is looked up once. Foreign headquarters are looked up the same way, for their country, as are the well-known places in `scripts/ingest/rules/places.json`, which take priority over raw geocoder results, and city names the hand-kept city table lacks, which become cities of their own once confirmed. Each office result keeps its own name and the names of the areas around it, so the ingest can check it against the address. Decisions 15 and 25.

**Copy to ingest.** `npm run data` runs the ingest and then the validator. It never touches the network. The same source file, the same cache and the same previous dataset always produce byte-identical output: records are sorted by handle, and keys come from a fixed list. The only dates written are per company (decisions 18 and 19). An entry's `updated` date moves only when its content changes, and a member count's recorded date only when the count changes, so a refresh with nothing new changes nothing.

**Ingest to dataset.** `data/companies.json` holds one record per line, so a git diff after a refresh shows exactly the companies that changed. The facet files beside it list filter values with counts. `data/ingest-report.json` records what was dropped, cleaned and located on each run.

**Dataset to site.** Before each build, the validator reads only the committed files and fails the build on any problem. The build then splits the dataset into two files the browser downloads. Details below.

## Where filtering happens

In the browser. The dataset downloads once, and every filter, search and sort then runs against the copy in memory, with no network round trip per interaction. Search runs in a web worker, a background thread, so typing never waits on it (decision 16).

The download comes in two parts:

| File | Holds | Size now, gzipped | Size at full enrichment |
|---|---|---|---|
| `core.json` | everything needed to list, filter, order and locate companies | about 600 KB | about 700 KB |
| `extra.json` | full specialties text, office addresses, and the three dates per company | about 615 KB | about 700 KB |

The page is usable as soon as `core.json` arrives. Full-text search and company detail upgrade when `extra.json` lands a moment later. The validator enforces a gzipped budget on each file.

| Companies | Total payload, gzipped | Behaviour |
|---|---|---|
| 13,500 | about 1.2 MB at full enrichment | Fine; the list appears before the extra file lands |
| 50,000 | about 4 MB | The limit for a phone connection |
| 130,000 | about 11 MB | Too slow |

Past roughly 50,000 companies the fix is one of:

- split the files by city and load only what a visitor asks for, or
- ship a SQLite file and let the browser query pieces of it over HTTP range requests.

Both change the build-time split and the loading layer. Neither touches the interface. The split already happens in one function, `lib/payload.ts`, which is where that change would go.

## Page types

**The browse view.** One page, the whole product: search, a tile per city hub with a dot map of its offices, filters, results as a list or a map, a "near" control and export. The list comes in numbered pages, 10 companies each by default (decision 21). Results are most followed first unless another order is chosen (decision 18). Every choice is kept in the URL. Every figure and place name on the page comes from the data files at build time.

**Landing pages.** One page per city hub, per city a hub does not stand for on its own, per area and per industry, all from one list in `lib/landing.ts` and generated at build time so search engines can index them (decision 28): a dot map of where the companies are, a few counts, the busiest areas, industries or cities and the common specialties drawn as ranked bars, and the first 100 companies as plain HTML, each linking into the browse view. They exist for discovery, not browsing. Each has its own title, description, canonical address, preview tags and preview picture, and structured data for its breadcrumb trail. An index at `/companies` links to all of them. The sitemap lists those with at least 5 companies; smaller ones are marked noindex.

**No page per company.** Decision 3. Company detail expands in place.

**A page for unknown addresses**, with a way back to the directory and to each city.

**Preview pictures.** One per landing page, one for the home page and one for the index, drawn from the data when the site is built (316 pages, 174 in search results, 30 to 66 KB each).

**Outside requests.** The map view is the only part of the site that fetches from another host: OpenFreeMap's style (light or dark, matching the site's theme), vector tiles and label fonts, loaded only when the map is opened (decisions 20 and 24). The site's own fonts are served by the site itself. All of the site's code except the map comes to about 197 KB gzipped, and its stylesheet to about 11 KB. The look of every page, in light and dark, comes from one set of tokens in `app/globals.css` (decisions 23 and 24). Opening the map adds about 420 KB, for the map library and its worker, once per browser.

## What phase 2 adds

Accounts and saved lists. Next.js gains API routes, and Supabase provides login and a Postgres database. The company data still ships as files, because it is still read-only. Only the per-user data goes in the database.
