import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Only store modules may reach mysql, so every backend stays swappable.
const ROOTS = ['lib', 'routes']
const SKIP_PATH = (p) => p.split(path.sep).includes('store') || p.endsWith('.test.js')

function sourceFiles(dir) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', dir)
  return readdirSync(root, { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .filter((f) => !SKIP_PATH(f))
    .map((f) => path.join(root, f))
}

function importSpecifiers(source) {
  return [...source.matchAll(/(?:from|import)\s*\(?['"]([^'"]+)['"]/g)].map((m) => m[1])
}

describe('store access', () => {
  it('keeps mysql access inside store modules', () => {
    const offenders = []
    for (const dir of ROOTS) {
      for (const file of sourceFiles(dir)) {
        if (file.endsWith(`${path.sep}mysql.js`)) continue
        const hits = importSpecifiers(readFileSync(file, 'utf8')).filter(
          (spec) => (spec === 'mysql2' || spec.endsWith('/mysql.js')) && !spec.includes('store/'),
        )
        if (hits.length > 0) offenders.push(`${file}: ${hits.join(', ')}`)
      }
    }
    assert.deepEqual(offenders, [])
  })
})
