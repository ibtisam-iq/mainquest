// Copies the map library's background worker into public/maplibre/, where the browser can fetch it.
// The library finds its worker next to its own file, and the bundler moves that file, so the map points
// at this copy instead (see components/ResultsMap.tsx). public/maplibre/ is gitignored and rebuilt before
// every dev run and every build, so it always matches the installed version.

import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './ingest/env.ts';

const FROM = join(ROOT, 'node_modules/maplibre-gl/dist');
const OUT = join(ROOT, 'public/maplibre');
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

mkdirSync(OUT, { recursive: true });
for (const file of FILES) copyFileSync(join(FROM, file), join(OUT, file));
console.log(`Copied the map worker to public/maplibre/.`);
