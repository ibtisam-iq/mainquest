# Reference

How mainquest works, written in plain language and assuming no prior knowledge of web development.

[README.md](README.md) describes what the project is. This file describes how it is put together and why. [architecture/decisions.md](architecture/decisions.md) holds the full reasoning behind each individual choice, so nothing is repeated here.

---

## 1. Terms used in the rest of this file

**Static site.** The site is built once on a local machine. Building produces a folder of plain files: HTML, CSS, JavaScript, images. That folder gets uploaded to a host, which does nothing clever with it and simply serves those files on request. No program stays running, so there is nothing to crash, and hosting is usually free.

**Server, or backend.** A program that stays running and waits for requests, doing work when one arrives: checking a password, saving a record. One becomes necessary the moment a site has to remember something about a visitor. It costs money or lives inside a free tier with limits, and it is one more thing that can fail.

**Database.** Where a server keeps information that changes. Two families:

- **SQL** (Postgres, MySQL). Fixed shape, decided in advance. Every row of a given kind has the same columns. Suits data with a known structure and clear relationships, such as one account owning many saved records. This is the sensible default.
- **NoSQL** (DynamoDB, MongoDB, Firestore). Flexible shape, rows may differ from one another. Suits very large scale or genuinely unpredictable data. Usually the wrong first choice, since flexibility mostly means structural mistakes surface later rather than immediately.

**API.** A defined entry point on a server that a website calls to ask for something specific.

**Client side and server side.** Client means the visitor's browser. Filtering client side means the browser already holds the data and narrows it instantly. Filtering server side means every click travels to a server and back.

**SPA, single page application.** The browser loads one page plus a large amount of JavaScript, then redraws itself as the visitor navigates instead of loading new pages. It feels fast, but search engines can see an empty page, which makes a pure SPA a poor fit for anything that needs to be found through search.

**Framework.** A set of tools that removes repetitive work. React builds interfaces. Next.js sits on top of React and adds page generation, routing and an optional server.

**Geocoding.** Turning an address written as text into a latitude and longitude, so a computer can measure distances. A geocoder is a service that does this lookup. mainquest uses OpenStreetMap's free geocoder, Nominatim; section 6 explains OpenStreetMap and why it was chosen.

**Cache.** A stored copy of an answer that was slow or costly to get, so it is asked for once. The geocoder's answers are kept in `data/geo/cache.json`, which is committed, so each address is looked up once ever.

**Precision.** How exactly an office's position is known: to the street, to an area such as a sector or a housing society, or only to the city. Section 5 explains how each is decided.

**The address of a page, and what follows the "?".** Every page has an address (a URL), such as `mainquest.ibtisam-iq.com/companies/lahore`. Anything after a "?" is extra information for the page, written as name and value pairs: `?city=lahore&followers=1k-10k` tells the directory which filters to apply. Keeping every choice there is what makes a filtered list shareable as a link.

**Search index.** A search engine does not read every company's text each time a key is pressed. It first builds an index, like the index at the back of a book: every word, with the companies it appears in. A search then looks words up in the index, which takes a few milliseconds even across 13,500 companies. The browser builds mainquest's index when the page opens.

**Filter, and the numbers beside it.** A filter narrows the list to companies with a given value, such as a city or a range of follower counts. Each value is listed with how many companies it would leave, so a choice never leads to an empty page by surprise.

**Rules file.** A small JSON file of hand-kept knowledge the source data cannot carry, such as which cities form a hub or where a sector's centre is. They live in `scripts/ingest/rules/`. Editing one changes the result of the next build without any change to the code.

**Web worker.** A background thread inside the browser. Work sent to it, such as searching thousands of companies, runs without freezing the page the visitor is typing into.

**SEO, crawler, index.** SEO (search engine optimisation) is making pages easy for search engines to find, read and describe. A crawler is the program a search engine sends to fetch pages and follow their links; its index is what it stores about each page, and only an indexed page can appear in results. Section 8 covers how mainquest does it, and the preview cards chat apps draw.

**Map tiles.** A web map is assembled from small squares fetched as the visitor pans and zooms. Image tiles arrive with their labels already drawn; vector tiles arrive as data, and the browser draws them, so it can choose which language to label in. The site uses vector tiles from OpenFreeMap, built from OpenStreetMap data, and labels them in English. Both ask only for the attribution shown on the map.

---

## 2. The system, in four parts

Underneath the website, mainquest is four things in sequence:

1. A copy of the upstream master CSV, kept inside the project folder but never committed.
2. A geocoding step that turns addresses into coordinates, once per address.
3. A script that cleans the copy and turns it into a few JSON files the website can read.
4. A website that loads those files and filters them.

Everything else is detail.

The consequence worth stating plainly: **there is no database and no server.** The company list does not change while somebody is browsing. It changes when a new copy of the source arrives, which happens separately and in advance. So the data can travel with the site as ordinary files. A database is for information that changes while a site is running, and when nothing writes to it, a file does the job.

---

## 3. How it fits together

```
  upstream pipeline         a separate project, collects and enriches the data
        |
        v
  data/raw/companies.csv    one master file, copied by hand; gitignored, never pushed
        |
        v
  npm run geocode           looks up coordinates for new addresses only; results cached in data/geo/
        |
        v
  npm run data              cleans, classifies and validates; offline and repeatable
        |
        v
  data/companies.json       committed; plus small facet files that list filter values
        |
        v
  the website (Next.js)     loads the data in the browser and filters it there
        |
        v
  Vercel                    hosting, free tier, at mainquest.ibtisam-iq.com
```

**One file comes in.** The upstream pipeline also keeps per-city files and splits by headquarters location. All of them are subsets of the master file, identical field for field, so the master is the only thing copied. The ingest rebuilds each of those views itself and checks that the result matches.

**The raw copy never enters git.** The repository is public. The raw file carries fields that must not be published, so it stays in a folder git ignores. The cleaned JSON holds everything the site shows, which means the upstream folder can be deleted once collection is finished.

**JSON is generated.** Browsers read JSON natively. Generating it in a build step means the two formats cannot drift apart, and running it twice on the same input gives byte-identical output.

**Refreshing the data** is a copy and two commands: copy the new master into `data/raw/`, run `npm run geocode` and then `npm run data`, then commit and push. The host rebuilds the site on its own. Section 9 walks through it.

**One list rather than one page per company.** Generating a page per company works at 13,000 entries and produces roughly 3.7 GB of HTML at 130,000, which exceeds what free hosting serves. A directory does not need a page per row. It needs one fast list.

---

## 4. One file in, and what changes when the data grows

The portfolio site reads everything from one file, `projects.yaml`: adding a project means editing that file, and the site picks it up at the next build. mainquest works the same way. Its one input is the master CSV at `data/raw/companies.csv`. A new company, a new city, a new industry or a new specialty in that file reaches the site through the same two commands every time, with no change to the code.

Around that one input sit a few **rules files** in `scripts/ingest/rules/`. They hold knowledge the CSV cannot carry: that "Islamabad" and "Rawalpindi" form one city hub, where the centre of "Blue Area" is, that "web dev" and "web development" are the same specialty. They are data, not code: plain JSON, edited by hand, rarely. The CSV changes with every refresh; the rules files change only when a decision changes.

What happens when a new value appears in the CSV:

| A new... | Appears on the site | What it needs |
|---|---|---|
| Company | Automatically | Nothing |
| Industry | Automatically, in the Industry filter and with a page of its own | Nothing. If one industry arrives spelt two ways, the build stops and names both, and one line in `industry-aliases.json` joins them |
| Specialty | Automatically, as a filter once five or more companies list it; below that, as a plain label that search still finds | Nothing. Two spellings of one specialty are joined in `tag-aliases.json` |
| Headquarters country | Automatically, after `npm run geocode` looks the headquarters up once | Nothing |
| Founding year, website | Automatically | Nothing |
| Follower or associated members count | Automatically, in its range of the Followers or Associated members filter | Nothing |
| Headquarters abroad | Automatically, as one of the four kinds under "Where it is run from", with its reason | Nothing. A company placed wrongly, or left unclear, is settled by hand in `origin.json` (section 7) |
| Street address | Automatically, after `npm run geocode` looks it up once | Nothing. Before that lookup the office shows at city level |
| Area (a neighbourhood, a sector, a society) | Automatically, when an address names it and the lookup confirms it | Nothing. Adding it to `places.json` makes its position exact and its name consistent, and is worth doing for areas many companies share |
| City | Automatically: a city named in the Operating Location column is looked up once and learned, with its own short code; its companies sit in "Other cities" unless they also have an office in a hub city | Nothing. To give the city its own entry in the City filter, its own page and its own tile, add it to `hubs.json` |
| Column in the CSV | Not until it is classified | A line in `scripts/ingest/columns.ts`. This is deliberate: an unknown column could carry information that must not be published, so the build refuses it rather than guessing |

