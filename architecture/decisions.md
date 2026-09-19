# Decisions

Settled choices and the reasoning behind each one. Changing one of these requires a fact that was not known when it was made, not a preference.

Newest at the bottom.

---

## 1. Next.js, not Astro

**Decision.** Build the site with Next.js and React. Host on Vercel.

**Why.** mainquest is two things at once. It is a content site, because per city and per industry pages need to rank on Google. It is also an application, because the core experience is a fast filterable table of tens of thousands of rows. Astro is excellent at the first and adequate at the second. Next.js is good at both.

The deciding factor was phase 2. The owner wants accounts and saved lists eventually. With Next.js that is new code in the same project: API routes, a database client, an auth library. With Astro it means adding a server and changing how the site is hosted. One of those is an afternoon and the other is a migration.

Secondary reason: Next.js is the standard React framework. The owner is teaching themselves and asked for the choice that is most useful to learn.

**Rejected alternatives.**

| Option | Why not |
|---|---|
| Astro | See above. Also already used on sidequest, and it was explicitly ruled out as the familiar rather than the fitting choice |
| Plain React with Vite | Pure single page app, so search engines see an empty page. Bad for a directory that needs to be found |
| Java, Spring | Wrong tool. Heavy, slow to build with, no benefit here |
| Python, Django or Flask | Good language, wrong layer. Python stays in the upstream pipeline where it belongs |
| WordPress or a no code builder | Fine at 100 rows, falls over at 13,000, and teaches nothing |

**Consequences.** Hosting moves from GitHub Pages to Vercel. The custom subdomain still works. If staying on GitHub Pages ever becomes a requirement, Next.js can export a static folder, at the cost of the server features.

**Checked on 12 September 2026, before the first deployment.** A copy of the project with no git history and no raw data, built as Vercel builds it, passed the validator and produced all 249 pages. A static export for GitHub Pages also built, but only after every generated file was marked `force-static`, and it showed two faults for that host: preview pictures written without a file extension, which GitHub Pages serves as an unknown download type rather than an image, and each city page written both as `lahore.html` and as a folder `lahore/` of its areas, which needs addresses ending in a slash. Vercel stays the host.

---

## 2. No database in phase 1

**Decision.** Ship the company data as a generated file. No database, no server.

**Why.** A database is for data that changes while the site is running. The company list changes when the dataset is regenerated, which is a build time event. Nothing writes at runtime. Adding a database would introduce cost, a failure point and latency in exchange for nothing.

**Consequences.** Zero running cost. Nothing to keep alive or back up. The dataset is versioned in git, so every change is a reviewable diff.

**What would change this.** Per user data, which is exactly what phase 2 introduces. At that point a database appears, but only for the per user part. The company list stays a file.

---

## 3. No page per company

**Decision.** Do not generate one HTML page per company.

**Why.** It is the obvious design and it does not survive growth. At 13,000 companies it is roughly 370 MB of HTML. At 130,000 it is roughly 3.7 GB, past what free hosting will serve, and build times grow with it. A directory does not need a page per row. It needs one fast list.

Measured on sidequest, which does generate a page per entry: 28.4 KB per page, dominated by the site chrome repeated on every page. That number is where the estimates above come from.

**Consequences.** Company detail is shown in place, in the browse view. Landing pages exist per city and per industry instead, which is what search engines actually need.

**Amended by decision 28.** Landing pages now exist per city hub, per city, per area and per industry, all from one list.

---

## 4. CSV in, JSON out

**Decision.** The source CSV files stay the source of truth. A build script converts them to one JSON file, which is generated and committed.

**Why.** The Python pipeline already produces CSV and spreadsheets open it, so there is no reason to fight that. JSON is what browsers read natively. Converting in a build step means the two can never disagree.

Committing the generated file rather than building it on the host means a build never depends on raw CSVs being present, and every refresh shows up as a reviewable diff. The source copy itself lives in `data/raw/`, which git ignores, because it carries fields that must not be published (decision 12).

**Rejected.** YAML, which sidequest uses. It is good for a few hundred hand edited files and bad for 13,000 machine generated rows.

---

## 5. Never store volatile fields

**Decision.** No employee counts, follower counts, hiring status, or open job counts in the dataset.

**Why.** These change constantly. A company with 50 employees today has 150 next year. Hiring status changes weekly. A directory that caches them is out of date within weeks and starts lying to visitors, quietly, with no way for anyone to notice.

Store what stays true: name, profile handle, industry, city, country, headquarters. Everything else is reached by linking to the company's own profile, which is current by definition.

**Consequences.** The site cannot advertise "who is hiring." That is correct. It is a directory, not a jobs board.

**Amended by decisions 18 and 19.** Follower counts and associated member counts are now stored and shown, each with its date. Company size bands, hiring status and open job counts remain excluded.

This decision came from the owner and is the sharpest idea in the project.

---

## 6. Derive the profile sub links, do not store them

**Decision.** Generate `/jobs/`, `/people/` and `/about/` URLs from the profile URL at render time.

**Why.** They are the profile URL with a suffix appended. Nothing more. The source files have them as three separate columns, which is three columns of duplication across 130,000 rows, plus a chance for them to drift out of sync with the profile they were derived from.

---

## 7. The profile handle is the primary key

**Decision.** Identify and deduplicate companies by the handle at the end of the profile URL.

**Why.** Display names collide, and they change when a company rebrands. The handle is unique and stable. It is also what every derived link is built from, so keying on it means a record can never disagree with its own links.

**Consequences.** A row without a usable profile URL cannot be included. That is acceptable: a directory entry with no way to reach the company is not worth having.

---

## 8. Private job search data never enters this repo

**Decision.** Application status, applied role, application date, outreach status, personal notes and recruiter contact details stay out. The split is enforced by the ingest script, using an explicit list of publishable fields, not a list of fields to strip.

**Why.** This is a public repository, and contact details for named individuals are other people's personal information. Publishing them would be a genuine privacy problem rather than an untidiness.

An allowlist is used rather than a blocklist because a new column added upstream should default to being excluded, not included.

**Consequences.** The owner's job search records live somewhere else. If they want them backed up, that is a private repo, and a separate decision.

---

## 9. Filtering happens in the browser

**Decision.** Download the dataset once, then filter, search and sort locally.

**Why.** It is instant, it costs nothing to run, and it works offline once loaded. Server side filtering would mean a network round trip on every click and a server to pay for.

**Consequences.** The visitor downloads the whole dataset up front, so payload size is the constraint that governs scale. Measured on the real dataset, the published fields come to about 1.2 MB gzipped at 13,542 companies once enrichment is complete, split into a first file of about 680 KB and a second of about 480 KB (decisions 14, 18 and 19). At 130,000 companies the same shape is about 11 MB, which is too slow on a phone.

**What would change this.** Crossing roughly 50,000 companies. The fix is to split the data by city and load on demand, or ship a SQLite file the browser queries in pieces. Both are changes to the ingest step and the loading layer, not to the interface.

---

## 10. AI is phase 3, not phase 1

**Decision.** No AI features in the first version.

**Why.** Two honest observations. Most "AI search" on directory sites is a good search box with good filters, and a fast filter beats a slow chatbot for "show me companies in Lahore," which is the actual job. And "companies near me" is distance arithmetic between two pairs of coordinates, not machine learning.

Where AI genuinely earns its place here, later: turning a sentence like "DevOps companies in Lahore that also have offices abroad" into filter settings, finding similar companies, and cleaning up the messy free text industry values into consistent groups. The last of those is probably the highest value, and it can run once at build time rather than per visitor.

**Consequences.** Phase 1 needs no API keys and no server, which is part of why it is free.

**Measured later.** The industry field turned out to have only 57 values, usable as a filter unchanged. The messy free text is in specialties instead, so that is where build-time grouping would help. The phase 3 plan reflects this. "Companies near me" was built in phase 1 without any model, as this decision expected (decisions 15 and 17).

---

