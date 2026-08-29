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

export function resolveCodec(type = storeConfig().type) {
  return codecs[type] ?? jsonCodec
}

export function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, row.id ?? 0), 0) + 1
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

  async load(key) {
    try {
      const data = await this.codec.parse(await fs.readFile(this.filePath, 'utf8'))
      return Array.isArray(data?.[key]) ? data[key] : []
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async save(key, rows) {
    const file = this.filePath
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, await this.codec.stringify({ [key]: rows }))
  }
}

export default FileStore