One more stop is deliberate. `scripts/ingest/rules/baseline.json` records the expected size of the dataset, and a build fails when a count moves more than 10% or a coverage count falls. Adding a new city's worth of companies trips it. The message names the number; updating it in `baseline.json` confirms the jump was intended rather than an accident, such as a truncated copy of the CSV.

---

## 5. How a location is worked out

**Two kinds of address.** In the source, an office is written in one of two ways:

- **City only**, such as "Lahore, Punjab". This is most of the data today: the upstream pipeline has filled street addresses for the twin cities, Faisalabad and Lahore, and Karachi is still to come.
- **A detailed address**, such as "Office 14, 2nd Floor, Plaza 82, Sector H, DHA Phase 2, Islamabad".

A company can list several offices, separated by `|` in the CSV, and each is worked out on its own, in its own city. Aims Technologies, for example, lists "ChenOne Road, Regent Mall, Faisalabad", "Sector I-9/2, Street 10, Islamabad" and "Main MM Alam Road, Ali Trade Center, Lahore", and has three offices: D Ground in Faisalabad, I-9 in Islamabad and Gulberg in Lahore.

A city the company names in its Operating Location column that no address covers still gets an office, at city level, with one exception. The source writes each office's city twice, once in the address and once in Operating Location, and the second is sometimes the same place under another name. Orange Technologies lists "Chandni Chowk, Rawalpindi" and gives Islamabad as the operating location; Being Optimizers lists "Wah Cantt, Rawalpindi" and gives Rawalpindi. When street or area addresses in cities the Operating Location leaves out account for every city it names without an address, those cities get no extra office: Orange Technologies has one office there, in Rawalpindi, not a second one at Islamabad's centre. An address of city names alone, such as "Hyderabad/Karachi, Sindh", locates nothing, so it never stands in for another city.

**Offices abroad.** The source sometimes lists an office outside Pakistan among the Pakistani ones, and these are left out. An address that names a foreign country or city as a whole part and no Pakistani city is abroad: D3XTER's office on Sheikh Mohammed Bin Rashid Boulevard, Dubai, and ZiCON's "London". India's Hyderabad is told from Sindh's by its six-digit postal code: ML arteka's "Gachibowli Hyderabad, 500032" is in India. The operating location the source then writes for it ("Hyderabad, Sindh") gets no office either. `abroad` in `city-centroids.json` lists the foreign names. "Dubai Plaza, 6th Road, Rawalpindi" is a building in Rawalpindi and stays.

**Step 1, which city.** The address is searched for the city names in `city-centroids.json` (26 cities, with spellings such as "Islambad" and "Pindi") and for cities learned from the data. Three traps are handled:

- A city name that is part of a road or a market name does not count. "Main Peshawar Road, Rawalpindi" is in Rawalpindi, "15 Km Multan Road, Lahore" is in Lahore, and "Karachi Company, G-9, Islamabad" is in Islamabad. Faisalabad has many such roads, Sargodha Road, Jhang Road, Sheikhupura Road and Jaranwala Road, all of them in Faisalabad. A chain of names ending in Road is one road too: "Lahore - Sheikhupura - Faisalabad Rd" names no city, and its postal code, 38000, places it in Faisalabad. `roadTowns` in `city-centroids.json` lists the towns whose names appear only in such road names.
- A few neighbourhood names stand for their city on their own, such as PECHS or Tariq Road for Karachi (the `neighbourhoods` of a city in `city-centroids.json`). They count only when the address names no city: Faisalabad has a Tariq Road and a Nazimabad too, so "Tariq Road, Faisalabad" is in Faisalabad.
- When an address names two cities, a well-known place settles it first (an address naming PECHS is in Karachi), then the postal code (44xxx is Islamabad, 46xxx Rawalpindi), then a town written with its larger city ("Wah Cantt, Rawalpindi" is in Wah Cantt), then a campus named after its city ("COMSATS University Islamabad, Lahore Campus" is in Lahore), and otherwise the first city named.
- An address that names no city the way an address does takes the one city from the company's Operating Location column that it still mentions ("Lahore District", "Okara Campus"). Failing that, a company with one operating location takes that city, and otherwise its first.

**Step 2, a well-known place.** The address is checked against `places.json`, a list of 168 places many companies share: the Islamabad sectors (F-7, G-9, I-8), DHA and Bahria Town phases, NUST and NASTP, Blue Area, and the main areas of Lahore (60, from Johar Town and Gulberg to Muslim Town, PIA Housing Society and DHA Phase 12), Karachi and Faisalabad (23, from Kohinoor City and Madina Town to Sant Pura and Millat Town). A place matches only when its name, or a landmark the addresses themselves write with it, is in the address: "Kohinoor One Plaza" is in Kohinoor City, "Regent Mall, ChenOne Road" is in D Ground, and Siddique Trade Center, High Q Tower and Tricon Corporate Centre are in Gulberg, because that is how the addresses write them. Common spellings count as one: "Phase II", "PhaseII", "Pahse 2" and "Ph 2"; "D.H.A." and "Defense"; "Gulburg" and "Johartown". A phase's sub-block counts as the phase ("DHA Phase 6C" is Phase 6), and Bahria's misspellings (Behria, Bahira, Bharia) count as Bahria. A place can list names that contain its own but lie elsewhere, and an address naming one does not match it: "Al-Faisal Town" is not Faisal Town, "DHA Rahbar Phase 1" is not DHA Phase 1, and "Defence Road" is a road, not DHA. Places on the line between Islamabad and Rawalpindi (Bahria Town's phases, DHA's, Gulberg Greens, Ghauri Town, NASTP) match in either city, and the office keeps the city its address names. When an address names a neighbourhood and the larger one it lies in, the smaller wins ("D Ground Block B, People's Colony No 1" is D Ground). A match gives the office that place's name and its centre, with **area** precision. Each place's centre comes from its own lookup, checked by hand: the result must carry the place's name and lie in the right city.

The office's own lookup can then make it **street** precision, but only on the terms of step 3: the result is a building or a road whose own name the address contains, more specific than the place itself, within 1.5 km of it. A shop, a restaurant or a hostel that merely lies in the area is not the office. Before 12 September 2026 this check was missing, and 529 offices had been pinned to whatever the lookup found nearby, among them a girls' hostel for every "Gulberg Greens, Islamabad" address and a car park for NSTP.

**Step 3, the geocoder.** An address that names no well-known place was looked up in OpenStreetMap by `npm run geocode`. The answer is used only if it shares a name with the address. OpenStreetMap can return a real place that is not the one the address means, and a name in common is the evidence that it is the same place:

- The result lies in an area whose name the address contains: the office takes that area's name and **area** precision.
- The result is a building or a road whose own name the address also contains (a road needs the area as well), and that name is more specific than the area: **street** precision. A land-use outline, such as a market zone named "I-8 Markaz", is an area, however it is named, and a result named only "office" or "plaza" names no particular building.
- The result shares no name with the address: it is not used, and the office stays at city level.

The area's name therefore always comes from the address itself, never from OpenStreetMap's own districts.

**Step 4, city level.** Everything else is placed at its city's centre with **city** precision: a city-only address, a detailed address the lookup could not confirm, or one not looked up yet. The written address is still shown in the company's details.

**A worked example.** TAK Devs lists one office: "Pakistan Town Phase 2, Office# G43, St# 18, Islamabad, 44000".

- Step 1 finds Islamabad.
- Step 2 finds no well-known place.
- Step 3: the full address finds nothing in OpenStreetMap, so the lookup retries with only the parts that name an area, "Pakistan Town Phase 2, Islamabad". That finds the Pakistan Town housing scheme, which OpenStreetMap files inside a larger district, Korang Town.

The first version of the site took the district's name, so the row read "ISB | Korang Town" although the address never mentions Korang Town. Under the rule above, the office takes the scheme's own name, "Pakistan Town", which the address contains, and the row now reads "ISB | Pakistan Town".

**A Faisalabad example.** Dev House lists one office: "Faisalabad, Pakistan, 7th Floor, Burj ul Kuwait Plaza, P-3B, Kohinoor City, Jaranwala Road, 38000".

