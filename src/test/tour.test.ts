import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTour, type TourFile } from '../rag/tour';

function file(partial: Partial<TourFile> & { id: string; path: string }): TourFile {
  return {
    language: 'typescript',
    imports: [],
    exports: [],
    references: [],
    ...partial,
  };
}

// main -> core -> util; util is depended on by both, main is the entry point.
const files: TourFile[] = [
  file({ id: '/w/main.ts', path: 'main.ts', imports: ['./core', './util'] }),
  file({ id: '/w/core.ts', path: 'core.ts', imports: ['./util'], exports: ['Core'] }),
  file({ id: '/w/util.ts', path: 'util.ts', exports: ['util'] }),
];

test('entry point leads, then files by how many depend on them', () => {
  const { stops } = planTour(files);
  assert.deepEqual(stops.map((s) => s.path), ['main.ts', 'util.ts', 'core.ts']);
  // main: entry point; util: 2 dependents; core: 1 dependent.
  assert.match(stops[0].reason, /Start here/);
  assert.match(stops[1].reason, /2 files depend/);
  assert.match(stops[2].reason, /1 file depend/);
});

test('skips test files and non-code files', () => {
  const { stops, total } = planTour([
    ...files,
    file({ id: '/w/util.test.ts', path: 'util.test.ts', imports: ['./util'] }),
    file({ id: '/w/README.md', path: 'README.md', language: 'markdown' }),
    file({ id: '/w/data.json', path: 'data.json', language: 'json' }),
  ]);
  const paths = stops.map((s) => s.path);
  assert.ok(!paths.includes('util.test.ts'));
  assert.ok(!paths.includes('README.md'));
  assert.ok(!paths.includes('data.json'));
  assert.equal(total, 3); // only the three code files count
});

test('is deterministic and caps the number of stops', () => {
  const many: TourFile[] = Array.from({ length: 30 }, (_v, n) =>
    file({ id: `/w/f${n}.ts`, path: `f${n}.ts` }),
  );
  const a = planTour(many);
  const b = planTour(many);
  assert.equal(a.stops.length, 15); // capped
  assert.equal(a.total, 30); // but the true count is reported
  assert.deepEqual(a.stops.map((s) => s.path), b.stops.map((s) => s.path));
});