## 11. The name

**Decision.** `mainquest`. Repository `ibtisam-iq/mainquest`, site at `mainquest.ibtisam-iq.com`.

**Why.** It inherits the vocabulary already established by the owner's `sidequest` project rather than introducing a second unrelated metaphor. The pair explains itself: a sidequest is what turns up while wandering off the path, the main quest is the path. A career is the main quest.

**Known weakness, accepted.** The word names a journey, while the site is a reference tool used during one. Someone hearing it cold would not guess "directory of IT companies." That cost is accepted because the value comes from the pairing, and because a single line of supporting text covers what the name does not.

**Rejected, with reasons worth keeping:**

| Rejected | Why |
|---|---|
| `guildhall` | Proposed on a meaning the word does not have. A guildhall is a town hall |
| `atlas`, `radar`, `census`, `skyline` | Describe the shape of the data rather than what the project is for |
| `hiringground`, `applyto`, `frontdoor` | Frame it as a job application tool, which it is not |
| `codex`, `fieldguide`, `deepfield` | All three are established products. The last is network analytics software, colliding directly with this audience |
| `daftar` | Language and region specific, and the project is neither |

**The rule that came out of it:** confirm a candidate name is not an established product before proposing it. Three of the rejections above were only caught after the fact.

---

## 12. Descriptions excluded, and the source copy kept out of git

**Decision.** The description column is not published. The source CSV is copied into `data/raw/`, which git ignores, and only the cleaned dataset is committed.

**Why.** Descriptions are 93% of the data by size: 9.2 MB of text across the source. With them, the dataset is 3.4 MB gzipped today and about 32 MB at 130,000 companies, which breaks browser-side filtering outright (decision 9). Without them it is 234 KB. They are also text written by third parties, republished at scale.

The same reasoning keeps the source file itself out of the public repository. Its header and three of its columns carry the source platform's name and URLs, which RULES.md rule 3 forbids. It also holds the descriptions, volatile counts and a date column. The copy sits inside the project folder so the ingest can run without the upstream pipeline, but it never reaches git history.

**Consequences.** Search covers name, industry, specialties and addresses rather than free-text descriptions. Each entry links to the company's own page for the rest.

**Amended by decision 27.** The ingest reads the description, without storing it, for what a company says about where it is based.

---

## 13. Classifications ported from upstream and cross-checked, not reinvented

**Decision.** City hubs, the local and foreign headquarters split, and the multi-city flag are computed with exact ports of the upstream pipeline's own logic, including its known quirks. They are not rewritten or improved.

**Why.** The upstream pipeline already defines these views, and the owner uses them. It merges Islamabad and Rawalpindi into one "twin cities" hub, and lets a company sit in several hubs. Re-deriving them differently would make the site disagree with the files the owner works from. A faithful port can be proven instead: `npm run crosscheck` compares the result with the upstream files company by company, and every set matched exactly. The confirmed counts are pinned in `scripts/ingest/rules/baseline.json`, so the guard keeps working after the upstream folder is gone.

**Rejected.** A new city normaliser. The upstream data carries 270 location spellings, and three separate normalisers in the upstream code already disagree with each other. A fourth would have been a guess.

**Consequences.** Upstream quirks carry over. One example: a headquarters written with a diacritic, `Karāchi`, counts as foreign, as it does upstream. Office positions (decision 15) are finer-grained and may name a city outside a company's hubs; the ingest report counts those cases.

**Amended by decision 25.** The hubs' ids, labels, words and cities moved to `scripts/ingest/rules/hubs.json`. The logic is unchanged and the cross-check still passes.

**Amended by decision 27.** The local and foreign split stays in the data as the upstream port, but the site no longer filters by it. It filters by where a company is run from, which starts from the headquarters' geocoded country, so the 64 companies the port calls foreign while their headquarters is in Pakistan (Haripur, Skardu, `Karāchi`) count as Pakistani there.

---

## 14. Website, founded and specialties published; tagline excluded; a two-part download

**Decision.** Of the fields the upstream enrichment fills, publish the website, the founded year and the specialties. Exclude the tagline, company size and member counts. The site downloads the dataset in two files: a core file for listing, filtering and locating, and an extra file with specialties text and addresses, loaded right after first render.

**Why.** A website link and a founding year are stable, cheap facts: together about 100 KB at full enrichment. Specialties cost about 360 KB, but they are what makes search useful ("kubernetes", "web development"), and they feed the specialty filter. The tagline would have added about 530 KB of third-party text and adds little a visitor can act on, so it goes the way of descriptions. Size and member counts are volatile (decision 5). Company Type is empty in the source; once upstream fills it, publishing it is a one-line change to the column contract.

Splitting the download keeps the first render fast. The list, filters and map need only the core file.

**Consequences.** Coverage of these fields grows with each refresh, and the validator only lets it rise. Companies not yet enriched show without a website or year until the next refresh.

**Amended by decision 19.** Member counts are now published, with the date each was first recorded. Company size bands stay excluded.

---

## 15. Office locations from OpenStreetMap, with honest precision

**Decision.** Addresses with street or area detail are geocoded with OpenStreetMap Nominatim, once, into a committed cache. Every office carries a precision of street, area or city. Distance ranking uses only street and area offices; companies known only by city are listed separately, never ranked by a distance that would really be the city centre's.

**Why.** "Companies near me" needs coordinates, and the source has none. Nominatim is free and needs no key. Its terms allow storing results with attribution, which the site shows. Keeping the cache in the repository means each address is looked up once. A later refresh only looks up new addresses, and the ingest itself stays offline and deterministic.

About 24% of companies have an address more specific than a city. The upstream address step has run for the twin cities only, where about 47% do; in Lahore, Karachi and Faisalabad it is 11% to 23%. Showing a distance for everyone else would mean inventing one.

**Rejected.** Commercial geocoders, whose terms restrict storing results or showing them on non-proprietary maps. Also rejected: the upstream distance files. They measure distance from a single personal reference point, so they are not general.

**A known-places list comes first.** Measured against the Islamabad sector grid, raw geocoder results were not good enough: 17% of offices whose address names a sector landed more than 4 km away, some 25 km, because "Sector E-11" matched an unrelated "Sector E". So the ingest first checks each address against `scripts/ingest/rules/places.json`, a committed list of about 110 well-known places: Islamabad sectors, DHA and Bahria Town phases, and the main areas of Lahore, Karachi and Faisalabad. A named place sets the office's position and label, and a geocoder street result is kept only within 1.5 km of it. After this, no sector-named office lands more than 4 km from its sector, and 97% land within 2 km.

Each place's own centre also comes from the geocoder, and each was checked before being trusted:
- Islamabad sectors must form their regular grid.
- Twin-cities places were compared with a second, independent landmark table.
- Every place used five or more times was reverse-looked-up, to confirm the geocoder names the right area at that point.

Places that failed are left out, so their addresses fall back to the geocoder or to city level. Four Bahria and DHA phases failed this way. One place, Bahria Town Phase 7, carries a fixed point, with a note saying how it was verified.

**Consequences.** Before lookup, office labels such as "Headquarters" are stripped from each query; otherwise the geocoder matches them to buildings of that name. A postcode result counts as city level, because a postal zone is several kilometres across. A result more than 40 km from the office's own city is rejected. On the first full run, 2,276 companies (16.8%) have an office precise enough to rank by distance. Coverage improves on its own as upstream address enrichment reaches more cities.

**Amended by decision 25.** A geocoder result for an address that names no well-known place now counts only through a name the address contains, and an office's city is read so that a road named after a city does not count.


**Amended by decision 29.** Faisalabad's centre is its Clock Tower, and street precision needs the result's own building or road name in the address.
---

## 16. Search runs in the browser

**Decision.** Search uses MiniSearch in a web worker, over name, specialties, tags, industry, area, city, address and website domain, with prefix matching, one-typo tolerance and a small committed list of synonyms.