- Step 1 finds Faisalabad. "Jaranwala Road" is a road, so Jaranwala does not count.
- Step 2 finds Kohinoor City, written in the address. The office takes Kohinoor City's name and centre, at area precision.
- The office's own lookup found the Faisalabad-Jaranwala Road, which runs for kilometres and is not named in the address as written. It says nothing more exact, so the office stays at area precision.

The row reads "FSD | Kohinoor City", and the office counts towards Kohinoor City's page and its entry in the Area filter. EXESOLS, at "Kohinoor One Plaza, Jaranwala Road", lands in the same place: the addresses write Kohinoor One Plaza in Kohinoor City.

**A Lahore example, with two offices.** Orange Technologies lists "Headquarters, 8, 3rd Floor, RB-1, Awami Complex, Garden Town, Lahore, 54000" and "#9, 2nd Floor, Gulf Plaza, Plot 17-B/1, 4th B Road, Chandni Chowk, Rawalpindi", and gives "Lahore, Punjab; Islamabad" as its operating locations.

- The first address is in Lahore. Step 2 finds Garden Town, so the office takes Garden Town's name and centre, at area precision.
- The second address names Rawalpindi. No well-known place is in it, and its lookup found nothing more exact, so it stays at Rawalpindi's centre, at city level, with its address shown.
- Islamabad, in the operating locations, has no address of its own, and the Rawalpindi address is in a city the operating locations leave out. The two are the same office under two names, so Islamabad gets no second office at its centre.

The company has two offices, "LHR | Garden Town" and "RWP", and appears under Lahore and the Twin Cities.

**What the screen shows.** Each row has a location chip, such as "ISB | Pakistan Town":

- The first part is the city's short code. A learned city gets its initials or first three letters, such as RYK for Rahim Yar Khan.
- The second part is the area, when there is one.
- A "+1" means the company has more offices, listed when the row is opened.
- The dot shows the precision: a solid dot is street, a ringed dot is area, and a dashed outline around the chip is city only.

When a city hub is chosen, the chip shows the company's office in that hub.

**What precision decides.**
- **Near.** Only street and area offices are ranked by distance, to the nearest kilometre for an area. City-only offices appear in a separate group, "exact location not listed", because their distance would be the city centre's and would look precise while being wrong.
- **The map.** Only street and area offices are drawn.
- **The Area filter.** It lists only areas that at least one office has been placed in.

**The numbers today.** Of 14,196 offices, 66 are placed to the street, 3,959 to an area, and 10,171 to a city. 3,801 companies have at least one office precise enough for Near. In Lahore, 1,907 of 3,560 offices are placed, in 71 areas, up from 447 before its addresses arrived; in Faisalabad, 255 of 745, up from 27. Six offices abroad are left out, and six more whose town no lookup knows. Coverage rises on its own as street addresses for more cities reach the CSV.

---

## 6. OpenStreetMap, and the other map services

**What OpenStreetMap is.** OpenStreetMap is a map of the whole world drawn by volunteers, in the way Wikipedia is an encyclopedia written by volunteers. People trace roads, buildings and neighbourhoods from satellite photos and from walking around, and anyone may use the result for free. Its licence (the Open Database License) asks two things in return: credit, which is why "Map data © OpenStreetMap contributors" appears on the site's map and in its footer, and that anyone who publishes an improved copy of the map's database shares it on the same terms. mainquest does not publish a copy of the map, only positions looked up from it, so only the credit applies.

**Why it and not Google Maps.** Google Maps charges past a monthly allowance, needs an account with a payment card and a secret key, and its terms forbid keeping the positions it returns or showing them on any map but Google's. mainquest keeps every position it looks up, in `data/geo/cache.json`, so that each address is looked up once; that alone rules Google out. The paid alternatives have similar terms. OpenStreetMap costs nothing, needs no key or account, and allows keeping what it returns.

**Three separate services, each doing one job.**

| Service | Its job in mainquest | When it runs | Who talks to it |
|---|---|---|---|
| Nominatim | The geocoder: turns an address written as text into a position, and says what kind of place it found (a building, a road, a neighbourhood, a town) | Only when `npm run geocode` runs, on the owner's computer, for addresses not looked up before | The geocode script; never a visitor |
| OpenFreeMap | Hands out the map itself, in small squares called tiles, made from OpenStreetMap's data | Whenever a visitor opens the map view | The visitor's browser |
| MapLibre | A free program that runs in the visitor's browser and draws those tiles, plus the dots for the offices | Whenever the map view is open | Nothing; it is code inside the site |

Nominatim is run by the OpenStreetMap foundation and asks for at most one request a second, which is why a lookup of a few hundred addresses takes about ten minutes. OpenFreeMap is a separate free project that serves ready-made tiles, so the site needs no map server of its own. MapLibre is a library, a piece of ready-made code included in the site, like a part bought for a machine.

**What visitors send and receive.** A visitor's browser downloads the company data from mainquest itself and map tiles from OpenFreeMap. It never sends an address anywhere, and "Use my location" keeps the device's position in the browser: the distance is worked out there, and the position is never sent to any server.

**Its limits.** OpenStreetMap is only as detailed as its volunteers have made it. Pakistan's areas, sectors and main roads are well mapped; individual buildings and street numbers often are not. That is why most offices are placed to an area rather than a street, and why a lookup's answer is used only when it shares a name with the address (section 5).

**If a service went away.** The positions already looked up stay in the repository, so the directory keeps working without Nominatim; only new addresses would wait. If OpenFreeMap stopped, the map view would need another tile service, which is a change to the two style addresses at the top of `components/ResultsMap.tsx`, one for the light map and one for the dark. As volunteers add more of Pakistan to OpenStreetMap, addresses that failed before can be looked up again and placed more exactly.

---

## 7. Searching, filtering and sorting

All of it happens in the visitor's browser. When the page opens, the browser downloads the whole directory as two files: the first holds what the list and the filters need, the second the longer text (specialties and addresses). Every click on a filter is then answered on the spot from that copy, with no round trip to a server. Decision 9 explains why this works at the current size and where its limit lies.

### The search box

The search looks through each company's name, industry, specialties, area and city names, office addresses and website address. A few rules decide what counts as a match:

- **Every word must match.** "cloud lahore" finds companies with both words somewhere in their text, not either one.
- **The start of a word is enough, from the third letter.** "develop" finds "development" and "developers". Two-letter searches such as "ai" must match a whole word, or they would match every word that begins with those letters.
- **A few words must match exactly**, because the longer words they begin mean something else: "java" does not find "javascript", "pos" does not find "postgresql", "sap" does not find "sapphire". The list lives in `scripts/ingest/rules/search-synonyms.json` under `exact`, so adding a word is a data change.
- **One wrong letter is forgiven, only in rare words.** "kubernets" finds Kubernetes, and "wordpres" finds WordPress. A word that three or more companies use is taken as typed, so "node" never finds "code" and "sales" never finds "tales".
- **Synonyms.** "k8s" finds Kubernetes, "js" finds JavaScript, and a whole search of "artificial intelligence" also finds "AI". The groups are in the same rules file.
- **Words with symbols are kept whole.** "C#", "F#", "C++" and ".NET" are searched as written, where plain splitting would have left the letter "c" or the word "net". A sector is one word however it is written: "F-7", "F7" and "F 7" all find the same companies. "Node.js", "NodeJS" and "node js" find each other, and so do the other JavaScript libraries written that way.
- **Accents and styled letters do not matter.** Some companies write their names in decorative Unicode letters; those match plain typing.

A row matched only through its specialties says so ("Matched in specialties: Kubernetes"), and matching words are marked in yellow. The search sits inside whatever filters are chosen. The address bar catches up a third of a second after typing stops, so every search can be shared as a link. The "/" key jumps to the search box from anywhere, and Escape empties it. Until the second file arrives, a few seconds after the page opens, the search covers names, industries, specialty tags and places; specialties text and addresses join when it lands, without losing what was typed.

### How the filters combine

- **Within one group, any.** Ticking Lahore and Karachi shows companies in either.
- **Between groups, all.** Lahore plus the Software Development industry shows companies that are both.
- **Specialties can ask for all.** With two or more specialties ticked, a switch appears under the title: "Any of these" (a company needs one of them) or "All of these" (it needs every one). "React" and "Node.js" with "All of these" finds companies that list both.

### Each filter

