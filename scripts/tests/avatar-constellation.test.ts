import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_TONES, avatarTone, monogram } from '../../lib/avatar.ts';
import { constellation } from '../../lib/constellation.ts';

test('monogram takes two words, skips filler, and splits a two-part word', () => {
  assert.equal(monogram('ZAPTA Technologies (Pvt.) Limited'), 'ZT');
  assert.equal(monogram('VentureDive'), 'VD');
  assert.equal(monogram('CEQUENS'), 'C');
  assert.equal(monogram('Bayt.com'), 'B');
  assert.equal(monogram('The Pvt Ltd'), 'TP');
  assert.equal(monogram('𝐁𝐮𝐬𝐢𝐧𝐞𝐬𝐬 Hub'), 'BH');
  assert.equal(monogram('***'), '#');
});

test('avatar tone is stable and in range', () => {
  const t = avatarTone('cequens');
  assert.equal(t, avatarTone('cequens'));
  assert.ok(t >= 0 && t < AVATAR_TONES);
});

test('constellation fits points inside the box and merges nearby ones', () => {
  const pts = [
    { lat: 33.7, lon: 73.0 }, { lat: 33.7001, lon: 73.0001 },
    { lat: 33.6, lon: 73.1 }, { lat: 33.65, lon: 73.05 },
  ];
  const c = constellation(pts, { width: 200, height: 100, trim: 0 });
  assert.equal(c.dots.length, 3);
  for (const [x, y, r] of c.dots) {
    assert.ok(x >= 0 && x <= 200 && y >= 0 && y <= 100);
    assert.ok(r > 0);
  }
  // The shared bin draws larger than a single office.
  assert.ok(Math.max(...c.dots.map((d) => d[2])) > Math.min(...c.dots.map((d) => d[2])));
  assert.deepEqual(constellation([], { width: 10, height: 10 }).dots, []);
});

test('constellation places a city centre inside its bounds and drops one outside', () => {
  const pts = [{ lat: 31.4, lon: 74.2 }, { lat: 31.6, lon: 74.4 }];
  const c = constellation(pts, { width: 100, height: 100, trim: 0 }, [{ lat: 31.5, lon: 74.3 }, { lat: 24.9, lon: 67.0 }]);
  assert.equal(c.marks.length, 1);
  assert.deepEqual(c.marks[0], [50, 50]);
});

test('constellation names a labelled centre and grows dots as asked', () => {
  const pts = Array.from({ length: 50 }, () => ({ lat: 31.5, lon: 74.3 })).concat([{ lat: 24.9, lon: 67 }]);
  const c = constellation(pts, { width: 300, height: 300, trim: 0, bin: 0.1, growth: 2, maxRadius: 30 }, [{ lat: 31.5, lon: 74.3, label: 'Lahore' }]);
  assert.equal(c.labels.length, 1);
  assert.equal(c.labels[0][2], "Lahore");
  assert.equal(c.labels[0][3], "start");
  assert.ok(Math.max(...c.dots.map((d) => d[2])) > 10);
});