**Why.** The data is already in the browser for filtering, so a search server would add cost and latency for nothing.

Two matching rules came from testing on the real data. Prefix matching starts at three letters, so a fragment such as "ai" does not match every word it begins. A synonym applies word for word only between single words ("k8s" and "kubernetes"). A multi-word form applies only when it is the whole query: split into words, "dev ops" had turned "dev" into a prefix of "development", and a search for devops in the twin cities returned 1,733 companies instead of 90. At 13,500 companies the index builds in well under a second. Text is folded (compatibility form, accents removed, lowercase) before matching, because some company-written text uses styled Unicode letters that would otherwise never match plain typing.

**Consequences.** Search sits inside the active filters and location rather than beside them. Synonyms are data (`scripts/ingest/rules/search-synonyms.json`), so improving them needs no code change.

**Amended by decision 26.** Words written with symbols are kept whole, a short list of words matches only exactly, and a wrong letter is forgiven only in rare words.

---

## 17. The map: Leaflet and OpenStreetMap, drawing only placed offices

**Decision.** The map view uses Leaflet with OpenStreetMap tiles. It draws only offices placed at street or area level. Distances to area-level offices are shown to the nearest kilometre ("≈ 2 km", "< 1 km"), never with a decimal.

**Why.** Leaflet is free, needs no key, and loads only when the map is opened, so the list stays light. OpenStreetMap is already the source of the office positions (decision 15), and its tiles are free to use with attribution. An office known only by city would sit on the city centre and suggest a position nobody knows, so those companies stay in the list, and a note under the map says how many. An area-level office sits at its area's centre, so a distance such as 0.0 km would claim a precision the data does not have.

**Rejected.** Commercial map services, which need keys, bill by use and restrict how results are shown.

**Consequences.** The map uses Leaflet's SVG renderer rather than its canvas renderer: under React's development mode the canvas renderer redraws after the map is removed and throws. SVG comfortably handles the at most 2,400 placed offices. The export carries each distance's precision beside it, for the same reason as the rounding.

**Amended by decision 20.** The map is now drawn by MapLibre from OpenFreeMap's vector tiles, so its labels are in English. Drawing only placed offices, and the rounding of distances, still stand.

---

## 18. Follower counts shown as a dated snapshot, and most followed first by default

**Decision.** Publish each company's follower count with the date it was counted. Order every list by follower count, most followed first, by default: with or without filters, a search or a point. Best match, nearest, name and founding year stay available as other orders. Each company also carries the date its entry last changed.

**Why.** This reopens part of decision 5, at the owner's request. A visitor sorting through thousands of companies needs some sense of which are large or active. Follower count is the only such measure in the data: 13,443 of 13,542 companies have one, while company size is filled for a quarter of them and only for the twin cities.

Decision 5's objection was that a stored count goes stale without anyone noticing. Showing the date answers that. A visitor sees "295K followers, counted 3 Sep 2026" and can judge its age, and the last-updated date shows how recently anything about the entry changed.

**How the dates work.**
- `followersAsOf` is the day the source row was counted, taken from the source's trailing date column. Counts are never refreshed separately from their row.
- `updated` is the date the company's published entry last changed. On the first run it takes the same source date. An unchanged entry keeps its date on every refresh, so a refresh with nothing new rewrites nothing. An entry whose content changed takes the day of that refresh.
- Both are stored in `data/companies.json`, not worked out in the browser.

**Rejected.** Hiding the date to keep the rows short: that is exactly the silent staleness decision 5 warned about. Also rejected: sorting by best match when searching. The owner asked for most followed first everywhere, and best match is one choice away in the sort menu.

**Consequences.**
- **Counts are rounded.** They arrive already rounded ("24K followers"), so they are stored as those rounded numbers and shown the same way.
- **Only real counts are read.** A few source cells hold a sentence containing the word "followers" rather than a count; those give no count.
- **The download grew slightly.** The first file went from 358 KB to 401 KB gzipped, within its budget.
- **Name searches.** A search for a company by exact name may list a more-followed partial match above it, until the order is changed to best match.

---

## 19. Associated member counts shown as a dated snapshot

**Decision.** Publish each company's associated members count, the number of people whose public profile lists the company, beside its follower count. It carries the date it was first recorded here. Rows, landing pages, map popups and exports show it. The default order stays most followed first.

**Why.** The owner asked for it. Follower count measures an audience; associated members come closer to how many people work at a company. 2,841 of 13,542 companies have a count, all in the twin cities, because the upstream step that fills this column has only run there so far.

**How the date works.** The source has no date for this column. It is filled by a later upstream step than the one the row's own date records, so that date would make the count look older than it is. `membersAsOf` is the day the ingest first saw the count instead. The same count keeps its date on later refreshes, and a different count takes the day of that refresh. The site says "recorded" rather than "counted" for this reason: the count was taken on or before that day.

**Rejected.** Using the row's own date, which predates the count. Showing the count without a date, against decision 5. Ordering by it: four in five companies have no count.

**Consequences.**
- **Last-updated dates.** Adding the field moved the last-updated date of the 2,841 companies with a count to the day it was added. The rest kept theirs, because entries are compared field by field and a field an older entry lacks counts as empty.
- **Shown in full.** The count arrives exact, so it is shown exactly ("757 associated members"), unlike the rounded follower counts.
- **The download grew slightly.** The first file went from 401 KB to 418 KB gzipped, together with each company's number of specialties, which the list uses for its "See all" button. Once every company has a count, the first file is expected near 680 KB, close to its 700 KB budget.
- **A better date is one step away.** If upstream adds a column with the day each count was taken, the header contract stops the run until the column is classified, and `membersAsOf` can switch to it.
- **The count is a link.** "168 associated members" opens the company's page of associated members, which lists the same people, and replaces the separate "People" link; a company without a count keeps an "Associated members" link. The profile platform's own count links to a people search filtered by the company, but that search takes the company's numeric id, and the source carries only the handle. Decision 22 adds the id, so the link opens the filtered search wherever the id is known.

---

## 20. The map: MapLibre and OpenFreeMap, labelled in English

**Decision.** The map view draws vector tiles from OpenFreeMap with MapLibre, in OpenFreeMap's light Positron style, and switches every place and street label to its English or Latin-script name. This replaces Leaflet and the standard OpenStreetMap tiles from decision 17.

**Why.** The owner found the map hard to read. The standard OpenStreetMap tiles label each place in the local script, so Islamabad's sectors and streets appeared in Urdu, and those tiles are images with the labels already drawn in. Vector tiles carry each name in several forms, and the labels are drawn in the browser from whichever form the site asks for. A decoded tile over Islamabad had an English or Latin name for every labelled feature: 16 places, 66 streets and 280 points of interest, with the sectors reading "G-8" and "I-9". OpenFreeMap is free, needs no key and sets no usage limit.

**Rejected.**
- **CARTO's basemaps:** their tiles now carry an "API key required" watermark, and they label in the local script too.
- **Commercial services** such as MapTiler, Stadia and Esri: keys and billing, the same objection as in decision 17.
- **Removing the map,** which the owner offered as the alternative. English labels made it unnecessary.

**Consequences.**
- **Download.** Opening the map costs about 420 KB compressed, against about 45 KB for Leaflet: about 270 KB for the library and about 150 KB for its background worker. The list page loads none of it, and the browser keeps it cached after the first time.
- **The worker is served from `public/maplibre/`.** The library looks for its worker next to its own file, and the bundler moves that file, so `scripts/publish-map-worker.ts` copies the worker from `node_modules` before every dev run and build, and the map points at the copy.
- **Hidden labels.** A name held only in another script, with no English or Latin form, gets no label.
- **Framing.** With areas or a city chosen, the map frames the offices there and still draws the same companies' offices elsewhere. Company markers sit beneath the map's labels, so place names stay readable.
- **WebGL.** MapLibre needs it. Without it, the map frame says so and points to the list.
- **A volunteer-run service.** If OpenFreeMap stops, the style address in `components/ResultsMap.tsx` is the line to change. Its tiles follow the OpenMapTiles schema, which other providers also serve.

