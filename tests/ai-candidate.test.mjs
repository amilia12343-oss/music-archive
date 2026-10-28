// Synthetic strings only. No personal experiment responses or real recommendations.
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
const { parseAiSuggestions: parse } = loadTs(fileURLToPath(new URL('../src/utils/aiCandidate.ts', import.meta.url)))
const song = (title = 'Synthetic Song', artist = 'Synthetic Artist') => ({ title, artist })
const payload = (songs) => JSON.stringify({ songs })

test('valid empty response is different from failure; suggestions are not verified candidates', () => {
  const empty = parse(payload([]))
  assert.equal(empty.status, 'valid')
  assert.equal(empty.suggestions.length, 0)
  const result = parse(payload([song('  Fixture  ', ' Artist ')]))
  assert.equal(result.suggestions[0].title, 'Fixture')
  assert.equal(result.suggestions[0].artist, 'Artist')
  assert(!('id' in result.suggestions[0]))
  assert(!('releaseDate' in result.suggestions[0]))
})

test('bad JSON/code fences and wrong top-level schema are rejected', () => {
  assert.equal(parse('{oops').status, 'invalid_json')
  assert.equal(parse('~~~json {} ~~~').status, 'invalid_json')
  for (const value of [null, [], {}, { songs: null }, { songs: [], id: 'invented' }]) {
    assert.equal(parse(JSON.stringify(value)).status, 'invalid_shape')
  }
})

test('bounded payload, candidate count and fields', () => {
  assert.equal(parse(' '.repeat(16001)).status, 'limit_exceeded')
  assert.equal(parse(payload(Array.from({ length: 31 }, () => song()))).status, 'limit_exceeded')
  assert.equal(parse(payload(Array.from({ length: 30 }, (_, i) => song('Fixture ' + i)))).suggestions.length, 30)
  const result = parse(payload([song('x'.repeat(201)), song('x'.repeat(200))]))
  assert.equal(result.rejectedItemCount, 1)
  assert.equal(result.suggestions.length, 1)
})

test('malformed items and AI-supplied dates/IDs are not accepted as metadata', () => {
  const result = parse(payload([null, [], song('   '), { title: 2, artist: 'A' },
    { ...song(), id: 'fake' }, { ...song(), releaseDate: '2017-01-01' }, song('Valid Fixture')]))
  assert.equal(result.status, 'valid')
  assert.equal(result.rejectedItemCount, 6)
  assert.equal(result.suggestions.length, 1)
  assert.equal(parse(payload([null])).suggestions.length, 0)
})

test('case/Unicode/spacing duplicates removed; different titles/versions remain distinct', () => {
  const result = parse(payload([song(' Fixture  Song ', 'Ａ'), song('fixture song', 'A'),
    song('Fixture Song (Live)', 'A'), song('Different', 'A')]))
  assert.equal(result.duplicateCount, 1)
  assert.equal(result.suggestions.length, 3)
  assert.equal(result.suggestions[0].title, 'Fixture  Song')
})

test('pair keys do not collide; repeated parsing does not mutate original strings', () => {
  const json = payload([song('a|b', 'c'), song('a', 'b|c')]), before = json
  assert.equal(parse(json).suggestions.length, 2)
  assert.deepEqual(parse(json), parse(json))
  assert.equal(json, before)
})
