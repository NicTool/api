import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Data access goes through lib/<entity>/store/ per AGENTS.md. Only stores
// may talk to the mysql wrapper; this walks the source tree and
// fails on any other module that reaches for it.
const ROOTS = ['lib', 'routes']
const SKIP_PATH = (p) =>
  p.split(path.sep).includes('store') || p.endsWith('.test.js')

function sourceFiles(dir) {
  // this test lives in lib/, so the package root is one level up
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', dir)
  return readdirSync(root, { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .filter((f) => !SKIP_PATH(f))
    .map((f) => path.join(root, f))
}

function importSpecifiers(source) {
  return [...source.matchAll(/(?:from|import)\s*\(?['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
}

describe('store access', () => {
  it('keeps mysql access inside store modules', () => {
    const offenders = []
    for (const dir of ROOTS) {
      for (const file of sourceFiles(dir)) {
        if (file.endsWith(`${path.sep}mysql.js`)) continue
        const hits = importSpecifiers(readFileSync(file, 'utf8'))
          .filter((spec) => (spec === 'mysql2' || spec.endsWith('/mysql.js'))
            && !spec.includes('store/')) // dispatchers pick a backend from store/
        if (hits.length > 0) offenders.push(`${file}: ${hits.join(', ')}`)
      }
    }
    assert.deepEqual(offenders, [])
  })
})