---

## 21. Numbered pages instead of endless scrolling

**Decision.** The list shows 10 companies per page by default, with 25, 50 and 100 as the other choices, and numbered pages below it. The page and the page size are part of the URL. Any other change, such as a filter, a search or a new order, returns to page 1.

**Why.** The owner asked for it. The endless list added rows as the visitor neared the bottom, so the footer could not be reached until all 13,542 rows had loaded, and there was no way to return to a place in the list. Each page is a real link, so it opens in a new tab and the back button returns to the previous page. The default was 25 at first; the owner lowered it to 10, as on the profile platform's own search pages.

**Consequences.**
- **Lighter pages.** Fewer rows are drawn at once.
- **The map and export still cover every result,** not only the current page.
- **Phones.** The pager shows one page on each side of the current one, with arrows for previous and next, so it fits on one line. The page-size choice sits beside the page range under the list, since the bar above has no room for it (decision 23).

---

## 22. The numeric company id, for the associated members search

**Decision.** Publish each company's numeric id as `companyId`, read from a new last column of the source, `Company ID`. Where it is known, the associated members count, and the "Associated members" link, open the profile platform's people search filtered to that company, the same page the profile's own count opens. Where it is not, they open the company's page of associated members, as before. The column is optional, so a copy of the source without it still loads.

**Why.** The owner asked for the member count to open exactly what the profile's own count opens. That page is a people search filtered by the company's numeric id (`2529067` for CEQUENS), not by its handle, and no column carried the id. The upstream enrichment reads the same "associated members" link to get the count, so it can keep the id from that link too. The owner is adding that upstream.

**How it arrives.**
- **The source column.** `Company ID`, digits only, appended after the last existing column of every upstream file. The contract in `scripts/ingest/columns.ts` declares it as optional and last, so the 20-column source loads today and the 21-column source loads when it arrives, with no code change.
- **A hand-kept list.** `scripts/ingest/rules/company-ids.json` fills ids the source does not have yet. It holds one, CEQUENS, taken from its profile, so the feature can be checked now. The source's value wins; if the two disagree, the run stops.
- **Only the number is stored.** The search address is rebuilt from it in `lib/links.ts`, so no platform URL enters the dataset.

**Rejected.** Storing the whole search URL: it repeats the same address 13,542 times and carries the platform's name, which RULES.md rule 3 keeps out of the repository.

**Consequences.**
- **Checks.** An id must be digits only, and no two companies may share one: a shared id means one was read from another company on the same page, such as a "similar pages" entry. The ingest sets such an id aside for both companies, whose links then open their own members pages, and the validator fails if one ever gets through.
- **Download.** The id travels in the second file, since only the link needs it; until that file arrives, a row's link opens the members page. At full coverage it adds about 60 KB to that file, within its budget.
- **Arrived on 12 September 2026.** The source's `Company ID` column carried 4,110 ids. Four belonged to the sub-page rows the ingest drops; two companies, `wibbow-technologies-limited` and `wibbowtech`, shared one, which stopped the first run; nothing says which is right, so both are set aside, leaving 4,104. The source's id for CEQUENS matched the hand-kept one, whose entry was then removed; the list is empty. The coverage floor for ids rose from 1 to 4,104.
- **Tested before the column exists.** A temporary 21-column copy of the source loaded with ids from the column, a conflicting id stopped the run, and a duplicated id failed validation. The original file and the dataset were then restored byte for byte.

---

## 23. The interface: one accent, shared controls, and dot maps drawn from the data

**Decision.** The site has one visual system, defined as tokens at the top of `app/globals.css` and used by every page:

- **Colour.** A cool paper ground (`#f6f8f7`), white surfaces for the list, cards and controls, deep Margalla ink (`#0f1f1a`) for text and the footer, and one green (`#19694b`) for every action, link and selection. A highlighter yellow marks search matches. The earlier blue for links is gone, so nothing competes with the green.
- **Type.** Bricolage Grotesque for headings and figures, Geist for everything else, Geist Mono only for city codes and counts. All three are downloaded at build time and served by the site.
- **Controls.** Buttons, selects, the view switch, checkboxes, chips and the pager share one height, one corner radius and one focus ring. Icons come from one set in `components/Icon.tsx`, drawn at one stroke weight.
- **Rows.** Each company has a monogram tile: up to two letters from its name, in one of eight tones picked by its handle, worked out on render (`lib/avatar.ts`). Its links are small buttons with icons. The name has a chevron that shows it opens, and the opened view puts offices beside the full list of specialties, with the dates underneath.
- **City tiles.** The home page shows one tile per city hub, each with a dot map of where that hub's companies are: every office placed at street or area level, grouped to about 400 m, with a crosshair on each city centre. A tile adds or removes that city from the filter. Hub pages show the same map, larger, with the cities named; industry pages show a country map with one dot per city, sized by the offices there. The maps are computed when pages are built (`lib/constellation.ts`) and sent as plain SVG.
- **Around the list.** A sticky header with the city pages, a skeleton in the shape of the list while the files load, "/" to jump to the search box, and a favicon. On a phone the filters open as a full panel with a header and a "Show N companies" button, and the page-size choice moves below the list.

**Why.** The owner asked for the site to look and feel like a finished, modern product at every width. Measured against that, the old pages had five differently styled controls in one bar, underlined blue links repeated in every row, system checkboxes, a phone toolbar that wrapped onto three lines with its labels cut off, a phone filter panel with no way back to the results but closing it, and no favicon.

**Why dot maps rather than photographs or a stock hero.** They are the data itself: each dot is a real office position the map and the distances already use, so the decoration is also a fact about the city. Offices known only by city are left out, as on the map (decision 17); the catch-all hub, which has almost none placed, uses every office it has so its tile still shows its spread.

**Rejected.** Company logos. The source has none. Fetching them from company websites or a logo service would mean a third-party request for every row, broken images for thousands of companies, and a record of what each visitor browsed at someone else's server. Storing them would multiply the download.

**Consequences.**
- **Size.** The home page's HTML is about 11 KB gzipped with the tiles in it, and a hub page with its 100 rows about 31 KB. The site's code is about 195 KB gzipped, as before; the stylesheet is about 9 KB.
- **The development badge** that Next.js draws in the corner of the dev server is turned off in `next.config.ts`, since it sat over the list the owner reviews there.
- **No figure is typed into the pages.** Tile counts, the busiest area on each tile, the stats on landing pages and the dot positions all come from the data files at build time.

---

## 24. A dark theme, a map that counts what shares a spot, and marked search matches

**Decision.** A second pass on the interface of decision 23 added:

- **A dark theme.** Every colour is a token, redefined for a dark ground under `:root[data-theme='dark']` in `app/globals.css`. The ground is a neutral near-black (`#0a0a0a`) with neutral grey surfaces and lines, the same family as the owner's site at ibtisam-iq.com. The owner found an earlier version dim, so the dark theme is tuned to read at a glance: text runs from white through `#d4d4d4` to `#a3a3a3`, never darker for anything meant to be read; green is at full strength (`#1fdc82`) and stays the only accent; company monograms take a bright form of their tone over a tint of it; search matches are a solid highlighter with dark text; and the map cards carry a faint green glow. An earlier version tinted the dark greys green, and the owner found the neutral black more premium. The header is nearly opaque in both themes, so content scrolling under it never shows through where a browser draws no blur. On the dark theme the footer is the page itself, set off by a rule, rather than a band of ink. With no choice made, the site follows the system setting and keeps following it as it changes. A button in the header switches between light and dark; the footer has system, light and dark. The choice is kept in this browser only (`lib/theme.ts`). A short script in the page head sets the theme before anything is drawn, so a dark page never flashes light. The map uses OpenFreeMap's dark style on the dark theme.
- **Offices that share a position become one marker.** Area-level offices all sit at their area's centre (decision 15), so before this a busy area drew dozens of markers exactly on top of each other and a click showed only the top one. Now each position is one marker, larger for more offices, with the count written on it from three up. Its popup lists the companies there and, for an area, offers to narrow the list to it.
- **Search matches are marked** in company names and specialty chips. When the match is in a specialty not on screen, the row names it ("Matched in specialties: Cloud Computing").
- **The row shows why it is listed.** With a city filter, the location chip shows the company's office in that city; with a specialty filter, the chosen specialties come first among the chips.
- **Around the site.** A page for addresses that do not exist, a phone menu with the cities and largest industries, controls that float within reach further down the list (filters, list or map and back to the top on a phone; back to the top elsewhere), keyboard use of the "near" suggestions, Escape to empty a search box, a picture for shared links, a home-screen icon and a web manifest.
- **The footer's columns** are each as wide as their own content and spread with equal space between them, so a column of counts sits just clear of its longest name instead of against the next column.
- **Middle widths.** Between phone and desktop the city tiles stay five across, the filter column narrows, and the toolbar keeps one line by moving the page size under the list.