- **Near.** A point, from the device ("Use my location") or from a list of every area and city centre, and a distance of 2, 5, 10, 25 or 50 km. Only offices placed to a street or an area are measured; companies known only by city appear in a separate group below, as section 5 explains.
- **City.** The city hubs in `scripts/ingest/rules/hubs.json`: Twin Cities (Islamabad and Rawalpindi), Lahore, Karachi, Faisalabad, and "Other cities". A company joins every hub whose city its operating location, address or headquarters names, so a company in two cities is in both. This rule is copied unchanged from the upstream pipeline, and `npm run crosscheck` proves the result matches the upstream files company by company.
- **Area.** Every area at least one office is placed in, 201 today. It is not a list of all of Pakistan's areas; it holds what the data contains and grows as more street addresses arrive. With a city chosen, it narrows to that city's areas, and adding or removing a city keeps the chosen areas that are still inside the chosen cities. The group shows the eight largest with a "Show N more" button, so "Show 128 more" means 136 in all. Its search box ignores dashes and accents, so "f7" finds F-7 and "gulshan e iqbal" finds Gulshan-e-Iqbal.
- **Industry.** Every industry any company lists, 57 today, as the source names them.
- **Specialty.** Specialties are split from each company's specialties text at the commas, folded to one spelling, and kept as filters when five or more companies share them: 1,121 today, from the 4,556 companies whose specialties are filled so far. Rarer ones stay on the company's row as plain labels, and search finds them all.
- **Followers.** Under 100, 100 to 1K, 1K to 10K, 10K to 100K, 100K or more, and Not listed. Each range includes its lower number: a company with exactly 1K followers is in "1K to 10K". Counts arrive rounded ("24K") and each carries the day it was counted, shown when a row is opened. 13,443 companies have a count.
- **Associated members.** 1 to 10, 11 to 50, 51 to 200, 201 to 1,000, More than 1,000, and Not recorded yet. An associated member is a person whose own profile names the company, which comes closer to headcount than followers do. So far the upstream pipeline has recorded the count for 7,256 companies, in the twin cities, Faisalabad and Lahore, so nearly half sit under "Not recorded yet"; the note under the title says how many are covered.
- **Founded.** 2023 or later, 2020 to 2022, 2015 to 2019, 2010 to 2014, 2000 to 2009, Before 2000, and Year not listed. Links shared before these ranges were split still work: "2020 onward" opens the two ranges that replaced it.
- **Where it is run from.** Pakistani company; Pakistani, registered abroad; International, with an office in Pakistan; and Registered abroad, base unclear. The next part explains how each company is placed. Choosing any of the last three adds a list of the countries their headquarters are listed in.
- **More.** "Street or area known" keeps companies with at least one office placed to a street or an area, the ones that can be measured for Near and drawn on the map. "Website listed", and "Offices in more than one city".

### Where a company is run from

A company's listed headquarters does not always say where it is run from. Many companies run entirely from Pakistan register abroad, often in the United States, and list that address as their headquarters. Others really are foreign companies that opened an office here. The directory tells these apart as far as the data allows, and says why for each company.

| Kind | What it means | Companies today |
|---|---|---|
| Pakistani company | Its headquarters is in Pakistan | 11,403 |
| Pakistani, registered abroad | Its headquarters is listed abroad, but the data shows it is run from Pakistan | 359 |
| International, with an office in Pakistan | It is based abroad by its own account, and has an office here | 147 |
| Registered abroad, base unclear | Its headquarters is listed abroad, and nothing in the data says where it is run from | 1,633 |

**How a company is placed.** The build step checks each company against a list of evidence, in this order, and the first that applies decides. Facts come before claims:

1. **A correction by hand** in `scripts/ingest/rules/origin.json` (below).
2. **A headquarters in Pakistan.** That makes it a Pakistani company, even when the headquarters is a town the upstream pipeline's own rule missed, such as Skardu or Haripur, or is spelt "Karāchi".
3. **Its own description says it is based in Pakistan**: "a Lahore-based software house", "headquartered in the heart of Rawalpindi".
4. **Its headquarters is a registration address.** Sheridan in Wyoming and Dover in Delaware are where companies from anywhere register without being there. A headquarters at one of them, with every office in Pakistan, points to a company run from Pakistan.
5. **A Pakistani company form** in its name or description, such as "(Pvt) Ltd" or "SMC-Private", or a Pakistani registration body such as SECP.
6. **A website ending in .pk.**
7. **Its office in Pakistan is labelled its head office** in its own list of locations.
8. **Its own description says it is based abroad**: "a UK-headquartered systems integrator", "based in Jeddah". This comes last, because many companies run from Pakistan also call themselves "US-based".

Anything else is "base unclear". The directory does not guess, even though most of those companies are probably run from Pakistan, because a confident label that turns out wrong is the very problem this solves. Phrases about someone else do not count: "clients based in the US", "UK-based leadership", "a team of developers based in Lahore".

**What the screen shows.** A row names the kind and the country ("Pakistani, registered in the United States"); a Pakistani company's row says nothing extra. Opening the row adds a sentence with the reason, such as "Its headquarters is listed in the United States, and its own description says it is based in Pakistan." The description itself is never shown or stored; the build reads it and keeps only the answer.

**Correcting a company by hand.** Anyone who knows a company better than the data can settle it in `scripts/ingest/rules/origin.json`, under `companies`, with the company's handle (the last part of its profile address), the kind, and a note saying how it is known:

```json
"venturedive": { "origin": "registered-abroad", "note": "Founded in Karachi, where it is run from; its headquarters is listed in California." }
```

The kinds are written `local`, `registered-abroad`, `international` and `unclear`. The next `npm run data` applies it, the note becomes the reason shown on the site, and the validator fails if the handle is not in the directory. Three companies are settled this way to begin with: VentureDive, Bayt.com and CEQUENS.

**When other countries are added.** Nothing in this logic is tied to Pakistan in code. `origin.json` names the home country and lists its evidence: place names (every city in the city table is added on its own), company forms, website endings and registration bodies. A directory of companies in another country is a new entry there, with that country's company forms and website ending.

**Filters considered and left out.** Company size bands, hiring status and open jobs change too fast to store (decision 5); associated members stand in for size, with their date. The source gives no remote or on-site information and no technology list beyond specialties, which the Specialty filter and the search already cover. The industries include older and newer names for similar fields ("IT Services and IT Consulting" beside "Information Technology & Services"); joining them would be a guess about what each company meant, so they stay as the source wrote them, and `industry-aliases.json` could join them later as a deliberate data change.

### The numbers beside each option

Each number says how many companies the list would show with that option ticked, given everything else already chosen. Within its own group the number ignores the group's other ticks, because ticking another option there widens the list rather than narrowing it. With "All of these" specialties, each specialty's number is how many of the current results also list it. In the lists, an option whose number is zero is hidden unless it is ticked, so ticking a listed option never empties the list. In long lists (areas, industries, specialties) ticked options move to the top, where they stay in view; short lists with an order of their own (cities, the kinds of company, and the ranges) keep that order.

### Chips, clearing and counts

Every choice also appears as a chip above the list, with a cross that removes it. A city page's button adds one filter that has a chip but no group in the panel, "Offices in" a city, which keeps companies with an office in that city whatever their hub. Neighbouring ranges merge into one chip: "10K to 100K" and "100K or more" read "10K or more followers". "Clear all" removes every filter and the search, and keeps the list-or-map view and the page size, which are settings rather than filters. The Filters button on a phone shows how many are active.

### Sorting

The list is ordered by followers, most first, whatever is chosen (decision 18). Other orders sit in the menu beside it: best match (while searching), nearest (with a point chosen), name, and founding year, newest or oldest first. Best match weighs where a word matched: a match in the name counts most, then specialties, then the industry, places, the address and the website.

### Pages, the map and sharing

The list shows 10 companies a page by default, with 25, 50 and 100 as choices. The map view draws every placed office of the current results; offices that share one spot become one numbered circle, whose popup lists the companies there. Everything chosen, from the search to the page number, is written into the page's address, such as `/?city=lahore&specialty=react&followers=1k-10k`. That address can be bookmarked or sent, and opens exactly the same list. Moving between pages adds a step the back button returns through; a filter change replaces the address instead, so the back button does not undo filters one by one.

### Export

The Export button downloads exactly the companies listed, as CSV (opens in a spreadsheet) or JSON (for programs). Each row carries the company's details, its follower count with the day it was counted, its links, and, with a point chosen, its distance.

---

## 8. How search engines and chat apps see the site

Two kinds of programs read the site besides people. Search engines such as Google and Bing send crawlers, programs that fetch pages and follow their links, so the pages can appear in search results. Chat and social apps such as WhatsApp, LinkedIn, X and Slack fetch a page when its link is pasted, to draw a preview card. Both read the page's HTML, the text version of the page, rather than what a screen shows. Every page on mainquest is built ahead of time as finished HTML (a static site, section 1), so both see the whole page, company lists included, without running any code first.

