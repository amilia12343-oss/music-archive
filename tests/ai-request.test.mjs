// Synthetic fixtures only; this test never sends requests or stores user data.
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
const { buildAiRecommendationRequest: build } = loadTs(fileURLToPath(new URL('../src/utils/aiRequest.ts', import.meta.url)))
const era = { id: 'era-private', startMonth: '2016-01', endMonth: '2018-12' }
const song = (title) => ({ title, artist: 'Synthetic Artist' })
const candidate = (id) => ({ id, track: song('Fixture ' + id) })
const session = { eraId: era.id, strongSeedTrackIds: [], currentRoundNumber: 1, completedRounds: [] }
const args = (extra = {}) => ({ era, session, archiveTracks: [],
  candidateLookup: { eraId: era.id, candidates: [] }, requestedCount: 15, ...extra })
const history = () => args({
  session: { ...session, currentRoundNumber: 2, completedRounds: [{ roundNumber: 1,
    candidateIds: ['heard', 'negative', 'uncertain', 'untouched'], responses: [
      { candidateId: 'heard', status: 'LISTENED' },
      { candidateId: 'negative', status: 'NOT_LISTENED' },
      { candidateId: 'uncertain', status: 'UNASSIGNED' },
    ] }] }, candidateLookup: { eraId: era.id,
    candidates: ['heard', 'negative', 'uncertain', 'untouched'].map(candidate) },
})

test('zero Strong Seeds and no prior rounds are valid, with minimal provider-independent fields', () => {
  const result = build(args())
  assert.equal(result.status, 'ready')
  assert.equal(result.request.roundNumber, 1)
  assert.equal(result.request.strongSeeds.length, 0)
  assert.equal(result.request.listenedSongs.length, 0)
  assert.equal(result.request.excludeSongs.length, 0)
  assert.equal(result.request.era.startMonth, '2016-01')
  assert.equal(result.request.era.endMonth, '2018-12')
  assert(!JSON.stringify(result.request).includes(era.id))
})

test('Seed UUID resolves through Archive lookup; private/unused metadata is not copied', () => {
  const result = build(args({ session: { ...session, strongSeedTrackIds: ['uuid-secret'] },
    archiveTracks: [{ id: 'uuid-secret', title: ' Seed Fixture ', artist: ' Artist ', releaseDate: '2010-01-01', albumImageUrl: 'https://private.invalid' }] }))
  assert.equal(result.status, 'ready')
  assert.equal(result.request.strongSeeds[0].title, 'Seed Fixture')
  assert.equal(result.request.excludeSongs.length, 1)
  const json = JSON.stringify(result.request)
  for (const secret of ['uuid-secret', 'releaseDate', 'albumImageUrl', '2010-01-01', 'private.invalid']) assert(!json.includes(secret))
})

test('only LISTENED is positive; negative/unassigned/untouched stay in shown exclusions', () => {
  const result = build(history())
  assert.equal(result.status, 'ready')
  assert.equal(result.request.listenedSongs.length, 1)
  assert.equal(result.request.listenedSongs[0].title, 'Fixture heard')
  assert.equal(result.request.excludeSongs.length, 4)
  assert(!JSON.stringify(result.request).includes('NOT_LISTENED'))
  assert(!JSON.stringify(result.request).includes('UNASSIGNED'))
})

test('missing Seed and shown metadata do not silently disappear; diagnostics are local only', () => {
  const result = build(args({ session: { ...session, strongSeedTrackIds: ['missing-seed'] },
    shownCandidateIds: ['missing-shown'] }))
  assert.equal(result.status, 'metadata_missing')
  assert.equal(result.archiveTrackIds[0], 'missing-seed')
  assert.equal(result.candidateIds[0], 'missing-shown')
  assert(!('request' in result))
  const incomplete = history()
  incomplete.candidateLookup.candidates.pop()
  assert.equal(build(incomplete).status, 'metadata_missing')
})

test('active/abandoned shown IDs are exclusions and not positive feedback', () => {
  const result = build(args({ shownCandidateIds: ['active'],
    candidateLookup: { eraId: era.id, candidates: [candidate('active')] } }))
  assert.equal(result.request.excludeSongs.length, 1)
  assert.equal(result.request.listenedSongs.length, 0)
})

test('normalized exact spelling duplicates collapse without merging versions', () => {
  const result = build(args({ session: { ...session, strongSeedTrackIds: ['x', 'y', 'z'] },
    archiveTracks: [ { id: 'x', title: 'Ｆixture  Song', artist: 'Artist' },
      { id: 'y', title: 'fixture song', artist: 'ARTIST' },
      { id: 'z', title: 'Fixture Song (Live)', artist: 'Artist' } ] }))
  assert.equal(result.request.strongSeeds.length, 2)
  assert.equal(result.request.excludeSongs.length, 2)
})

test('Era mismatch, invalid month/round/count, ambiguous lookup are rejected', () => {
  assert.equal(build(args({ era: { ...era, startMonth: '2019-01' } })).status, 'invalid_input')
  assert.equal(build(args({ candidateLookup: { eraId: 'another', candidates: [] } })).status, 'invalid_input')
  for (const requestedCount of [0, 31, 1.5]) assert.equal(build(args({ requestedCount })).status, 'invalid_input')
  assert.equal(build(args({ session: { ...session, currentRoundNumber: 0 } })).status, 'invalid_input')
  const ambiguous = history()
  ambiguous.candidateLookup.candidates.push(candidate('heard'))
  assert.equal(build(ambiguous).status, 'invalid_input')
})

test('response must belong to round shown history and have one explicit status', () => {
  const invalid = history()
  invalid.session.completedRounds[0].responses.push({ candidateId: 'not-shown', status: 'LISTENED' })
  assert.equal(build(invalid).status, 'invalid_input')
  const repeated = history()
  repeated.session.completedRounds[0].responses.push({ candidateId: 'heard', status: 'NOT_LISTENED' })
  assert.equal(build(repeated).status, 'invalid_input')
  const future = history()
  future.session.completedRounds[0].roundNumber = 2
  assert.equal(build(future).status, 'invalid_input')
})

test('latest explicit response by round is used if the same candidate appears again', () => {
  const input = history()
  input.session.currentRoundNumber = 3
  input.session.completedRounds.unshift({ roundNumber: 2, candidateIds: ['heard'],
    responses: [{ candidateId: 'heard', status: 'NOT_LISTENED' }] })
  const result = build(input)
  assert.equal(result.request.listenedSongs.length, 0)
  assert.equal(result.request.excludeSongs.length, 4)
})

test('context budget never silently truncates exclusions; requestedCount may be 30 suggestions', () => {
  assert.equal(build(args({ requestedCount: 30 })).request.requestedCount, 30)
  const long = args({ shownCandidateIds: ['long'], candidateLookup: { eraId: era.id,
    candidates: [{ id: 'long', track: song('x'.repeat(201)) }] } })
  assert.equal(build(long).status, 'context_limit_exceeded')
  const many = Array.from({ length: 80 }, (_, i) => ({ id: 'i' + i, track: song('x'.repeat(190) + i) }))
  assert.equal(build(args({ shownCandidateIds: many.map((c) => c.id),
    candidateLookup: { eraId: era.id, candidates: many } })).status, 'context_limit_exceeded')
})

test('frozen input unchanged and output detached; deterministic reconstruction', () => {
  const input = history(), before = JSON.stringify(input)
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } }
  freeze(input)
  const result = build(input)
  assert.deepEqual(build(input), build(input))
  result.request.listenedSongs[0].title = 'Changed output'
  assert.equal(JSON.stringify(input), before)
})