**Why.** The owner asked for a pass that leaves nothing obvious to improve. Measured against that, the old site had no dark theme on a system set to dark, a map that hid most of the companies in a busy area under one marker, search results that did not show what matched, an unstyled black page for a mistyped address, a tablet layout where the tiles and the toolbar wrapped, and no picture when a link was shared.

**Rejected.** Clustering the map's markers by screen distance. It merges offices at different places into one circle whose position is none of theirs, the same false precision decision 17 avoids. Grouping only offices at the very same position keeps every marker where its offices are.

**Consequences.**
- **Sizes.** The site's code is about 197 KB gzipped, the stylesheet about 11 KB, and the home page's HTML about 14 KB with the country map added to its heading.
- **Two map styles.** Switching the theme while the map is open rebuilds the map in the other style.
- **The share picture** is drawn when the site is built, from the same data as the pages, so its count and city figures stay current.

---

## 25. Locations checked against their own address; cities and hubs as data

**Decision.** Three rules govern where an office is placed, and the list of city hubs moves out of the code:

- **A geocoder result must share a name with its address.** For an address that names no well-known place, a result gives area precision only when the address contains the name of an area the result lies in, and street precision only when it also contains the result's own name (a building, or a road inside that area). The area's label is that name as the address writes it. A result that shares no name is set aside and the office stays at city level with its address. The geocoder now stores each result's own name and the names of the areas around it, so the ingest can make this check.
- **The office's city is read with care.** A city name followed by a word such as Road, Chowk or Company names a road or a market, not the city. When an address names two cities, a well-known place it names settles it, then its postal code, then a town written with its larger city ("Wah Cantt, Rawalpindi"), then the first one named.
- **Cities are learned from the data.** A city named in the Operating Location column, or before a province in an address, that the hand-kept table lacks is looked up once by `npm run geocode`. A confirmed city or town becomes a city of its own, recognised only as a whole part of an address, with initials for its short code. A confirmed place within 15 km of a city in the table, or the same place under another spelling, becomes another spelling of that city.
- **The hubs are a rules file.** `scripts/ingest/rules/hubs.json` lists each hub's id, label, the words that put a company in it, and the cities it stands for. The logic of decision 13 is unchanged and the cross-check still passes; a new hub is an entry in the file. `data/hubs.json` carries each hub's cities, and the site reads them from there instead of from code.

**Why.** The owner found a row labelled "Korang Town" whose address says "Pakistan Town Phase 2", and asked for the location logic to be checked as a whole. An audit of every office found three faults:
- 197 of the 237 area labels that came from the geocoder named an area the address never mentions. The geocoder had found the right housing scheme and the label had taken the larger district it sits in, or, as often, it had found a different place altogether: "Sector F-18, Islamabad" labelled as DHA's Sector F, "DHA Phase 5" as DHA Phase II, "Bahria Phase 8" as Bahria Town Phase 2.
- 68 offices were filed under a city named only in a road, such as Peshawar for "Main Peshawar Road, Rawalpindi" and Multan for "Multan Road, Lahore".
- Offices in cities missing from the table, such as Sahiwal and Rahim Yar Khan, fell back to the company's other city, two of them with an area of Lahore.

A shared name is the evidence available that the geocoder's place is the address's place; without it, a position looks precise and may be kilometres off, the false precision decision 15 exists to avoid. The owner also plans to add companies from more cities, and asked that new data never need a code change. Learned cities and a hub file make that true for cities.

**Rejected.** Keeping the geocoder's district name whenever the position looked plausible. The audit showed plausible-looking results were often in the wrong place, and a label the address does not contain cannot be checked by anyone reading the row. Also rejected: a hand-kept list of every Pakistani city. It would need upkeep and would still miss small towns; the data names its cities, and the geocoder can confirm them.

**Consequences.**
- **Fewer placed offices, all of them checked.** 233 offices lost a placement that shared no name with their address and now show at city level with the address kept; 27 gained one, from the new sector points, NASTP and Lahore Cantt, and road names no longer taken for cities; 41 moved to the city their address names; 46 changed area label. Offices placed to a street or an area went from 2,417 to 2,212, and companies usable for distance from 2,276 to 2,099. The coverage floor in `baseline.json` was lowered to match, in the same change. The Area filter went from 224 names to 136: the ones removed were names no address used.
- **19 cities learned** (Attock, Bannu, Burewala, Daska, Ghotki, Gujar Khan, Gwadar, Ismaila, Khanpur, Mansehra, Mingora, Pakpattan, Phalia, Rahim Yar Khan, Sadiqabad, Sahiwal, Shakargarh, Shorkot, Timergara), 44 cities in all, and one spelling (Hattar, near Taxila). City names are looked up as a structured search, city and country, because a free-text search for "Gujar Khan" returns its railway station. The ingest report counts `citiesLearned` and `notInAddress` on every run.
- **The validator enforces the first two rules** on every office: an office is filed under a city its address names, and a geocoder-derived area is named in its address. Run on the dataset from before this decision, it flagged the faults above.
- **Islamabad's sector grid** was fitted to the 34 geocoded sectors, all within 0.8 km of it. The five sectors the geocoder could not find (D-13, E-10, E-12, F-9, I-12) take their centres from the grid. NASTP, Chaklala and Lahore Cantt have new place lookups that find the old airfield and the cantonment itself.
- **Amends decisions 13 and 15.**


**Amended by decision 29.** A street position needs a building or road the address names, more specific than its area, for offices placed by a well-known place too; a neighbourhood's name stands for its city only when the address names no city.

**Amended by decision 30.** Offices abroad are left out; an operating-location city gets no second office when a street or area address in an unlisted city accounts for it; an address in a place no lookup knows gets no office; a campus names its city.

---

## 26. Filters for size and finer founding years; search that reads words as written

**Decision.**
- **New filters.** Followers, in ranges by powers of ten (under 100, 100 to 1K, 1K to 10K, 10K to 100K, 100K or more, not listed). Associated members, in the usual company size bands (1 to 10, 11 to 50, 51 to 200, 201 to 1,000, more than 1,000, not recorded yet), with a note under the title saying how many companies have a count. Founding years in seven ranges instead of four. "Street or area known", for companies with an office precise enough to measure and draw.
- **Specialties can require all.** With two or more chosen, "Any of these" or "All of these"; the counts follow the choice.
- **Filters keep what still fits.** Adding or removing a city keeps the chosen areas that remain inside the chosen cities, in the filter column, on the city tiles and on the chips. "Clear all" keeps the list or map view and the page size. Adjacent chosen ranges show as one chip ("10K or more followers"). The search box inside a filter group ignores dashes and accents.
- **Search reads words as written.** C#, F#, C++, .NET, sector codes and JavaScript libraries written with ".js" are each one word, in the index and in the marks. Words listed as exact in `search-synonyms.json` never match the start of a longer word. A wrong letter is forgiven only in a word fewer than three companies use. The index code moved to `lib/search-index.ts` and `lib/search-text.ts`, so the tests run the real search.

