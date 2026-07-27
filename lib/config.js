import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'

import { parse } from 'smol-toml'

import { toJson } from './util.js'

// Resolved per call rather than at module load: the server passes the config
// directory in after argv is parsed, and the tests chdir to a temp dir.
function confDir() {
  return process.env.NICTOOL_CONF_DIR ?? './conf.d'
}

const apiJsonPath = () => path.join(confDir(), 'api.json')

class Config {
  constructor() {
    this.cfg = {}
    this.debug = Boolean(process.env.NODE_DEBUG)
  }

  async get(name) {
    this.debug = Boolean(process.env.NODE_DEBUG)

    if (this.cfg[name]) return this.cfg[name]

    seedConfDir()

    const dir = confDir()
    let cfg = sectionFromApiJson(name, readApiJsonSync())
    if (!cfg) cfg = parse(await fs.readFile(path.join(dir, `${name}.toml`), 'utf8'))
    applyEnvOverrides(name, cfg)

    if (name === 'http') {
      const tls = await loadPEM(dir)
      if (tls) cfg.tls = tls
    }

    this.cfg[name] = cfg
    return cfg
  }

  getSync(name) {
    this.debug = Boolean(process.env.NODE_DEBUG)

    if (this.cfg[name]) return this.cfg[name]

    seedConfDir()

    const dir = confDir()
    let cfg = sectionFromApiJson(name, readApiJsonSync())
    if (!cfg) cfg = parse(fsSync.readFileSync(path.join(dir, `${name}.toml`), 'utf8'))
    applyEnvOverrides(name, cfg)

    if (name === 'http') {
      const tls = loadPEMSync(dir)
      if (tls) cfg.tls = tls
    }

    this.cfg[name] = cfg
    return cfg
  }
}

function readApiJsonSync() {
  try {
    return JSON.parse(fsSync.readFileSync(apiJsonPath(), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

const mysqlDefaults = {
  host: '127.0.0.1',
  port: 3306,
  socketPath: '',
  database: 'nictool',
  timezone: '+00:00',
  dateStrings: ['DATETIME', 'TIMESTAMP'],
  decimalNumbers: true,
}

/**
 * Resolve a named section out of api.json. The mysql section is derived from
 * [store] when the store is mysql, so database credentials live in exactly one
 * place rather than being duplicated across two sections.
 */
function sectionFromApiJson(name, apiJson) {
  if (!apiJson) return null
  if (apiJson[name]) return structuredClone(apiJson[name])

  if (name === 'mysql' && apiJson.store?.type === 'mysql') {
    const { type: _type, path: _path, dsn: _dsn, ...conn } = apiJson.store
    return { ...mysqlDefaults, ...conn }
  }

  return null
}

/**
 * Ensure the API has an http section with its own secrets. Seeding is
 * per-section rather than per-file: a drop-in api.json carrying only [store]
 * is the documented way to point a remote API at its database, and that host
 * still has to mint its own jwt/cookie secrets.
 */
function seedConfDir() {
  const dir = confDir()
  // An existing conf.d predating api.json keeps its *.toml files.
  if (fsSync.existsSync(path.join(dir, 'http.toml'))) return

  const existing = readApiJsonSync()
  if (existing?.http) return

  fsSync.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const seeded = { ...(existing ?? {}), ...apiSeed() }
  fsSync.writeFileSync(apiJsonPath(), toJson(seeded), { mode: 0o600 })
  console.log(`seeded ${path.resolve(apiJsonPath())} with generated secrets`)
}

function apiSeed() {
  const secret = (bytes) => crypto.randomBytes(bytes).toString('hex')

  return {
    http: {
      host: 'localhost',
      port: 3000,
      keepAlive: false,
      group: 'NicTool',
      jwt: { key: secret(16) },
      // https://hapi.dev/module/cookie/api/?v=12.0.1
      cookie: {
        name: 'sid-nictool',
        ttl: 3600000,
        path: '/',
        clearInvalid: true,
        isSameSite: 'Strict',
        isSecure: true,
        isHttpOnly: false,
        password: secret(32),
      },
    },
  }
}

function parsePort(envVar) {
  const raw = process.env[envVar]
  if (!raw) return undefined
  const port = parseInt(raw, 10)
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`${envVar}="${raw}" is not a valid port (1-65535)`)
  }
  return port
}

function applyEnvOverrides(name, cfg) {
  if (name === 'mysql') {
    if (process.env.NICTOOL_DB_HOST) cfg.host = process.env.NICTOOL_DB_HOST
    if (process.env.NICTOOL_DB_PORT) cfg.port = parsePort('NICTOOL_DB_PORT')
    if (process.env.NICTOOL_DB_USER) cfg.user = process.env.NICTOOL_DB_USER
    if (process.env.NICTOOL_DB_USER_PASSWORD) cfg.password = process.env.NICTOOL_DB_USER_PASSWORD
    if (process.env.NICTOOL_DB_NAME) cfg.database = process.env.NICTOOL_DB_NAME
  }
  if (name === 'http') {
    if (process.env.NICTOOL_HTTP_HOST) cfg.host = process.env.NICTOOL_HTTP_HOST
    if (process.env.NICTOOL_HTTP_PORT) cfg.port = parsePort('NICTOOL_HTTP_PORT')
  }
  if (name === 'store') {
    if (process.env.NICTOOL_DATA_STORE) cfg.type = process.env.NICTOOL_DATA_STORE
    if (process.env.NICTOOL_DATA_STORE_PATH) cfg.path = process.env.NICTOOL_DATA_STORE_PATH
    if (process.env.NICTOOL_DATA_STORE_DSN) cfg.dsn = process.env.NICTOOL_DATA_STORE_DSN
  }
}

/**
 * Store selection, resolved synchronously so the per-entity modules can pick a
 * backend at import time. Env wins over api.json; neither is required.
 */
export function storeConfig() {
  const cfg = sectionFromApiJson('store', readApiJsonSync()) ?? {}
  applyEnvOverrides('store', cfg)
  return cfg
}

/** "directory" was the original name for a file store, before JSON was an option. */
export function storeType() {
  const type = storeConfig().type ?? 'mysql'
  return type === 'directory' ? 'toml' : type
}

async function loadPEM(dir) {
  let entries
  try {
    entries = await fs.readdir(dir)
  } catch {
    return null
  }
  const pemFile = entries.find((f) => f.endsWith('.pem'))
  if (!pemFile) return null

  const content = await fs.readFile(path.join(dir, pemFile), 'utf8')
  return parsePEMBlocks(content)
}

function loadPEMSync(dir) {
  let entries
  try {
    entries = fsSync.readdirSync(dir)
  } catch {
    return null
  }
  const pemFile = entries.find((f) => f.endsWith('.pem'))
  if (!pemFile) return null

  const content = fsSync.readFileSync(path.join(dir, pemFile), 'utf8')
  return parsePEMBlocks(content)
}

function parsePEMBlocks(content) {
  const keyMatch = content.match(
    /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/,
  )
  const certMatches = [...content.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)]

  if (!keyMatch && !certMatches.length) return null

  return {
    key: keyMatch ? keyMatch[0] + '\n' : null,
    cert: certMatches.length ? certMatches.map((m) => m[0]).join('\n') + '\n' : null,
  }
}

export default new Config()