Making a site easy for search engines to find, read and describe is called SEO, search engine optimisation. Nobody can pay for or force a place in Google's results. What a site controls is whether its pages are easy to reach, clearly described, free of duplicates and useful. Everything below serves one of those.

### How a page gets into Google

1. **Crawling.** Googlebot, Google's crawler, fetches a page. It finds pages by following links from pages it already knows, and from the sitemap, the list of pages a site hands it.
2. **Indexing.** Google reads the page and stores what it is about. A page that is in Google's index can appear in results; one that is not, cannot. Google decides what to index, and a new site's pages are usually indexed over days to weeks.
3. **Ranking.** For each search, Google orders the indexed pages it judges most useful. The words on a page, its title, how other pages link to it and how fast it loads all count.

### The parts, one by one

- **robots.txt**, at `/robots.txt`: the rules crawlers read before anything else. mainquest's allows every page except the directory with filters in its address, such as `/?city=lahore&industry=...`. Those addresses are all the same page in endless combinations; letting a crawler fetch them would waste its visit on duplicates, and each city, area and industry already has a page of its own. Scripts, styles and data files stay open, since a crawler needs them to draw a page. The file also gives the sitemap's address. It is built from `app/robots.ts`.
- **sitemap.xml**, at `/sitemap.xml`: the list of pages for search engines, in XML, a text format for data that programs read. It lists 174 pages: the directory, the index of places and industries, and every landing page with at least 5 companies. Beside each is the last day one of its companies changed, so a search engine can revisit only what changed. It is built from `app/sitemap.ts`, from the same list of pages the site builds, so a page can never be missing from it.
- **The title** is the blue link in a search result, and the bold line of a chat preview. About 60 characters of it show. Each page uses its most descriptive wording that fits, with "| mainquest" after it when there is room: "Software houses and IT companies in Lahore | mainquest".
- **The description** is the grey text under the title in a result, and the second line of a preview. About 160 characters show in a result, and about 80 in WhatsApp, so the facts come first. Each is written from the data: the count, then the busiest areas or common specialties.
- **The canonical address.** A page can be reached at more than one address: with filters added, or at the host's own address (`...vercel.app`) as well as the real one. Each page names its one true address in a tag, so a search engine counts all of them as that page instead of as competing copies.
- **Kept out of results ("noindex").** A page listing fewer than 5 companies is too thin to deserve a search result of its own. It still exists for anyone who follows a link to it, but carries a tag asking search engines to leave it out, and is left out of the sitemap: 142 pages today, mostly small towns and rare industries. The threshold is `MIN_INDEXED` in `lib/site.ts`.
- **Headings.** Each page has exactly one main heading (h1) naming its subject, such as "IT companies in Blue Area, Islamabad".
- **Structured data.** A block of facts written for machines in JSON-LD, using schema.org, a vocabulary search engines share. The home page describes the site (a `WebSite`), which lets Google show the name "mainquest" in results rather than the bare address, and the directory as a `Dataset`, which Google Dataset Search lists. Each landing page carries its breadcrumb trail (`BreadcrumbList`), which Google can show in place of the address ("mainquest › Twin Cities › Islamabad › Blue Area"), and says it is a collection of companies (`CollectionPage`). The code is in `lib/seo.ts`.
- **Proof of ownership.** Google Search Console and Bing Webmaster Tools, the free dashboards that show how a site does in search, ask its owner to prove ownership once. A DNS record does it with no code; the alternative is a code placed in the page's head, which the site reads from the settings `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` (listed in `.env.example`).

### The preview card in WhatsApp and other apps