**Why.** The owner noticed that follower count, the directory's own measure of size, could order the list but not filter it, and asked for a full audit of the filters and search. The filter rules proved correct against a separately written version over 600 random combinations. The search did not: "java" found JavaScript companies, "C#" searched for the letter c, ".net" matched every network company, "F-7" matched any address with an F and a 7, and typo tolerance made "node" find "code". A search that returns the wrong companies is worse than one that returns fewer, because a visitor cannot tell.

**Rejected.**
- A slider for follower counts. It hides how many companies each position leaves, needs fine control on a phone, and the counts are rounded anyway; ranges with counts beside them answer the same question at a glance.
- Ordering by associated members, as in decision 19: four in five companies have no count. Filtering by it is different, because "not recorded yet" is a range of its own and the note says how much is covered.
- Joining industries with similar names. The source uses older and newer names for related fields; joining them would be a guess, and `industry-aliases.json` can do it later as a deliberate data change.
- Dropping prefix matching for three-letter words, which would have fixed "pos" and "sap" but lost "web" finding "website" and "llm" finding "llms". A short list of exact words fixes the few real traps.

**Consequences.**
- **Old links keep working.** Links made with the old founding ranges ("2020 onward") open the ranges that replaced them.
- **Search counts changed.** "java" went from 63 to 37 companies, "C#" from 163 to 10, ".net" from 503 to 52, "node" from 170 to 65, "web3" from 815 to 26. Typos such as "kubernets" and "wordpres" still find their words.
- **The download did not grow.** Follower and member counts were already in the first file; the ranges are worked out in the browser.
- **Amends decision 16.** The default order of decision 18, most followed first, is unchanged.

---

## 27. Where a company is run from, not only where its headquarters is listed

**Decision.** Every company carries `origin`, one of four kinds, and `originBasis`, the evidence for it, worked out by `scripts/ingest/origin.ts` from the rules in `scripts/ingest/rules/origin.json`:

- **A Pakistani company**: its headquarters is in Pakistan.
- **Pakistani, registered abroad**: its headquarters is listed abroad, and the data shows it is run from Pakistan.
- **International, with an office in Pakistan**: it is based abroad by its own account, and has an office here.
- **Registered abroad, base unclear**: its headquarters is listed abroad, and nothing in the data says where it is run from.

The first rule that applies decides, facts before claims: a hand entry in `rules/origin.json`; a headquarters in Pakistan; a description saying the company is based in Pakistan; a headquarters at a company-registration address (Wyoming, Delaware) with every office in Pakistan; a Pakistani company form, such as (Pvt) Ltd or SMC, in its name or description, or a registration body such as SECP; a website ending in .pk; its office in Pakistan labelled as its head office; and last, a description saying it is based abroad. A company form found only on an office's label, beside a description placing the company abroad, marks a subsidiary here of a company based abroad. Statements about clients, teams, leadership or offices ("clients based in the US", "UK-based leadership") are not statements about the company. The filter "Where it is run from" replaces "Headquarters: Any, In Pakistan, Abroad"; rows name the kind and the country, and the details give the reason in a sentence. `rules/origin.json` names the home country and its evidence (places, company forms, website endings), so a directory for another country is a new entry there rather than new code.

**Why.** The owner pointed out that the listed headquarters misleads. Many companies run entirely from Pakistan register abroad, often in the United States, and list that address as their headquarters; others are genuinely foreign companies that opened an office here. The old filter put both under "Abroad". Profiling the 2,203 companies headquartered abroad showed the size of it: the most followed among them are nearly all run from Pakistan (VentureDive, ArhamSoft, BrainX, Xgrid), and 165 list one of the addresses in Wyoming or Delaware where companies from anywhere register without being there. The source has no column for where a company is run from, so the answer has to be read from evidence, and shown with it.

**Rejected.**
- **Guessing the unclear ones.** Most companies headquartered abroad here are probably run from Pakistan, but "probably" would repeat the fault the owner raised, a label that sounds sure and may be wrong. They stay "base unclear" until evidence or a hand entry settles them.
- **Trusting "US-based" in a description first.** Many companies run from Pakistan describe themselves that way. It counts, but last, after every harder fact.
- **Follower counts as a sign of an international company.** The most followed company registered in California, VentureDive, is run from Karachi.
- **Reading company size bands.** They are volatile (decision 5) and filled for a quarter of companies.

**Consequences.**
- **The first run.** 11,403 Pakistani companies, 359 Pakistani and registered abroad, 147 international, and 1,633 unclear. Of the 359: 165 by a registration address, 91 by an office labelled head office, 67 by a company form, 31 by their own description, 4 by a .pk website, and 1 by hand; of the 147, 145 by their own description and 2 by hand.
- **The description is read but never stored.** Its column changes from excluded to derived in the column contract; only the resulting kind and the name of the evidence are published.
- **Old links keep working.** `?hq=local` opens Pakistani companies, and `?hq=foreign` the three kinds abroad.
- **Last-updated dates do not move** for a change in `origin`, which is worked out rather than written by the company.
- **The validator checks it.** A Pakistani company has a headquarters in Pakistan and the reverse, unless settled by hand; every hand entry names a company in the dataset.
- **Three companies are settled by hand to begin with**: VentureDive (run from Karachi), Bayt.com and CEQUENS (international). The owner can add more, one line each.
- **Amends decisions 12 and 13.**


---

## 28. Pages for every city, area and industry, each describing itself to search engines and chat apps

**Decision.** Every page builds its whole head from `lib/seo.ts`: a title that fits in about 60 characters, a description of at most 160 with the facts first, its own canonical address, the Open Graph tags chat apps read (`og:title`, `og:description`, `og:url`, `og:image`), and a `summary_large_image` card for X. One list, `lib/landing.ts`, names every landing page; the pages, their preview pictures, the sitemap, the index at `/companies`, the unit tests and `npm run check:seo` all read it. The list holds a page per city hub, per city a hub does not stand for on its own (`/companies/islamabad`), per area (`/companies/islamabad/blue-area`) and per industry, read from the data files. A page with fewer than 5 companies (`MIN_INDEXED` in `lib/site.ts`) is built but marked noindex and left out of the sitemap. Each landing page has its own 1,200 by 630 preview picture, drawn at build time by `lib/og.tsx`. Structured data in JSON-LD: `WebSite` and `Dataset` on the home page, `BreadcrumbList` and `CollectionPage` on the others. robots.txt closes the directory's filter addresses (`/?...`) and nothing else. The sitemap dates each page by the last change to one of its companies. The site's address lives only in `lib/site.ts`. Ownership codes for Google Search Console and Bing Webmaster Tools are optional settings, `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION`. A new directory filter, `in=` a city, lets a city page open exactly its companies; it has a chip but no group in the filter panel.

**Why.** The owner asked for the site to be found on Google and to show a proper card when shared on WhatsApp. Checking the built pages the way a crawler and WhatsApp read them found that every city and industry page carried the home page's preview text (Next.js keeps a parent's Open Graph tags when a page sets only its title), that no page had `og:url`, which WhatsApp requires, that the home page named no canonical address though every filtered address is a copy of it, that there was one picture for every page and no structured data, and that nothing matched a search for Islamabad alone, Rawalpindi, a smaller city or any area. Searches for companies in Pakistan name a place: "software houses in Islamabad", "IT companies in Johar Town". A page per place answers such a search with that place's companies. Titles use "software houses", the term people in Pakistan search with, beside "IT companies".

