// All music/chart rows below are synthetic fixtures. Never imported by the app.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Use the project's installed compiler; no test dependency or generated build files.
function loadTs(file) {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  runInNewContext(code, {
    module, exports: module.exports, URL, Date,
    require: (name) => loadTs(resolve(dirname(file), name + '.ts')),
  })
  return module.exports
}
const { selectHistoricalCandidates: select } = loadTs(fileURLToPath(new URL('../src/utils/historical.ts', import.meta.url)))
const era = { id: 'era', startMonth: '2016-01', endMonth: '2018-12' }
const session = { eraId: 'era', strongSeedTrackIds: [], currentRoundNumber: 1, completedRounds: [] }
const track = (id) => ({ catalogTrackId: id, track: { title: 'Synthetic ' + id, artist: 'Fixture Artist' } })
const data = (entries) => ({ status: 'ready', source: { sourceId: 'synthetic-only', frequency: 'month' },
  tracks: [...new Set(entries.map((e) => e.catalogTrackId))].map(track), entries })
const entry = (id, month, rank = 1) => ({ catalogTrackId: id, month, rank })
const input = (d, extra = {}) => ({ era, session, data: d, seedMatches: [], ...extra })
const ids = (result) => Array.from(result.candidates, (c) => c.id)
const fixture = () => data(Array.from({ length: 36 }, (_, index) =>
  entry('m' + index, (2016 + Math.floor(index / 12)) + '-' + String(index % 12 + 1).padStart(2, '0'))))

test('36 months / zero Strong Seeds: five per segment, unique, max 15', () => {
  const result = select(input(fixture()))
  assert.equal(result.status, 'ready')
  assert.equal(result.candidates.length, 15)
  assert.equal(new Set(ids(result)).size, 15)
  for (let segment = 0; segment < 3; segment++) {
    assert.equal(ids(result).filter((id) => Math.floor(Number(id.slice('historical:m'.length)) / 12) === segment).length, 5)
  }
  assert(ids(result).includes('historical:m0'))
  assert(ids(result).includes('historical:m24'))
})

test('inclusive boundaries / outside period removed / duplicates over months', () => {
  const d = data([entry('start', '2016-01'), entry('end', '2018-12'), entry('start', '2017-06'),
    entry('before', '2015-12'), entry('after', '2019-01')])
  assert.deepEqual(ids(select(input(d))).sort(), ['historical:end', 'historical:start'])
})

test('one month / rank ordering / duplicate rows / fewer than 15', () => {
  const d = data([entry('b', '2017-01', 2), entry('a', '2017-01', 1), entry('a', '2017-01', 1)])
  const result = select(input(d, { era: { ...era, startMonth: '2017-01', endMonth: '2017-01' } }))
  assert.deepEqual(ids(result), ['historical:a', 'historical:b'])
  assert.equal(result.candidates.length, 2)
})

test('shown history includes untouched; active shown IDs also excluded', () => {
  const d = data([entry('a', '2016-01'), entry('b', '2016-01'), entry('c', '2016-01')])
  const result = select(input(d, { session: { ...session, completedRounds: [
    { roundNumber: 1, candidateIds: ['historical:a'], responses: [] },
  ] }, shownCandidateIds: ['historical:b'] }))
  assert.deepEqual(ids(result), ['historical:c'])
})

test('Seed UUID resolved by explicit catalog mapping, never direct ID comparison', () => {
  const d = data([entry('canonical', '2016-01'), entry('archive-uuid', '2016-01')])
  const seedSession = { ...session, strongSeedTrackIds: ['archive-uuid'] }
  const result = select(input(d, { session: seedSession, seedMatches: [
    { archiveTrackId: 'archive-uuid', catalogTrackId: 'canonical' },
  ] }))
  assert.deepEqual(ids(result), ['historical:archive-uuid'])
  assert.equal(select(input(d, { session: seedSession })).status, 'seed_mapping_required')
  assert.equal(select(input(d, { session: seedSession, seedMatches: [
    { archiveTrackId: 'archive-uuid', catalogTrackId: null },
  ] })).candidates.length, 2)
})

test('empty period / exhausted / supply failure remain distinct', () => {
  assert.equal(select(input(data([]))).status, 'no_period_data')
  assert.equal(select(input(data([entry('outside', '2015-01')]))).status, 'no_period_data')
  assert.equal(select(input(data([entry('a', '2016-01')]), { shownCandidateIds: ['historical:a'] })).status, 'no_eligible_candidates')
  assert.equal(select(input({ status: 'failed' })).status, 'supply_failed')
})

test('sparse segments redistribute without fake candidates', () => {
  const d = data(Array.from({ length: 20 }, (_, i) => entry('only-' + i, '2018-12', i + 1)))
  assert.equal(select(input(d)).candidates.length, 15)
  const small = data([entry('single', '2018-12')])
  assert.equal(select(input(small)).candidates.length, 1)
})

test('month rotation; stable candidate IDs across rounds; no long-running song duplicates', () => {
  const d = fixture()
  const first = select(input(d)), second = select(input(d, { session: { ...session, currentRoundNumber: 2 } }))
  assert(ids(first).includes('historical:m0'))
  assert(ids(second).includes('historical:m1'))
  for (const candidate of [...first.candidates, ...second.candidates]) {
    assert.equal(candidate.id, 'historical:' + candidate.track.title.replace('Synthetic ', ''))
  }
  const repeated = data(Array.from({ length: 36 }, (_, i) => entry('same', d.entries[i].month)))
  assert.equal(select(input(repeated)).candidates.length, 1)
})

