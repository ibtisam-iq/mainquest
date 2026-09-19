# Data model

The shape of the published dataset and how each field is derived. Everything here was measured against the full source file of 13,557 rows.

## The source file

One CSV file with 20 columns, soon 21, UTF-8 with a byte order mark, one company per row and every cell on a single line. It is the master file of the upstream pipeline. Every other file that pipeline produces is a subset of its rows, identical field for field, so this single file is the only input.

It is copied to `data/raw/companies.csv`, which git ignores, and it never enters the repository. Its header and three of its columns carry the source platform's name and URLs, it holds long third-party description text, and it records values that must not be published. The ingest publishes a cleaned file instead. See RULES.md rule 3 and decision 12.

Columns are matched by position, never by header text. `scripts/ingest/columns.ts` declares all 21 with what happens to each. The 21st is optional, so a copy without it still loads:

| Position | Column | Disposition |
|---|---|---|
| 1 | Company Name | published as `name` |
| 2 | Tagline | excluded, decision 14 |
| 3 | Website | published as `website`, cleaned |
| 4 | the profile URL | the handle is derived from it; the URL is never stored |
| 5 | Industry | published as `industry`, a slug |
| 6 | Company Size | excluded, decision 5 |
| 7 | Associated Members | published as `members`, dated when first recorded; decision 19 |
| 8 | Founded | published as `founded` |
| 9 | Company Type | excluded, empty in every row of the source |
| 10 | Specialties | published as `specialties`, and as `tags` |
| 11 | Global Headquarters | `hq` and `hqCountry` are derived; the text is never stored |
| 12 | Operating Location (Pakistan) | `hubs`, `multiCity` and office cities are derived |
| 13 | Pakistan Office Full Address | published as office addresses, cleaned |
| 14 | Followers | published as `followers`, with the date it was counted; decision 18 |
| 15 | Verified | excluded: set for 12 rows and unreliable |
| 16 to 18 | jobs, people and office-locations URLs | excluded, decision 6 |
| 19 | Description | never stored (decision 12); read only for what a company says about where it is based, which sets `origin` (decision 27) |
| 20 | a trailing date column | the day the row was counted: dates the follower count, and seeds `updated` |
| 21 | Company ID | published as `companyId`; optional, added upstream after this contract was written; decision 22 |

A new, renamed or reordered column stops the ingest until it is classified in that file, so nothing reaches the site by default.

## The published record

`data/companies.json` holds one record per line, sorted by handle. A synthetic example:

```json
{"handle":"acme-labs","companyId":"1234567","name":"Acme Labs","industry":"software-development","hubs":["twin-cities"],"hq":"local","hqCountry":"pk","origin":"local","originBasis":"headquarters","multiCity":false,"website":"https://acme.example/","founded":2016,"followers":2400,"followersAsOf":"2026-09-03","members":18,"membersAsOf":"2026-09-10","tags":["web-development"],"specialties":"Web Development, Mobile Apps","offices":[{"city":"islamabad","area":"islamabad:blue-area","lat":33.71,"lon":73.06,"precision":"area","address":"Plaza 5, Blue Area, Islamabad"}],"updated":"2026-09-10"}
```