**Rejected.**
- **A keywords tag.** Google has ignored it since 2009, and a long one reads as spam.
- **A page per company.** Decision 3 still holds.
- **A page per specialty, for now.** Near-duplicate specialties ("AI" and "Artificial Intelligence") would make near-duplicate pages that compete with each other. Merging them in `rules/tag-aliases.json` comes first; the list can then take specialty pages with no other change.
- **Pictures drawn on request.** A picture drawn when first asked for would run on Vercel's servers, which do not carry the data files; every picture is built with the pages instead. Next.js builds a picture ahead of time only when its description (`og:image:alt`) is fixed, so all landing pictures share one description of what they show.
- **Leaving thin pages out altogether.** A town with one company still deserves a page for anyone following a link to it; it only does not deserve a search result.
- **Closing more of the site to crawlers.** Scripts, styles and `/data/` stay open: a crawler needs them to draw the directory.

**Consequences.**
- **249 pages and 241 preview pictures**, from 71 pages and 1 picture: 5 hubs, 41 cities, 136 areas, 57 industries, the index, the home page and the not-found page. 141 are in the sitemap and search results; 100 are kept out for having fewer than 5 companies. Pictures are 30 to 66 KB, against WhatsApp's 600 KB limit.
- **The owner's steps after publishing** (REFERENCE.md section 8): Search Console with a DNS record, the sitemap submitted, the first pages requested, Bing imported from Search Console.
- **`npm run check:seo`** checks a running copy: robots.txt, the sitemap, every page reached by links, every picture. The first run found the missing index picture and a description one character short; both fixed.
- **On phones, landing pages gained the space above their first cards.** A phone rule for `.container` reset vertical padding along with side padding.
- **Amends decision 3**: landing pages exist per city, area and industry.

---

## 29. Faisalabad placed to its neighbourhoods; a street position needs a building or road the address names

**Decision.** The upstream enrichment of Faisalabad's 726 companies rewrote their offices as full addresses, several per company where they have several. Taking it in led to four rule changes, each for every city:

- **A street position needs a building or a road the address names, more specific than its area** (`streetName` in `scripts/ingest/offices.ts`). The lookup result's own name must be written in the address; the result must be a building, a named road or a similar feature, not a land-use outline (a market zone, an industrial estate); and its name must not be the area's own name. This applies to offices placed by a well-known place as well as to any other lookup. Before, an office placed by a well-known place took street precision from any street-type lookup result within 1.5 km, whatever it was.
- **A neighbourhood's name stands for its city only when the address names no city.** `city-centroids.json` separates a city's names (`keywords`) from names of places inside it (`neighbourhoods`, eleven for Karachi). "Tariq Road" alone is in Karachi; "Tariq Road, Faisalabad" is in Faisalabad, which has one too. Neighbourhood names are no longer treated as city names, so a lookup may name them as areas.
- **A chain of city names ending in Road is a road.** "Lahore - Sheikhupura - Faisalabad Rd" names no city; the postal code places the office. `roadTowns` in `city-centroids.json` lists the towns whose names appear only in road names.
- **Faisalabad's centre is its Clock Tower** (31.4187, 73.0791). The earlier point lay 6 km north-east of the city's offices, where every office known only by the city was drawn.

Faisalabad's known places grew from 4 to 23, each looked up once and checked by hand against its name and position: Kohinoor City (with Kohinoor One, Kohinoor Plaza and Mediacom Plaza, which the addresses place there), Madina Town (with Susan Road and Chenab Market, which the addresses pair with it), D Ground (with Regent Mall and ChenOne Road), Peoples Colony, Civil Lines, Batala Colony, Samanabad, Sant Pura, Jinnah Colony, Muslim Town, Pearl City, Millat Town, Kehkashan Colony, Ghulam Muhammad Abad, Gulfishan Colony, Chenab Gardens, Abdullah Garden, Eden Valley, Gulberg, Abdullah Pur, Khayaban Colony, Gulistan Colony and Kohinoor Flats. A neighbourhood named with the larger one it lies in wins ("D Ground Block B, People's Colony No 1" is D Ground).

**Why.** The owner asked for every Faisalabad entry, and every location, to be handled correctly, multiple offices included, after earlier labels had been wrong. Auditing the import office by office found:
- 529 of the 538 street positions set through a well-known place were not the office at all: a hostel for every "Gulberg Greens, Islamabad" address, a shop called Asif Computers for Gulberg III offices in Lahore, a car park for NSTP, a restaurant for "310-D, Millat Town", a point on Susan Road or Jinnah Avenue for any office on those long roads. The rule had never checked the result against the address.
- Four Faisalabad offices were filed under Karachi, two through "Tariq Road" and two through "Nazimabad", each with a phantom Karachi area.
- Faisalabad had 4 known places against Islamabad's 56, so 732 of its 759 offices sat at the city centre, itself 6 km off.

**Rejected.**
- **Keeping the nearby result at street precision "because it is close".** Close to the area centre is not the office; the area centre already says that much, at area precision.
- **Places for every name in the data.** Names the geocoder cannot find (Al Hamra Town, Model Town in Faisalabad, which returned a school 77 km away) stay at city level; a place is added only when its own lookup returns that name.
- **Roads as areas in general.** Susan Road, ChenOne Road and the Kohinoor plazas are matched to their areas because the addresses themselves write them together; Canal Road, Jaranwala Road and Sargodha Road run across the city and are not.
- **Running the upstream city-hub script.** Upstream's slice files were not regenerated after its Faisalabad sync, so the cross-check fails for the Faisalabad companies whose new offices qualify them for Twin Cities, Lahore, Karachi or multi-city under upstream's own rule (Sarzone, Sitara Innovations, ARC, Aims Technologies and others), and for two whose headquarters changed (Techloset, now Sacramento; Sacracks, now Faisalabad). The fix belongs upstream: running `generate_city_hubs.py` there.

**Consequences.**
- **Precision, whole dataset.** Street 533 to 52, area 1,679 to 2,404, city 11,776 to 11,554, of 14,010 offices. Companies usable for distance 2,099 to 2,334. Every street position now names its building or road.
- **Faisalabad.** 252 of its 730 offices placed to a neighbourhood or a street, up from 27, in 29 areas. The Area filter lists 164 areas (136 before); eight Faisalabad areas have pages in search results.
- **The lookup cache refilled names** for 1,106 older results, which the new rule needs; `npm run geocode` now refills any stored result without names.
- **Tests.** `scripts/tests/faisalabad.test.ts` checks Faisalabad's addresses against the real rules files; `offices.test.ts` covers neighbourhood names and the street rule.
- **Amends decisions 15 and 25.**

**Amended by decision 30.** The audit's claim that upstream's Hyderabad bug touched no row was wrong: two Indian offices had come in as Hyderabad, Sindh. Bare "DHA", "Defence", "Commercial Zone", "Canal" and lettered blocks name no area or building.

---

## 30. Lahore placed to its neighbourhoods; offices abroad left out; an operating location that repeats an address's city

**Decision.** The upstream enrichment of Lahore's 3,503 companies rewrote their offices as full addresses, as Faisalabad's were (decision 29). Taking it in added these rules, each for every city:

