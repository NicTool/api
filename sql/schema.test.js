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

  it('lowercases zone names, leaving live zones that would share a name', async () => {
    const migration = await fs.readFile(path.join(sqlDir, 'upgrade', '07_lowercase_zone_names.sql'), 'utf8')
    const suffix = `lowercase-${Date.now()}.test`
    const rows = {
      upper: [`Upper.${suffix}`, 0],
      dotted: [`dotted.${suffix}.`, 0],
      taken: [`Taken.${suffix}`, 0],
      takenBy: [`taken.${suffix}`, 0],
      deleted: [`Gone.${suffix}`, 1],
      liveBeside: [`gone.${suffix}`, 0],
      same: [`same.${suffix}`, 0],
      sameAgain: [`same.${suffix}`, 0],
    }
    const ids = {}
    for (const [key, [zone, deleted]] of Object.entries(rows)) {
      const [r] = await conn.query(
        "INSERT INTO nt_zone (nt_group_id, zone, deleted, last_modified) VALUES (1, ?, ?, '2020-01-01')",
        [zone, deleted],
      )
      ids[key] = r.insertId
    }
    const read = async () => {
      const [found] = await conn.query(
        'SELECT nt_zone_id, zone, last_modified FROM nt_zone WHERE nt_zone_id IN (?)',
        [Object.values(ids)],
      )
      return Object.fromEntries(
        Object.entries(ids).map(([k, id]) => [k, found.find((r) => r.nt_zone_id === id)]),
      )
    }

    try {
      const before = await read()
      const [results] = await conn.query(migration)
      const after = await read()
      assert.equal(after.upper.zone, `upper.${suffix}`)
      assert.equal(after.dotted.zone, `dotted.${suffix}`)
      assert.equal(after.taken.zone, `Taken.${suffix}`, 'a live zone keeps a name another live zone has')
      assert.equal(after.deleted.zone, `gone.${suffix}`, 'a deleted zone may share a name')
      assert.deepEqual(after.upper.last_modified, before.upper.last_modified)

      const reported = results.find(Array.isArray).map((r) => r.nt_zone_id)
      const ours = Object.entries(ids).filter(([, id]) => reported.includes(id))
      assert.deepEqual(
        ours.map(([k]) => k),
        ['taken', 'takenBy', 'same', 'sameAgain'],
        'every live zone sharing a name, whatever its spelling',
      )

      await assert.doesNotReject(() => conn.query(migration), 'the migration is not re-runnable')
      assert.deepEqual(await read(), after)
    } finally {
      await conn.query('DELETE FROM nt_zone WHERE nt_zone_id IN (?)', [Object.values(ids)])
    }
  })

  it('gives record names that spell their zone its canonical spelling', async () => {
    const migration = await fs.readFile(
      path.join(sqlDir, 'upgrade', '08_lowercase_record_zone_suffix.sql'),
      'utf8',
    )
    const zone = `records-${Date.now()}.test`
    const Zone = zone.replace('records', 'Records').replace('.test', '.TEST')
    const [z] = await conn.query('INSERT INTO nt_zone (nt_group_id, zone) VALUES (1, ?)', [zone])
    const names = {
      apex: [`${Zone}.`, `${zone}.`],
      host: [`WWW.${Zone}.`, `WWW.${zone}.`],
      bare: [Zone, zone],
      relative: ['www', 'www'],
      outside: [`not${Zone}.`, `not${Zone}.`],
      canonical: [`mail.${zone}.`, `mail.${zone}.`],
    }
    const ids = {}
    for (const [key, [name]] of Object.entries(names)) {
      const [r] = await conn.query(
        "INSERT INTO nt_zone_record (nt_zone_id, name, ttl, type_id, address) VALUES (?, ?, 60, 1, '192.0.2.1')",
        [z.insertId, name],
      )
      ids[key] = r.insertId
    }
    const read = async () => {
      const [rows] = await conn.query(
        'SELECT nt_zone_record_id, name FROM nt_zone_record WHERE nt_zone_id = ?',
        [z.insertId],
      )
      return Object.fromEntries(
        Object.entries(ids).map(([k, id]) => [k, rows.find((r) => r.nt_zone_record_id === id).name]),
      )
    }

    try {
      await conn.query(migration)
      const after = await read()
      assert.deepEqual(after, Object.fromEntries(Object.entries(names).map(([k, [, want]]) => [k, want])))

      await assert.doesNotReject(() => conn.query(migration), 'the migration is not re-runnable')
      assert.deepEqual(await read(), after)
    } finally {
      await conn.query('DELETE FROM nt_zone WHERE nt_zone_id = ?', [z.insertId])
    }
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
    assert.match(sql, /'db_version','2\.42'/)
  })
})