| Field | Derived from | Notes |
|---|---|---|
| `handle` | profile URL | Primary key, decision 7. Stored URL-encoded, so it is always ASCII and goes into a link unchanged. A row whose URL points at a sub-page rather than a company is dropped |
| `companyId` | Company ID | The company's numeric id on the profile platform, digits only, or null. Used only to build the associated members link. Filled from the source column, or from `scripts/ingest/rules/company-ids.json` where the source has none yet. Unique across companies: an id two companies share is kept by neither. Decision 22 |
| `name` | Company Name | Display only. Not unique. A name with no letter or digit, or page interface text such as "0 notifications", falls back to the handle (5 companies) |
| `industry` | Industry | Slug. Labels and counts in `data/industries.json`. 57 values, shipped as the source states them. Four companies whose industry field held page interface text are listed as "Industry not listed" |
| `hubs` | location, address and headquarters text | One or more hub ids from `scripts/ingest/rules/hubs.json`: today `twin-cities`, `lahore`, `karachi`, `faisalabad`, and `other-cities` for the rest. Decisions 13 and 25 |
| `hq` | headquarters text | `local` or `foreign` |
| `hqCountry` | headquarters text | Two-letter country code. `pk` for local companies, geocoded for foreign ones, null when unresolved. A headquarters the lookup could not place but which names a Pakistani city is `pk` |
| `origin` | headquarters, description, name, website, office labels | Where the company is run from: `local`, `registered-abroad`, `international` or `unclear`. Decision 27 |
| `originBasis` | the same | The evidence `origin` rests on: `headquarters`, `owner` (settled by hand in `rules/origin.json`), `described-here`, `described-abroad`, `registration-address`, `company-form`, `website`, `office-label` or `none`. Neither field moves a company's `updated` date |
| `multiCity` | location text and hubs | True when a company sits in two or more hubs or lists two or more locations |
| `website` | Website | http or https only, tracking parameters removed, links back to the profile host dropped |
| `founded` | Founded | Year from 1900 to the current year, otherwise null |
| `followers` | Followers | Whole number, already rounded at the source ("24K followers" is 24000). Only a count at the end of the cell is read; a sentence that merely contains the word gives null. 13,443 companies have one |
| `followersAsOf` | trailing date column | The day the count was taken, as `YYYY-MM-DD`. Present exactly when `followers` is |
| `members` | Associated Members | Whole number: how many people's public profiles list the company. Exact, not rounded. 7,256 companies have one, in the twin cities, Faisalabad and Lahore so far. Decision 19 |
| `membersAsOf` | the previous published file | The day the ingest first recorded this count, as `YYYY-MM-DD`, since the source gives it no date. Kept while the count stays the same; a new count takes the day of that refresh. Present exactly when `members` is |
| `updated` | the previous published file | The date this entry last changed, as `YYYY-MM-DD`. First run: the source date. Unchanged since the last refresh: kept. Changed: the day of that refresh. Entries are compared field by field, and a field an older entry lacks counts as empty, so a newly published field moves the date only where it holds a value. Decision 18 |
| `tags` | Specialties | Specialty labels shared by at least five companies. Labels and counts in `data/tags.json` |
| `specialties` | Specialties | The full text, for search |
| `offices` | address and location | See below |

Fields the upstream pipeline has not filled yet are null. They fill in on the next refresh, and the validator only lets their coverage go up.

### Offices

An office has a city, an optional area, coordinates, a precision and the cleaned address.

| Precision | Meaning | Source |
|---|---|---|
| `street` | a building or road the address names, more specific than its area | geocoding confirmed by the address (decisions 15 and 29) |
| `area` | a sector, phase, town or neighbourhood the address names | a known place, or geocoding confirmed by the address (decision 25) |
| `city` | known only by city; placed at the city centre | `scripts/ingest/rules/city-centroids.json`, or a city learned from the data (decision 25) |

The address field lists offices separated by `|`, and each becomes one office. An office outside Pakistan, which the source sometimes lists among the Pakistani ones, is left out: an address naming a foreign country or city as a whole part (`abroad` in the city table) and no Pakistani city, or naming Hyderabad with India's six-digit postal code (decision 30). All stored text is cleaned the same way: whitespace collapsed, typographic dashes turned into plain hyphens, and zero-width and replacement characters removed. Address cleaning also removes a trailing "no street address listed" note, links, placeholders such as `Headquarters` on its own, and doubled commas. For geocoding only, leading labels such as `Head Office` or `Lahore Office` and unit numbers such as `3rd Floor` are also removed, because a geocoder matches them against building names.

Before any geocoder result is used, the address is checked against a list of well-known places in `scripts/ingest/rules/places.json`: Islamabad sectors, DHA and Bahria Town phases, and the main areas of Lahore, Karachi and Faisalabad. The comparison reads common spellings as one ("Ph II", "PhaseII", "Pahse 2", "D.H.A.", "Defense", "Behria"), and a phase's sub-block as the phase ("Phase 6C" is Phase 6). A place's `except` names lie elsewhere though they contain its name ("Al-Faisal Town" is not Faisal Town). When an address names one, the office takes that place's centre and its label; when it names a place and a larger one it lies in, the smaller wins. The office's own geocoder result makes it a street position only when the result is a building or a road whose own name the address contains, more specific than the place, within 1.5 km of it (decision 29). Without this step, 17% of Islamabad offices whose address names a sector landed more than 4 km away; with it, none do.

A geocoder result for an address that names no well-known place is used only when it shares a name with the address: the address must contain the name of the area the result lies in (area precision), and for street precision also the result's own name, a building or a road more specific than the area. A land-use outline, such as a market zone, is an area whatever it is named. The area's label is that name as the address writes it, never a district the address does not mention. A result that shares no name leaves the office at city level with its address.