- **Offices abroad are left out.** The source sometimes lists an office outside Pakistan among the Pakistani ones. An address that names a foreign country or city as a whole part and no Pakistani city is abroad (`abroad` in `city-centroids.json`: "..., Dubai, 413098", "London"); so is an address naming Hyderabad with a six-digit postal code, India's form ("Gachibowli Hyderabad, 500032"; Sindh's Hyderabad is 71000). The city the source then lists as an operating location for such an office gets no office either.
- **An operating-location city that repeats an address's city gets no second office.** The source writes each office's city twice, in the address and in Operating Location, and the second sometimes names the same place another way: "Chandni Chowk, Rawalpindi" with Islamabad, "Wah Cantt, Rawalpindi" with Rawalpindi. A city in Operating Location that no address is in still gets a city-level office, unless street or area addresses in cities Operating Location leaves out account for every such city. An address of city names alone ("Hyderabad/Karachi, Sindh") locates nothing and stands in for no other city.
- **An address that names no city as an address does** takes the one operating-location city whose name it still contains ("Lahore District", "Okara Campus", "Gujar Khan Office") before falling back to the company's first operating city. When an address names two cities, a campus named after one of them settles it ("COMSATS University Islamabad, Lahore Campus").
- **Place matching reads spellings as one** (`placeText` in `scripts/ingest/offices.ts`): "PhaseII", "Phase2", "Pahse 5", "Ph 8", "D.H.A.", "Defense", and a phase's sub-block as the phase ("Phase 6C" is Phase 6). A phase written without the word ("DHA IV", "DHA 2") is an explicit spelling of each DHA place, as Islamabad's already were, not a general rule: read generally, "DHA 1 Sector F, Bahria Phase 7" matched Bahria Town Phase 1.
- **Links in the specialties text are dropped**, item by item; two companies list their social pages there.
- **An office in a place no lookup knows gets no office**, rather than the company's first city: Techtis' office in Sanawan had been drawn at Rawalpindi, 500 km away. "Queta" is Quetta, and Lodhran joins the hand-kept city table, since its lookup returns the tehsil.
- **"DHA", "Defence" and "Commercial Zone" alone name no area**, nor does "Canal" or a lettered block ("E Block"), for a lookup's area or building name. DHA spans a dozen phases across 20 km.
- **A foreign headquarters written with its country code** ("London, United Kingdom, GB") takes that country when the lookup finds nothing, unless the text names a Pakistani city, where "GB" and "KP" are provinces.
- **A place can name exceptions** (`except` in `places.json`): names that contain its own but lie elsewhere. Al-Faisal Town is not Faisal Town, Al-Rehman Garden is not Rehman Gardens, DHA Rahbar's own phases are not DHA's Phases 1 to 9, NUST's college on Peshawar Road is not its H-12 campus, and Bahria Enclave is not a phase of Bahria Town. "Defence Road" no longer stands for DHA, and Bahria's misspellings (Behria, Bahira, Bharia, Bahriya) read as Bahria.
- **Twin cities places corrected.** Gulberg Greens' centre had been a girls' hostel in Gulberg Residencia's market, 5 km east of the scheme; it is now the Gulberg Green suburb that its offices' own lookups return. Gulberg Residencia is a place of its own, placed by the Plus Code one of its addresses gives. Ghauri Town is a place, since one of its offices had been drawn at another Ghauri Town, in Attock, 36 km away. "Civic Center" with Bahria Town, or with Phase 4, is Bahria Town Phase 4, and "Civic Center" alone names no area. These places lie on the line between Islamabad and Rawalpindi and match in either; an office keeps the city its address names.

Lahore's known places grew from 22 to 60, each looked up once and checked against the name its lookup returned, its distance from the city centre, and the offices whose own lookups agree with it: Muslim Town, Paragon City, PIA Housing Society, DHA Phase 12 (EME), Nawab Town, Kot Lakhpat, Canal View, Revenue Society (which the addresses also call BOR Society), Sabzazar, New Iqbal Park, Ali Town, Lake City, Upper Mall, Shadman, Harbanspura, Mustafa Town, Mughalpura, Thokar Niaz Baig, NESPAK Society, Ichhra, Tajpura, Punjab Cooperative Housing Society, Shah Jamal, Tech Society, Rehman Gardens, Izmir Town, Fazaia Housing Scheme, Chinar Bagh, Askari 11, Mozang, UET Housing Society, Guldasht Town, Garhi Shahu, Wafaqi Colony, Green Town, Muhafiz Town, Super Town and Bahria Orchard, a scheme of its own 8 km from Bahria Town, where it had been drawn. Buildings and markets that the addresses themselves write with their area stand for it: Siddique Trade Center, High Q Tower, Tricon Corporate Centre, IT Tower, Al Hafeez Heights and Firdous Market in Gulberg; Haly Tower in DHA Phase 2; Barkat Market and Aibak, Babar and Tipu Blocks in Garden Town; Emporium Mall in Johar Town. DHA's central commercial areas ("17 CCA, Phase 4") are DHA's. Twenty-two more were tried and left out, their lookups finding nothing or something else, some after a second query: Airline Housing Society, Aitchison Society, OPF Housing Scheme, Architects Engineers Housing Society, Etihad Town, Park View City (which returned Park View Villas, another scheme), Central Park (a park, not the housing scheme), DHA Phase 11 (plain "DHA" near the city), Iqbal Avenue, PGECHS, PCSIR, NFC Society, State Life, Jinnah Town (a shop), Canal Garden (a canal), Shalimar Town (a road 16 km out), Abdalians, Nasheman-e-Iqbal, Aabpara, Pak Arab, Kibriya Town and Marghzar. Their offices stay at city level.

**Why.** The owner asked for every Lahore entry, and every location, to be handled correctly, several offices per company included, with Lahore's areas added. Auditing the import office by office found:
- Two Indian offices, Gachibowli and Begumpet in Hyderabad, listed as Hyderabad, Sindh, and a Dubai office filed under Karachi. The Faisalabad audit had missed the first two because it compared each company's Operating Location with its addresses, and the upstream bug writes the same city into both.
- 23 extra offices at a city centre, each the same office as one of its company's addresses under another city name, and 6 offices drawn in a company's first city because their own town is one no lookup knows.
- 767 of Lahore's 2,309 street or area addresses named no place the rules knew, many of them in spellings of places they did know.
- A bare "DHA" taken as an area, twice before this import and more with it, and three street positions that were a canal or a lettered block rather than the office.
- A re-check the next day compared each placed office with its own lookup, and read the word written before every matched place name. It found Al-Faisal Town, Al-Rehman Garden, DHA Rahbar and a Defence Road scheme matched to places they only share a word with; Bahria Orchard drawn at Bahria Town; Gulberg Greens' centre 5 km off for its 109 offices; one office at a Ghauri Town in Attock; and a Bahria Enclave office pulled into Bahria Town by the new Civic Center rule. The same check found that no twin cities, Lahore or Faisalabad row had changed upstream since the import: the 94 rows upstream's Karachi run had rewritten since were all Karachi companies.

**Rejected.**
- **Preferring the operating location when an address names two cities.** Tried first; it moved "Wah Cantt, Islamabad" to Islamabad and "Daftarkhwan, Old Airport Road, Rawalpindi, Islamabad" to Islamabad, where the address was right.
- **Roads as areas.** Jail Road, Multan Road, Ferozepur Road, Raiwind Road and Canal Road run across the city; offices on them stay at city level unless their own lookup finds a building the address names.
- **Liberty Market as part of Gulberg.** It has an area of its own that the geocoder finds.
- **Waiting for Karachi.** Upstream started its Karachi enrichment during this import; the master taken in is the one written before it, with 98 Karachi rows already filled from upstream's own Lahore, Faisalabad and twin cities results.

**Consequences.**
- **Lahore.** 1,907 of its 3,560 offices placed to a neighbourhood or a street, up from 447, in 71 areas (35 before); 39 Lahore areas have pages in search results. 215 Lahore companies list several addresses, 259 have offices in several cities, each office placed on its own.
- **Whole dataset.** Street 52 to 66, area 2,404 to 3,959, city 11,554 to 10,171, of 14,196 offices. Companies usable for distance 2,334 to 3,801. Offices abroad left out: 6. Operating-location cities not given a second office: 23. Offices in a place no lookup knows, left out: 6 (Sanawan, Iskandarabad, Saadatpur, Dhulli, and Karimabad and Murtaza Abad in Hunza). Areas 164 to 201, cities with an office 44 to 54. The site builds 316 pages, 174 of them in search results. The second data file grew to 605 KB gzipped, past its 600 KB budget, and the budget rose to 700 KB, the first file's; Karachi's enrichment will bring both near their budgets.
- **Tests.** `scripts/tests/lahore.test.ts` checks Lahore's addresses against the real rules files, the rules for offices abroad and for operating locations included; `twin-cities.test.ts` the twin cities places corrected; `fields.test.ts` covers links in specialties.
- **Amends decisions 25 and 29.**