When a link is pasted into WhatsApp, WhatsApp fetches the page and reads four tags from the Open Graph standard, which most apps share: `og:title` (the bold line), `og:description` (the line under it), `og:url` (the address, shown as the site's domain) and `og:image` (the picture). X reads its own `twitter:card` tag and falls back to the same four. WhatsApp's own rules: the three text tags must be present, the page's head must sit within its first 300 KB, and the picture must be under 600 KB and at least 300 pixels wide.

Every page on mainquest has its own four, taken from its own title and description. Every landing page also has its own picture, drawn when the site is built: the count and the place, the three largest groups (areas in a city, specialties in an area, cities for an industry), and the page's dot map, on the dark theme's colours. The home page and the index page have one each as well: 316 pictures, 1,200 by 630 pixels, between 30 and 62 KB each. The drawing is in `lib/og.tsx`.

Apps remember a preview for some time. A page whose preview changed can keep showing the old card in WhatsApp until that memory expires; Facebook's Sharing Debugger and LinkedIn's Post Inspector fetch a fresh copy on request.

### Keywords

People in Pakistan search for companies with a few regular patterns: "software houses in Islamabad", "IT companies in Lahore", "software companies in Karachi", "IT companies in Blue Area". The site uses those words where they are true: titles read "Software houses and IT companies in" a place, headings "IT companies in" it, descriptions name the busiest areas and specialties there, and each city and area has a page and an address of its own (`/companies/islamabad/blue-area`), which is what matches a search for that place.

There is no keywords tag. Google announced in 2009 that it ignores it, and a long one is treated as a sign of spam. Words count through the title, the headings and the text itself, and repeating them beyond what reads naturally counts against a page rather than for it.

### The landing pages

Every page below is built from one list, `lib/landing.ts`, which the pages, their pictures, the sitemap, the index page and the checks all read:

| Kind | Address | Count today |
|---|---|---|
| City hub | `/companies/lahore`, `/companies/twin-cities` | 5 |
| City that is not a hub on its own | `/companies/islamabad`, `/companies/peshawar` | 51 |
| Area | `/companies/islamabad/blue-area`, `/companies/lahore/muslim-town` | 201 |
| Industry | `/industry/software-development` | 57 |
| The index of all of them | `/companies` | 1 |

The list is read from the data files, so a new city, area or industry in the data gets its page, picture and sitemap entry at the next build, with no code change. A city page's "Browse all" button opens the directory with only that city's companies (`/?in=peshawar`); the chip "Offices in Peshawar" shows it, and removing the chip clears it.

**Not built, on purpose.** A page per company (decision 3): at the directory's planned size it outgrows free hosting, and 13,542 thin pages repeating a profile would count against the site rather than for it. A page per specialty: the specialties include near-duplicates ("AI" and "Artificial Intelligence", "Graphic Design" and "Graphic Designing"), which would make near-duplicate pages competing with each other. Merging them in `rules/tag-aliases.json` comes first; specialty pages can follow from the same list.

### After the site is published

These steps need the owner's own accounts, so they are done by hand, once:

1. **Publish** the site on Vercel at mainquest.ibtisam-iq.com (the steps are in section 11, under Vercel). Nothing can be indexed before this.
2. **Google Search Console** (search.google.com/search-console): add the site. A "Domain" property for ibtisam-iq.com, proved with the TXT record Google gives, added at the domain's DNS provider, covers every subdomain and needs no code. A "URL prefix" property for `https://mainquest.ibtisam-iq.com/` can instead be proved with the HTML tag: its code goes into `GOOGLE_SITE_VERIFICATION` in the Vercel project's settings, followed by a new deployment.
3. **Submit the sitemap** in Search Console's Sitemaps page: `https://mainquest.ibtisam-iq.com/sitemap.xml`.
4. **Ask for the first pages** with Search Console's URL Inspection, "Request indexing": the home page and the four city hubs. The rest follow through the sitemap and the links.
5. **Bing Webmaster Tools** (bing.com/webmasters) can import the site straight from Search Console. Bing's index also serves DuckDuckGo and Yahoo.
6. **Try a preview**: paste a link, such as a city page, into a WhatsApp chat.
7. **Watch the "Pages" report** in Search Console over the following weeks. It lists what is indexed and why anything is not; pages under 5 companies appear there as "Excluded by noindex tag", which is intended.

Preview deployments on Vercel, the trial copies built for each change, are marked noindex by Vercel itself, so they never compete with the real site. The canonical tags point every copy at mainquest.ibtisam-iq.com in any case.

### How it is checked

`npm run check:seo` reads a running copy of the site the way a crawler does: robots.txt, the sitemap, then every page by following links. For every page in search results, it checks the title, description, canonical address, preview tags, the single main heading and the structured data. It fetches every preview picture and checks its size against WhatsApp's limits. It also checks that every sitemap page is linked from another page, that no page is missing from the sitemap or listed while kept out of results, that no two pages share a title or description, and that an unknown address answers "not found". Run against the production build:

```bash
npm run build
npm run start -- -p 3100
npm run check:seo -- http://localhost:3100
```

The unit tests in `scripts/tests/seo.test.ts` cover the title rule, the landing page list and the structured data.

**The audit, 12 September 2026.** Before this work, the site had a sitemap, a robots.txt and one preview picture. Checking it the way a crawler and WhatsApp do found:

- Every city and industry page shared the home page's preview text: a WhatsApp preview of the Lahore page read "mainquest: IT companies in Pakistan". A page that sets only its title keeps its parent's preview tags.
- No page had `og:url`, one of the three tags WhatsApp requires.
- The home page named no canonical address, so every filtered address (`/?city=...`) looked like a separate copy of it.
- One picture served every page, no page had structured data, and the sitemap carried no dates.
- Only hubs and industries had pages: nothing matched a search for Islamabad alone, Rawalpindi, Peshawar or any area.
- On phones, the first cards of every landing page touched the line above them, a spacing rule that also reset the space above.

All are fixed. The largest page is 563 KB of HTML but 31 KB as sent (compressed), with its head in the first few kilobytes.

---

## 9. Refreshing the data, step by step

1. Copy the new master file over `data/raw/companies.csv`. If the upstream pipeline is still enriching a city, it rewrites the master at the end of each batch; a copy taken between batches is complete as far as it goes, and the next refresh takes the rest.
2. Run `npm run geocode` (with `-- --dry-run` first to see only the count). It looks up only what is new: new street addresses, new city names and new headquarters. The first lines it prints say how many and roughly how long; a few hundred take about ten minutes, because OpenStreetMap asks for one request a second. Lahore's 1,788 took about 75 minutes, since an address that finds nothing is tried a second way. It can be stopped and run again; it continues where it stopped.
3. Run `npm run data`. It rebuilds `data/companies.json` and the filter files, prints what changed, and then runs every check (section 10). If a check fails, its message says what and where.
4. Look at the site with `npm run dev`, then commit and push. The host rebuilds the site.

Skipping step 2 is safe: new addresses simply stay at city level until the next lookup.

The printed report and `data/ingest-report.json` are worth a glance after a large refresh. `citiesLearned` counts the cities added from the data, `notInAddress` counts lookups set aside because they shared no name with their address, and `uncached` counts addresses still waiting for step 2.

---

## 10. How the logic is checked

Three layers, each run automatically, and a fourth run by hand:

- **Unit tests** (`npm test`) cover each rule on small made-up inputs, including every trap in section 5: road names, two cities in one address, a town and its larger city, learned cities, and the TAK Devs case. `faisalabad.test.ts`, `lahore.test.ts`, `twin-cities.test.ts` and `address-anomalies.test.ts` check real addresses against the real rules files: the ways a DHA phase is written, buildings that stand for their area, boundary anomalies, and foreign locations. `filter-count.test.ts` and `area-filtering.test.ts` test facet consolidation, tag modes, and multi-hub area filtering parity.
- **The validator** runs at the end of `npm run data` and before every build of the site, and stops the build on any failure. Beyond checking the shape and size of the data, it enforces the location rules on every office: an office is filed under a city its address names, and an area that came from the geocoder is named in its address. Run against the dataset from before these rules, it flagged the road-name and area-name faults the audit below found. It cannot see the third kind, an office filed under the wrong city when its address names no city it knows; learning cities from the data is what prevents that one.
- **The cross-check** (`npm run crosscheck`) compares the city hubs, the local and foreign split and the multi-city list with the upstream pipeline's own files.
- **The search engine check** (`npm run check:seo`) reads a built copy of the site the way a crawler and WhatsApp do, and fails on a missing or wrong tag, a thin page in the sitemap, an unlinked page, or a preview picture over WhatsApp's limit (section 8).

**The location audit, 11 September 2026.** Every office in the dataset was checked against these rules. It found three faults, all now fixed:

- 68 offices were filed under a city named only in a road name, such as Peshawar for "Peshawar Road, Rawalpindi".
- Offices in cities missing from the city table, such as Sahiwal and Rahim Yar Khan, were filed under the company's other city, sometimes with an area of that city.
- 197 offices carried an area name taken from OpenStreetMap that their address never mentions, several of them in the wrong place altogether ("Sector F-18" labelled as DHA's Sector F).

The well-known places list held up: all 34 geocoded Islamabad sectors sit within 0.8 km of the regular sector grid, which also gave the five sectors the geocoder could not find their centres.

**The Faisalabad audit, 12 September 2026.** When the upstream pipeline filled Faisalabad's addresses, every one of its 782 offices was listed with its city, area and precision, and each one flagged was read against its address: filed under another city, placed far from its city, naming a neighbourhood that was not used. So was every office anywhere whose city, area or precision changed. It found four faults, all now fixed and each covered by a test in `scripts/tests/faisalabad.test.ts` or `offices.test.ts`:

- 529 offices across the country had a street position that was not the office: whatever the lookup found near a well-known place, such as a hostel for every Gulberg Greens address.
- Four Faisalabad offices were filed under Karachi, through "Tariq Road" and "Nazimabad", which Faisalabad has too.
- "Lahore - Sheikhupura - Faisalabad Rd" was read as Lahore.
- Faisalabad's centre was 6 km from its offices.

It also checked the upstream pipeline's own logic against the data. Its city-naming code reads "ict" as Islamabad, which "District" contains, and treats any office in a city named Hyderabad as Pakistani. The audit found no row touched by either, because it compared each company's Operating Location with its addresses, and both carry the same mistake. The Lahore audit below found two Indian offices this way. Upstream's city files had not been regenerated after its Faisalabad sync, which is why the cross-check lists companies there; the fix is running `generate_city_hubs.py` upstream.

**The Lahore audit, 12 September 2026.** When the upstream pipeline filled Lahore's addresses, the same audit ran over every office of every Lahore company, 3,948 of them, and every office anywhere whose city, area or precision changed was compared with the dataset from before the import. It found these faults, all now fixed and each covered by a test in `scripts/tests/lahore.test.ts`:

- Two offices in Hyderabad, India ("Gachibowli Hyderabad, 500032") and one in Dubai were listed as Pakistani, the first two since before the Faisalabad audit.
- 23 companies had an extra office at a city centre that was one of their addresses under another city name, such as "Wah Cantt, Rawalpindi" with a second office at Rawalpindi's centre.
- Six offices in towns no lookup knows had been drawn in the company's first city, one of them 500 km away.
- 767 of Lahore's 2,309 detailed addresses named no known place, many in spellings of places the rules knew ("DHA Phase 6C", "DHA IV", "D.H.A", "Gulburg", "Johartown"). After adding 37 places and the spellings, 328 remain, nearly all naming only a road, a building or a society whose own lookup fails.
- A bare "DHA" was taken as an area, though it spans a dozen phases, and three offices had a street position on a canal or a lettered block rather than their building.

Each place added was checked against its own lookup (the name it returned, its distance from the centre, and the offices whose own lookups agree with it). 22 candidates failed and were left out, among them Airline Housing Society, Aitchison Society, OPF and Etihad Town. The five offices whose address names Lahore but which are filed elsewhere were read: three are on roads named after it ("Lahore Sheikhupura Road, Faisalabad"), and two list Lahore after another city's street address, for companies that have a Lahore office of their own. No Lahore office sits more than 25 km from the centre. Upstream's rule for city hubs, applied to the new master, gives the same hubs as the import for every company; the cross-check fails only because upstream's own city files have not been regenerated.

**The re-check, 13 September 2026.** Asked whether the twin cities, Lahore and Faisalabad were now right, the data was checked again in ways that do not lean on the rules that placed it:

- Upstream's own saved results for all three were compared with the imported file, field by field: every value matches. Upstream's newer master (from its Karachi run) had changed 94 rows, all of them Karachi companies, so nothing for the three cities was missing.
- Every value the source holds for their 8,226 companies was compared with what the site publishes. Each one not published is left out on purpose: a website that points back at the source platform or is broken (12), a founding year such as "1" (2), specialties that are only links (2), a company id two profiles share (4).
- Each placed office was compared with its own lookup, and the word written before every matched place name was read. That found ten faults, all now fixed and tested (`scripts/tests/lahore.test.ts`, `scripts/tests/twin-cities.test.ts`). Gulberg Greens' centre was a girls' hostel 5 km from its 109 offices. Bahria Orchard was drawn at Bahria Town, 8 km away. Al-Faisal Town, Al-Rehman Garden, DHA Rahbar, Dreams Garden on Defence Road and NUST's college on Peshawar Road were matched to places they only share a word with. One Ghauri Town office was drawn at a Ghauri Town in Attock, a Bahria Enclave office was pulled into Bahria Town, and "Civic Center" alone had become an area. The checker for search engines also read today's date in UTC, and so rejected the site's own dates in the five hours after midnight.

**The filter and search audit, 11 September 2026.** The filtering rules in `lib/query.ts` were compared with a second, separately written version of the same rules, over 600 random combinations of city, area, industry, specialty, headquarters, country, founding year, website, multiple cities and distance. The two agreed on every one, and every option count checked matched the list it would leave. The search was then tried with real searches against the real data, which found five faults, all now fixed:

- "java" also found JavaScript companies, and "pos" also found "post" and "postgresql": 135 results for 24 real ones.
- "C#" searched for the letter "c" (163 results for 10 real ones), and ".NET" for "net", matching every network company (503 for 52).
- "F-7" searched for "f" and "7" anywhere, so an address with a Block F and a Street 7 matched.
- Forgiving a wrong letter turned real words into others: "node" found "code" and "web3" found every "web" company.
- Adding a city to the filter cleared the areas already chosen, even ones inside the city already chosen.

Each is now covered by a test in `scripts/tests/search.test.ts` or `scripts/tests/query.test.ts`.

**Where companies are run from.** `scripts/tests/origin.test.ts` covers each kind of evidence and each trap: a headquarters at home named only by a town, a description placing a team rather than the company, a registration address beside a "US-based" claim, a subsidiary here of a company based abroad. The validator checks that a Pakistani company has its headquarters in Pakistan and the reverse, unless settled by hand, and that every hand entry names a company in the directory. Samples of every kind were read against the companies' own descriptions before the rules were settled.

---

## 11. The tools the site is built with

**The three languages of every web page.** HTML describes what is on a page (a heading, a list, a button). CSS describes how it looks (colours, spacing, the dark theme); all of mainquest's is in `app/globals.css`. JavaScript describes how it behaves (what happens when a filter is ticked).

**TypeScript** is JavaScript with labels on every piece of data: this is a company, this is a list of city names, this number may be missing. A checker reads the labels before anything runs and refuses code that mixes them up, so a whole class of mistakes is caught on the computer rather than by a visitor. `npm run typecheck` runs that checker. Every `.ts` and `.tsx` file in the project is TypeScript; `.tsx` files also describe parts of a page.

**React** builds a page out of components: small, reusable parts such as one company row, one filter group or the search box, each in its own file in `components/`. When the data behind a part changes, React redraws that part and leaves the rest alone. That is what lets the list and every count update instantly as filters are ticked.

**Next.js** sits on top of React. When the site is built, it turns the components into finished pages: the home page, a page for each city, area and industry (section 8), the page for unknown addresses, the sitemap, the picture shown when a link is shared. Those pages are plain files, so the host only has to hand them out (a static site, section 1). Next.js also turns each file in `app/` into an address on the site: `app/companies/[place]/page.tsx` becomes `/companies/lahore`, `/companies/islamabad` and the rest, and `app/companies/[place]/[area]/page.tsx` becomes `/companies/islamabad/blue-area`.

**Node.js** runs JavaScript and TypeScript on a computer instead of in a browser. The data scripts (`npm run geocode`, `npm run data`), the tests and the build all run in Node.

**npm** is the tool that fetches packages, ready-made code other people publish, and that runs the project's named commands. `package.json` lists both. The commands are the ones in section 14; the packages the site depends on are:

| Package | What it does here |
|---|---|
| `next`, `react`, `react-dom` | Build the pages and draw them in the browser |
| `maplibre-gl` | Draws the map (section 6) |
| `minisearch` | The search engine, run in the browser (section 7) |
| `csv-parse` | Reads the master CSV, in `npm run data` only |
| `typescript` and the `@types` packages | The TypeScript checker, and labels for the packages above; used while building, never sent to visitors |

**A web worker** (section 1) runs the search, so typing never waits for it. Its code is `components/search.worker.ts`, and the search rules themselves are in `lib/search-index.ts` and `lib/search-text.ts`.

**Git and GitHub.** Git keeps the history of every change to the project as a series of commits, each a saved snapshot with a message saying what changed. GitHub stores that history online, publicly, at github.com/ibtisam-iq/mainquest. Pushing sends new commits from the computer to GitHub.

**Vercel** is the host chosen for the site; publishing it there is the next step, still to be done. Once connected to the GitHub repository, it notices each push, runs the build (which first runs the validator, section 10) and publishes the new pages at mainquest.ibtisam-iq.com. A build that fails the validator is not published, so broken data never reaches visitors.

**Why Vercel rather than GitHub Pages.** GitHub Pages, which already serves ibtisam-iq.com, hands out plain files and runs nothing. Vercel builds a Next.js project itself and can also run server code. Today every page of mainquest is built ahead of time, so either could serve it in principle; a trial on 12 September 2026 showed what GitHub Pages would cost:

- **A different build.** The site has to be exported as plain files, which Next.js refuses until every generated file (icons, preview pictures, sitemap, robots.txt) is marked as fixed at build time. A GitHub Actions workflow would then build and upload it on each push.
- **Preview pictures without a file type.** The export writes each picture as `opengraph-image`, with no extension. GitHub Pages serves such a file as a download of unknown type rather than as a picture, and chat apps can refuse it, so the WhatsApp cards would need renaming work.
- **Pages that clash with folders.** `/companies/lahore` becomes both a file `lahore.html` and a folder `lahore/` holding its areas. The usual fix ends every address with a slash (`/companies/lahore/`), which changes every canonical address and the sitemap.
- **No server, later.** Phase 2 adds accounts and saved lists, which need server code; on GitHub Pages that would mean moving host (decision 1).

Vercel needs none of these changes: a copy of the project with no git history and no raw data, built exactly as Vercel builds it, passed the validator and produced all 249 pages. Vercel also builds a private trial copy of every change before it goes live, marked so search engines skip it. Its free plan (Hobby) is for personal, non-commercial use, which fits this project; its limits (a million requests a month, 100 deployments a day) are far above what the site uses today.

**Publishing it, once.** The owner's accounts are needed, so these steps are done by hand:

1. **Put the code on GitHub.** The repository on GitHub holds only the licence so far. Commit everything and push; `.gitignore` keeps the raw copy (`data/raw/`), `.env.local` and the generated `public/data/` out.
2. **Sign in at vercel.com with GitHub**, then "Add New", "Project", and import `ibtisam-iq/mainquest`. Vercel recognises Next.js; the build settings stay as they are.
3. **Add the one setting the build needs** under Environment Variables: `NEXT_PUBLIC_PROFILE_BASE_URL`, with the same value as in `.env.local`, for Production and Preview. Without it the build stops with a message naming it. `GEOCODER_CONTACT_EMAIL` is not needed there.
4. **Deploy.** The build takes a few minutes and ends with a trial address ending in `.vercel.app`.
5. **Add the address.** In the project's Settings, Domains, add `mainquest.ibtisam-iq.com`. Vercel shows a CNAME record to create.
6. **Create that record at Cloudflare**, which holds ibtisam-iq.com's DNS: type CNAME, name `mainquest`, the target Vercel showed, and proxy status "DNS only" (the grey cloud), so Vercel can issue the site's HTTPS certificate itself. ibtisam-iq.com itself stays on GitHub Pages, untouched.
7. **Wait for "Valid Configuration"** in Vercel's Domains page, usually minutes. HTTPS follows on its own.
8. **Check the live site**: `npm run check:seo -- https://mainquest.ibtisam-iq.com` reads it as a crawler does, then continue with the search engine steps in section 8.

After that, every push to `main` publishes on its own.

**The development server.** `npm run dev` runs the site on the owner's computer at http://localhost:3000, where "localhost" means this computer itself. Changes to the code show there within a second, before anything is committed or published.

**Where things are, in plain words.**

| Folder | What is in it |
|---|---|
| `app/` | The pages, one folder per kind of address, and `globals.css`, the site's whole look |
| `components/` | The building blocks the pages are made of: rows, filters, the map, the search box |
| `lib/` | Rules shared by the pages and the data scripts: filtering, search, links, text cleaning |
| `scripts/` | The data tools: the geocoder, the ingest, the validator, and the tests in `scripts/tests/` |
| `scripts/ingest/rules/` | The rules files (section 4) |
| `data/` | The published directory and its filter lists, made by `npm run data` |
| `public/` | Files handed out as they are; `public/data/` holds the two files the browser downloads, made fresh before every run |
| `architecture/` | Architecture overview, design decisions, and data models |

---

## 12. The decisions in brief

Full reasoning for each sits in [architecture/decisions.md](architecture/decisions.md).

| Decision | Short reason |
|---|---|
| Next.js rather than Astro | Handles both the search engine facing pages and the interactive table, and adding accounts later is new code in the same project rather than a hosting migration |
| No database in phase 1 | Nothing writes at runtime |
| No page per company | Does not survive growth to 130,000 entries |
| CSV in, JSON out | Keeps the existing pipeline, generates what a browser needs |
| No volatile fields stored | Company size bands and hiring status go stale, so entries link out instead |
| Follower counts shown with their date, most followed first | The only size signal in the data; the date keeps its age visible |
| Associated member counts shown with the date first recorded | Closer to headcount than followers; the source gives no date, so the first sighting is used |
| Profile sub links generated, not stored | They are the profile URL plus a suffix, so storing them wastes space and invites drift |
| Profile handle as the primary key | Company names collide and change, handles do not |
| Private records stay out of this repository | It is public, and some of that information concerns named individuals |
| Descriptions excluded, raw copy kept out of git | Descriptions are 93% of the size, and the raw file carries fields that must not be published |
| City hubs copied from upstream, not reinvented | The site agrees with the files the owner already uses, and a cross-check proves it |
| Website, founded and specialties published | Stable, cheap, and specialties make search useful |
| OpenStreetMap for locations, with stated precision | Free, allows storing results, and nobody gets an invented distance |
| Search runs in the browser | The data is already there |
| MapLibre and OpenFreeMap for the map, labelled in English | Free, no key; vector tiles let the labels be English rather than the local script; only placed offices are drawn |
| Numbered pages, 10 by default | The footer is reachable, a place in the list can be shared, and the back button works |
| The numeric company id stored for the members link | The profile's own member count opens a search by that id; only the number is kept, never the URL |
| One visual system, with dot maps drawn from the data | Every control looks and behaves alike at every width; the only decoration is where the offices actually are |
| A dark theme that follows the system | Every colour is a token with a dark value; the choice stays in the browser and applies before the first paint |
| Map markers grouped only where offices share a position | A busy area's companies are counted and listed together, and no marker sits anywhere its offices are not |
| A geocoder answer counts only through a name its address contains | A position that shares no name with its address can be kilometres off, and a label the address lacks cannot be checked by a reader |
| Filters for follower and member counts, as ranges | The two measures of size in the data; ranges with counts beside them read faster than a slider, and adjacent ranges combine |
| "Where it is run from" instead of "headquarters abroad" | A listed headquarters abroad often belongs to a company run from Pakistan; each company is placed by evidence, shown with its reason, and left unclear rather than guessed |
| Search reads words as written, and forgives typos only in rare words | "C#", ".NET" and "F-7" mean something; a real word is never another word's typo |
| Cities learned from the data, hubs kept in a rules file | New cities in the source need no code change; a new hub is one entry in `hubs.json` |
| A street position only for a building or road the address names | A shop or a hostel that merely lies in the area is not the office; the area's own centre, at area precision, is the honest answer |
| A page per city, area and industry, each with its own preview | Searches name a place; each page describes itself to search engines and chat apps, and pages too thin to help are kept out of results |
| Offices abroad left out, and no second office for a city the source names twice | An office in Dubai or India's Hyderabad is not a Pakistani office; "Chandni Chowk, Rawalpindi" listed with Islamabad is one office, not two |

---

## 13. Cost

Phase 1 costs nothing, with no trial period and no card. Geocoding uses a free service, looked up once per address.

| | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Hosting | Free | Free tier | Free tier |
| Geocoding | Free | Free | Free |
| Database | Not needed | Free tier, up to around $25 a month at scale | Same |
| AI | Not used | Not used | Small per use cost, controllable |

---

## 14. Running it

```bash
npm install
cp .env.example .env.local        # then fill in the profile base URL
npm run dev                       # the site, at http://localhost:3000
npm run build                     # validate, then build every page as static files
npm run geocode                   # only needed when new addresses, cities or headquarters appear
npm run data                      # ingest, then validate
npm test                          # unit tests
npm run check:seo -- http://localhost:3100   # search engine and preview check, against npm run start -- -p 3100
```

Before every `dev` and `build`, a small script writes the two files the browser downloads into `public/data/`, from the committed dataset.

`npm run data` needs `data/raw/companies.csv`. `npm run crosscheck` compares the result with upstream's own files, when copies of those are placed in `data/raw/crosscheck/`.

---

## 15. Notes for describing the project

The interesting part of this project is not that it is a website. It is the set of engineering judgements underneath it. These are the ones worth being able to explain.

**The problem.** Company information is easy to look up one name at a time and effectively impossible to browse in bulk, so people apply to the few employers they have already heard of. mainquest turns that into a browsable, filterable, exportable list.

**Why there is no database.** The company list is read only at runtime. It changes when a new copy of the source arrives, which is a build time event rather than a runtime one. A database would have added cost, an additional failure point and network latency, in exchange for nothing. The data ships as files and is filtered in the browser instead. Most people assume every web application needs a database, which is what makes this worth explaining.

**How scale was handled.** The obvious design is one page per company. It does not survive growth: at 130,000 entries that is roughly 3.7 GB of HTML, beyond what free hosting will serve. A single dataset filtered in the browser was chosen instead. It is split into a small first download and a larger second one, and there is a known upgrade path once it grows too large.

**The data was measured before anything was built.** Early plans assumed problems from three small samples. Profiling the real file overturned most of them and found different ones:

- Fifteen rows pointed at a sub-page rather than a company, with sentences in the name and industry fields. They inflated the industry count from 57 to 72 until they were dropped.
- The office location column holds 270 spellings for far fewer places.
- Three separate city normalisers in the upstream code disagree with each other.
- Only 24% of companies have an address more specific than a city.
- One master file sits behind 26 derived files. Every one of them is a subset of its rows, which reduced the input to a single file.

**Deciding what not to store, and how to store the exceptions.** Company size bands and hiring status change constantly, and a directory that caches them misleads visitors within weeks. Follower counts change too, but they are the most complete measure of a company's size or activity in the data, so they are kept and shown with the date they were counted. That turns a silent stale number into a visibly dated one. Associated member counts followed on the same terms. Their source column carries no date of its own, so each is dated by the day the directory first recorded it, and labelled "recorded" rather than "counted". Descriptions and taglines are long third-party text that would have multiplied the download several times over. Entries store what stays true and link out for the rest. Deciding what not to store is a design decision.

**Honesty about location.** "Near me" needs coordinates, and most companies only name a city. Raw geocoding also turned out to be wrong often enough to matter: tested against Islamabad's sector grid, 17% of placements were more than 4 km off. A checked list of well-known places, consulted first, brought that to zero. Each office carries a precision of street, area or city. Only the first two are ranked by distance; the rest are shown as "in this city, exact location not listed" rather than given a distance from the city centre that would look precise and be wrong. A later audit of every office found that the geocoder could still be confidently wrong where no well-known place was named: 197 area labels named an area their address never mentioned. The rule since is that an answer counts only through a name its address contains, and the validator checks it on every office at every build.

**A privacy boundary.** The raw file is kept out of the public repository entirely, not trimmed. The ingest publishes only the columns a contract in code marks as publishable, so a new column arriving upstream is refused until someone classifies it, rather than published by accident.

**Proving a port.** City groupings, the local and foreign split, and the multi-city list were ported from the upstream code rather than rewritten, then checked against the upstream files company by company. All of them matched. The counts are pinned so the check keeps working after the upstream project is gone.

**Testing on the real site found what the code did not.** Reading the results in a browser surfaced problems no unit test would have caught:

- Four companies whose name and industry were page interface text ("0 notifications", "Skip to main content").
- A search synonym that turned "devops" into 1,733 results by letting "dev" match "development".
- Distances shown as "0.0 km" for offices that were only known to the area.

Each was fixed and then covered by a test or a rule, and the phase 1 plan still lists the one check not yet done: load time on a slow phone connection.

**A tradeoff worth defending.** Filtering in the browser means the dataset downloads once. That is fast and free at 13,500 companies and stops being reasonable somewhere near 50,000. The simpler design was chosen deliberately for the current size, with the threshold and the replacement already identified.