A city is read from the text first, including common misspellings and cities learned from the data. A few neighbourhood names (`neighbourhoods` in the city table, such as PECHS for Karachi) stand for their city only when the text names no city. A city name followed by a word such as Road, Chowk or Company, or by a chain of city names that ends in Road ("Lahore - Sheikhupura - Faisalabad Rd"), names a road or a market, not the city. When the text names two cities, a well-known place it names settles it, then the postal code, then a town written with its larger city (`within` in the city table), then a campus named after its city ("Lahore Campus"), then the first one named. Failing any name, the city comes from the first two digits of a postal code, then from the one operating-location city the text still mentions ("Lahore District"), then from the location column, then from the hub. A location-column city that no address is in gets a city-level office, unless street or area addresses in cities the location column leaves out account for all such cities: the source writes each office's city in both fields, and the location column sometimes names the same place another way ("Chandni Chowk, Rawalpindi" with Islamabad). Five companies name no place more specific than the country and have no office; they appear under "Other cities" and nowhere on a map.

Distance ranking uses only `street` and `area` offices. A `city` office is placed at the city centre, so its distance would mislead.

### Generated at render time, never stored

Four links per company, built from the handle and a base URL held in the `NEXT_PUBLIC_PROFILE_BASE_URL` environment variable:

```
profile  <base><handle>/
jobs     <base><handle>/jobs/
members  <base><handle>/people/
about    <base><handle>/about/
```

When `companyId` is known, the associated members link is the people search filtered to that company instead: the base URL's origin, then `/search/results/people/?currentCompany=` and the id as an encoded one-item list (decision 22).

## What the browser downloads

`lib/payload.ts` splits each record in two, and `scripts/publish-data.ts` writes the halves to `public/data/` before every dev run and build:

| File | Holds | Why separate |
|---|---|---|
| `core.json` | every field except `companyId`, `specialties`, `followersAsOf`, `membersAsOf` and `updated`, each office without its address, and `specialtyCount`, the number of distinct specialties the company lists | enough to list, filter, count and place companies, and to label the "See all" button before the specialties text arrives; the page is usable once it arrives |
| `extra.json` | `companyId`, `specialties`, office addresses, `followersAsOf`, `membersAsOf` and `updated`, keyed by handle | the longer text, used by full search and the expanded company view; loaded right after first render |
| `facets.json` | the six facet files below, together, and the specialty aliases from `scripts/ingest/rules/tag-aliases.json` | filter labels and counts; the aliases let the browser match a company's specialties to its tags when it picks row chips |

The validator enforces a gzipped size budget on the first two.

## Facet files

Each filter reads a small committed file listing its values with counts. `hubs.json` also carries each hub's `place`, the words used for it in sentences on the site, and its `cities`, both copied from `scripts/ingest/rules/hubs.json`. The files are `hubs.json`, `industries.json`, `tags.json`, `areas.json`, `cities.json`, `countries.json` and `origins.json`, which names the four kinds of company from `rules/origin.json` and holds the sentence each piece of evidence gives in a company's details. Areas and cities also carry coordinates, which the "near an area" picker uses.

## Deliberately excluded

| Field | Why |
|---|---|
| Description | 93% of the payload, and third-party text. Decision 12. The ingest reads it only for where a company says it is based (decision 27) |
| Tagline | Third-party text, and the heaviest remaining field. Decision 14 |
| Company size bands | Change constantly. Decision 5 |
| Verified | Set for 12 rows, and not reliable |
| Company Type | Empty in every row |
| Jobs, people and office-location URLs | Regenerated from the handle. Decision 6 |
| Any application status, role, date, contact or note | Private. Decision 8 |

## The views the source already had

The upstream pipeline keeps separate files per city, files split by local and foreign headquarters, and a multi-city file. The site reproduces every one of them as a filter. The cross-check (`npm run crosscheck`) confirmed that each matches the upstream file company for company: 11,326 local, 422 multi-city, and hubs of 4,174 twin cities, 3,508 Lahore, 5,463 Karachi, 739 Faisalabad and 11 other.

## Answers to the original open questions

1. **Description.** Never published. Decision 12; decision 27 reads it, without storing it, for where a company says it is based.
2. **Industry values.** 57 distinct values. That is a usable filter as it stands, so no grouping is applied.
3. **City values.** 270 distinct location strings describe far fewer places. The hub model reduces them to five hubs, and office cities to a short list in `data/cities.json`.
4. **Duplicates.** None on the handle. Fifteen rows pointed at a sub-page rather than a company profile and held sentences in their name, industry and headquarters fields. They are dropped, which leaves 13,542 companies.
5. **Coverage.** Handle, industry and location are present for every company. The upstream address step has so far run for the twin cities, Faisalabad and Lahore; 3,801 companies (28.1%) are placed reliably enough to rank by distance, and 66 offices to a named building or road. Website (7,254, 54%), founded year (6,731, 50%), specialties (4,556, 34%), associated members (7,256, 54%) and company ids (8,218, 61%) exist for the companies the upstream enrichment has reached so far, and grow with each refresh.
6. **The two shapes.** There is one shape, 20 columns.