test('frozen inputs unmodified; output metadata detached from input', () => {
  const args = input(fixture()), before = JSON.stringify(args)
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } }
  freeze(args)
  const result = select(args)
  result.candidates[0].track.title = 'Changed output'
  assert.equal(JSON.stringify(args), before)
})

test('known future metadata held; unknown/older allowed; invalid era/session rejected', () => {
  const d = data([entry('future', '2016-01'), entry('unknown', '2016-01'), entry('old', '2016-01')])
  d.tracks[0].track.releaseDate = '2019-01-01'
  d.tracks[2].track.releaseDate = '2010-01-01'
  assert.deepEqual(ids(select(input(d))).sort(), ['historical:old', 'historical:unknown'])
  assert.equal(select(input(d, { era: { ...era, startMonth: '2019-01' } })).status, 'invalid_input')
  assert.equal(select(input(d, { session: { ...session, eraId: 'other' } })).status, 'invalid_input')
})


test('one-month cap really selects rank top 15, not input order', () => {
  const d = data(Array.from({ length: 20 }, (_, i) => entry('rank-' + (20 - i), '2016-01', 20 - i)))
  const result = select(input(d, { era: { ...era, endMonth: '2016-01' } }))
  assert.equal(result.candidates.length, 15)
  assert(ids(result).includes('historical:rank-1'))
  assert(ids(result).includes('historical:rank-15'))
  assert(!ids(result).includes('historical:rank-16'))
})

test('two-month era balances 8/7 and input ordering does not change output', () => {
  const d = data(['2016-01', '2016-02'].flatMap((month, index) =>
    Array.from({ length: 12 }, (_, rank) => entry(index + '-' + rank, month, rank + 1))))
  const args = input(d, { era: { ...era, endMonth: '2016-02' } })
  const result = select(args)
  assert.equal(ids(result).filter((id) => id.startsWith('historical:0-')).length, 8)
  assert.equal(ids(result).filter((id) => id.startsWith('historical:1-')).length, 7)
  assert.deepEqual(ids(select({ ...args, data: { ...d, entries: [...d.entries].reverse(), tracks: [...d.tracks].reverse() } })), ids(result))
})

test('duplicate catalog definitions and conflicting Seed mappings fail closed', () => {
  const d = data([entry('a', '2016-01')])
  assert.equal(select(input({ ...d, tracks: [...d.tracks, d.tracks[0]] })).status, 'invalid_input')
  const args = input(d, { session: { ...session, strongSeedTrackIds: ['uuid'] }, seedMatches: [
    { archiveTrackId: 'uuid', catalogTrackId: 'a' }, { archiveTrackId: 'uuid', catalogTrackId: null },
  ] })
  assert.equal(select(args).status, 'seed_mapping_required')
})


test('verified Seed mapping outside current series still permits candidate selection', () => {
  const d = data([entry('available', '2016-01')])
  const seedSession = { ...session, strongSeedTrackIds: ['seed-uuid'] }
  const matches = [{ archiveTrackId: 'seed-uuid', catalogTrackId: 'external-canonical' }]
  const args = input(d, { session: seedSession, seedMatches: matches })
  const before = JSON.stringify(args)
  assert.equal(select(args).status, 'ready')
  assert.deepEqual(ids(select(args)), ['historical:available'])
  assert.equal(JSON.stringify(args), before)
  // If the same canonical track later exists in this series, that mapping excludes it.
  const expanded = data([...d.entries, entry('external-canonical', '2016-02')])
  assert.deepEqual(ids(select({ ...args, data: expanded })), ['historical:available'])
  assert.equal(select({ ...args, data: data([]) }).status, 'no_period_data')
})

test('missing/conflicting/blank mapping differs from valid mapping outside series', () => {
  const args = input(data([entry('available', '2016-01')]), {
    session: { ...session, strongSeedTrackIds: ['seed-uuid'] },
  })
  assert.equal(select(args).status, 'seed_mapping_required')
  for (const catalogTrackId of ['', '   ']) {
    assert.equal(select({ ...args, seedMatches: [{ archiveTrackId: 'seed-uuid', catalogTrackId }] }).status, 'seed_mapping_required')
  }
  assert.equal(select({ ...args, seedMatches: [
    { archiveTrackId: 'seed-uuid', catalogTrackId: 'external-a' },
    { archiveTrackId: 'seed-uuid', catalogTrackId: 'external-b' },
  ] }).status, 'seed_mapping_required')
})

test('date guard filters rows, not whole tracks; month boundaries are intentional', () => {
  const d = data([entry('mixed', '2015-12'), entry('mixed', '2016-01'),
    entry('mixed', '2016-02'), entry('mixed', '2016-03')])
  d.tracks[0].track.releaseDate = '2016-02-20'
  const before = JSON.stringify(d)
  // A pre-release row inside or outside the Era is not a whole-track quarantine here.
  assert.equal(select(input(d, { era: { ...era, startMonth: '2016-01', endMonth: '2016-01' } })).status, 'no_eligible_candidates')
  const releaseMonth = select(input(d, { era: { ...era, startMonth: '2016-02', endMonth: '2016-02' } }))
  assert.deepEqual(ids(releaseMonth), ['historical:mixed'])
  const later = select(input(d, { era: { ...era, startMonth: '2016-03', endMonth: '2016-03' } }))
  assert.deepEqual(ids(later), ['historical:mixed'])
  assert.equal(later.candidates[0].track.releaseDate, '2016-02-20')
  assert.equal(JSON.stringify(d), before)
})
