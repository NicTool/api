import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { storeConfig } from '../config.js'
import { toJson } from '../util.js'

const jsonCodec = {
  ext: 'json',
  parse: async (str) => JSON.parse(str),
  stringify: async (data) => toJson(data),
}

// smol-toml is loaded only when a TOML store is actually selected, so a
// JSON-only deployment never pays for it.
const tomlCodec = {
  ext: 'toml',
  parse: async (str) => (await import('smol-toml')).parse(str),
  stringify: async (data) => (await import('smol-toml')).stringify(data),
}

const codecs = { json: jsonCodec, toml: tomlCodec }
const mutations = new Map()

export async function serialize(file, callback) {
  const previous = mutations.get(file) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(callback)
  mutations.set(file, current)

  try {
    return await current
  } finally {
    if (mutations.get(file) === current) mutations.delete(file)
  }
}

export function resolveCodec(type = storeConfig().type) {
  return codecs[type] ?? jsonCodec
}

export function highestId(rows) {
  return rows.reduce((max, row) => (Number.isInteger(row.id) && row.id > max ? row.id : max), 0)
}

export function nextId(rows, lastId = 0, maxId = 0xffffffff) {
  if (!Number.isInteger(lastId) || lastId < 0) throw new TypeError('file store last id must be unsigned')

  const highest = Math.max(lastId, highestId(rows))
  if (highest >= maxId) throw new RangeError(`file store id space exhausted at ${maxId}`)
  return highest + 1
}

// the id a create gets, recorded as the file's high-water mark
export function claimId(rows, data, id, maxId) {
  if (id === undefined) id = nextId(rows, data.last_id, maxId)
  data.last_id = Math.max(data.last_id ?? 0, id)
  return id
}

/**
 * One file per entity, holding an array of rows under a single top-level key,
 * plus last_id, the highest id ever allocated. The codec is chosen by
 * store.type; everything above this layer is identical for JSON and TOML.
 */
export class FileStore {
  constructor(basename) {
    this.basename = basename
  }

  get codec() {
    return resolveCodec()
  }

  /**
   * Resolved per call: the store path is configuration, not a build-time
   * constant, and an unset path is a misconfiguration rather than a reason to
   * fall back to somewhere inside the package.
   */
  get filePath() {
    const base = storeConfig().path
    if (!base) {
      throw new Error(
        'file store selected but no path is configured — set store.path in api.json or NICTOOL_DATA_STORE_PATH',
      )
    }
    return path.join(base, `${this.basename}.${this.codec.ext}`)
  }

  async _read(file) {
    try {
      const data = await this.codec.parse(await fs.readFile(file, 'utf8'))
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    } catch (err) {
      if (err.code === 'ENOENT') return {}
      throw err
    }
  }

  // a copy renamed over the file, so a load never sees half of it
  async _write(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const old = await fs.stat(file).catch((err) => {
      if (err.code !== 'ENOENT') throw err
    })
    const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`
    try {
      const mode = old ? old.mode & 0o777 : 0o666
      await fs.writeFile(tmp, await this.codec.stringify(data), { flag: 'wx', mode })
      if (old) await fs.chmod(tmp, mode)
      await fs.rename(tmp, file)
    } catch (err) {
      if (err.code !== 'EEXIST') await fs.rm(tmp, { force: true }).catch(() => {})
      throw err
    }
  }

  async load(key) {
    const data = await this._read(this.filePath)
    return Array.isArray(data[key]) ? data[key] : []
  }

  async mutate(key, callback) {
    const file = this.filePath
    return serialize(file, async () => {
      const data = await this._read(file)
      const rows = Array.isArray(data[key]) ? data[key] : []
      data[key] = rows
      // a file from before last_id existed mustn't reuse a destroyed id
      if (data.last_id === undefined) {
        const highest = highestId(rows)
        if (highest > 0) data.last_id = highest
      }
      // a callback that changed nothing returns false, or its result via keep()
      let changed = true
      const keep = (value) => {
        changed = false
        return value
      }
      const result = await callback(rows, data, keep)
      if (changed && result !== false) await this._write(file, data)
      return result
    })
  }
}

// in place, so a mutate() callback can drop rows
export function removeRows(rows, match) {
  let kept = 0
  for (const row of rows) {
    if (!match(row)) rows[kept++] = row
  }
  const removed = rows.length - kept
  rows.length = kept
  return removed
}

export default FileStore
