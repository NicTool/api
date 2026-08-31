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

async function serialize(file, callback) {
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

export function nextId(rows, lastId = 0, maxId = 0xffffffff) {
  if (!Number.isInteger(lastId) || lastId < 0) throw new TypeError('file store last id must be unsigned')

  let highest = lastId
  for (const row of rows) {
    if (row.id === undefined) continue
    if (!Number.isInteger(row.id) || row.id < 0) throw new TypeError('file store row id must be unsigned')
    highest = Math.max(highest, row.id)
  }

  if (highest >= maxId) throw new RangeError(`file store id space exhausted at ${maxId}`)
  return highest + 1
}

/**
 * One file per entity, holding an array of rows under a single top-level key.
 * The codec is chosen by store.type; everything above this layer is identical
 * for JSON and TOML.
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

  async _write(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, await this.codec.stringify(data))
  }

  async load(key) {
    const data = await this._read(this.filePath)
    return Array.isArray(data[key]) ? data[key] : []
  }

  async save(key, rows) {
    const file = this.filePath
    return serialize(file, async () => {
      const data = await this._read(file)
      data[key] = rows
      await this._write(file, data)
    })
  }

  async mutate(key, callback) {
    const file = this.filePath
    return serialize(file, async () => {
      const data = await this._read(file)
      const rows = Array.isArray(data[key]) ? data[key] : []
      const result = await callback(rows, data)
      data[key] = rows
      await this._write(file, data)
      return result
    })
  }
}

export default FileStore
