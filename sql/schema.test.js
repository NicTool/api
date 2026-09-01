// Applies sql/*.sql the way the configurator's /nt/init-schema does.
//
// Regression guard for two things: the files hold many statements per file
// (so the connection needs multipleStatements), and they must be idempotent
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, before, after } from 'node:test'

import mysql from 'mysql2/promise'

import Config from '../lib/config.js'

const sqlDir = fileURLToPath(new URL('./', import.meta.url))

async function connOpts() {
  const { socketPath, ...cfg } = await Config.get('mysql')
  return {
    ...cfg,
    ...(socketPath ? { socketPath } : {}),
    connectTimeout: 4000,
    multipleStatements: true,
  }
}

let conn = null

before(async () => {
  conn = await mysql.createConnection(await connOpts())
})

after(async () => {
  await conn?.end()
})

const schemaFiles = async () => (await fs.readdir(sqlDir)).filter((f) => f.endsWith('.sql')).sort()

/**
 * Parse the CREATE TABLE blocks into { table -> { columns, keys, fks } }.
 * Enough structure to validate referential integrity statically, which matters
 * because the constraints are only exercised against a freshly built database.
 */
async function parseSchema() {
  const tables = {}
  for (const f of await schemaFiles()) {
    const sql = await fs.readFile(path.join(sqlDir, f), 'utf8')
    const blocks = sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\(([\s\S]*?)\n\)\s*[^;]*;/g)
    for (const [, name, body] of blocks) {
      const columns = {}
      const keys = new Set()
      const fks = []

      for (const raw of body.split('\n')) {
        const line = raw.trim().replace(/,$/, '')
        if (!line || line.startsWith('--') || line.startsWith('#')) continue

        const fk = line.match(
          /CONSTRAINT\s+`(\w+)`\s+FOREIGN KEY\s*\(`(\w+)`\)\s*REFERENCES\s+`(\w+)`\s*\(`(\w+)`\)/i,
        )
        if (fk) {
          fks.push({ name: fk[1], column: fk[2], refTable: fk[3], refColumn: fk[4] })
          continue
        }

        const key = line.match(/^(?:PRIMARY KEY|UNIQUE KEY|UNIQUE|KEY)\s*`?(\w+)?`?\s*\(([^)]*)\)/i)
        if (key) {
          const first = key[2].split(',')[0].trim().replace(/`/g, '')
          keys.add(first)
          continue
        }

        const col = line.match(/^`?(\w+)`?\s+([A-Za-z]+(?:\([^)]*\))?(?:\s+UNSIGNED)?)/i)
        if (col) columns[col[1]] = col[2].toLowerCase().replace(/\s+/g, ' ')
      }
      tables[name] = { columns, keys, fks, file: f }
    }
  }
  return tables
}

describe('foreign keys', () => {
  it('reference a table and column that exist', async (t) => {
    const tables = await parseSchema()
    let count = 0

    for (const [name, def] of Object.entries(tables)) {
      for (const fk of def.fks) {
        count++
        assert.ok(def.columns[fk.column], `${name}.${fk.column} (${fk.name}) is not a column`)
        assert.ok(tables[fk.refTable], `${fk.name} references unknown table ${fk.refTable}`)
        assert.ok(
          tables[fk.refTable].columns[fk.refColumn],
          `${fk.name} references unknown column ${fk.refTable}.${fk.refColumn}`,
        )
      }
    }

    assert.ok(count >= 10, `expected the 2.41 constraint set, found ${count}`)
    t.diagnostic(`${count} foreign keys validated`)
  })

  it('use matching column types on both sides', async () => {
    const tables = await parseSchema()

    for (const [name, def] of Object.entries(tables)) {
      for (const fk of def.fks) {
        const child = tables[name].columns[fk.column]
        const parent = tables[fk.refTable].columns[fk.refColumn]
        // MySQL rejects a FK whose types differ; auto_increment on the parent
        // is not part of the type.
        assert.equal(
          child.replace(/ unsigned/, ''),
          parent.replace(/ unsigned/, ''),
          `${fk.name}: ${name}.${fk.column} is ${child} but ${fk.refTable}.${fk.refColumn} is ${parent}`,
        )
      }
    }
  })

  it('are all covered by the upgrade migration, and vice versa', async () => {
    const tables = await parseSchema()
    const declared = new Set(Object.values(tables).flatMap((t) => t.fks.map((fk) => fk.name)))

    const migration = await fs.readFile(path.join(sqlDir, 'upgrade', '05_enable_foreign_keys.sql'), 'utf8')
    const migrated = new Set([...migration.matchAll(/CALL nt_add_fk\('\w+',\s*'(\w+)'/g)].map((m) => m[1]))

    const missing = [...declared].filter((n) => !migrated.has(n))
    const extra = [...migrated].filter((n) => !declared.has(n))

    assert.deepEqual(missing, [], 'constraints an existing database would never get')
    assert.deepEqual(extra, [], 'constraints the migration adds but the schema does not declare')
  })

  it('are indexed on the child side, as InnoDB requires', async () => {
    const tables = await parseSchema()

    for (const [name, def] of Object.entries(tables)) {
      for (const fk of def.fks) {
        assert.ok(
          def.keys.has(fk.column),
          `${fk.name}: ${name}.${fk.column} needs a leading index for the constraint`,
        )
      }
    }
  })
})

describe('sql schema', () => {
  it('ships no destructive DDL in the install path', async (t) => {
    for (const f of await schemaFiles()) {
      const sql = await fs.readFile(path.join(sqlDir, f), 'utf8')
      assert.ok(!/^DROP TABLE/m.test(sql), `${f} must not DROP TABLE; use sql/upgrade/`)
      assert.ok(!/^CREATE TABLE(?! IF NOT EXISTS)/m.test(sql), `${f} must use CREATE TABLE IF NOT EXISTS`)
    }
    t.diagnostic('sql/upgrade/ holds the destructive cleanup and is not applied on install')
  })

  it('applies cleanly, twice, without duplicating seed rows', async () => {
    const files = await schemaFiles()
    const seedCount = async () => (await conn.query('SELECT COUNT(*) n FROM resource_record_type'))[0][0].n
    const apply = async (pass) => {
      for (const f of files) {
        const sql = await fs.readFile(path.join(sqlDir, f), 'utf8')
        await assert.doesNotReject(() => conn.query(sql), `${f} failed on pass ${pass}`)
      }
    }

    await apply(1)
    const seeded = await seedCount()
    assert.ok(seeded, 'the resource record types seeded on the first pass')

    await apply(2)
    assert.equal(await seedCount(), seeded, 'INSERT IGNORE kept the seed rows unique')
  })

  it('offers an upgraded database every export type a new install seeds', async () => {
    const seeded = async (file, row) => {
      const sql = await fs.readFile(path.join(sqlDir, file), 'utf8')
      const insert = sql.match(/INSERT IGNORE INTO `nt_nameserver_export_type`[\s\S]*?;/)
      assert.ok(insert, `${file} seeds nt_nameserver_export_type`)
      return [...insert[0].matchAll(row)]
    }

    // 2.41 shipped ids 1-8, so every type seeded above that is one an
    // upgraded database can only get from the migration.
    const install = await seeded(
      '04_nt_nameserver.sql',
      /\(\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g,
    )
    const migration = await seeded(
      'upgrade/06_add_nameserver_export_types.sql',
      /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g,
    )

    assert.deepEqual(
      migration.map(([, ...cols]) => cols),
      install.filter(([, id]) => Number(id) > 8).map(([, , ...cols]) => cols),
    )
  })

  it('adds the v3 export types to an existing database, and again on a re-run', async () => {
    const migration = await fs.readFile(
      path.join(sqlDir, 'upgrade', '06_add_nameserver_export_types.sql'),
      'utf8',
    )
    const types = async () =>
      (await conn.query('SELECT name FROM nt_nameserver_export_type ORDER BY id'))[0].map((r) => r.name)

    await assert.doesNotReject(() => conn.query(migration))
    const seeded = await types()
    for (const name of ['coredns', 'native']) assert.ok(seeded.includes(name), `${name} is selectable`)

    await assert.doesNotReject(() => conn.query(migration), 'the migration is not re-runnable')
    assert.deepEqual(await types(), seeded, 'the second run changed the rows')
  })

  it('declares the 2.x db_version the upgrade path detects', async () => {
    const sql = await fs.readFile(path.join(sqlDir, '12_nt_options.sql'), 'utf8')
    assert.match(sql, /'db_version','2\.41'/)
  })
})
