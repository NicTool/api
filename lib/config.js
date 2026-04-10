import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'

import { parse } from 'smol-toml'

class Config {
  constructor() {
    this.cfg = {}
    this.debug = Boolean(process.env.NODE_DEBUG)
  }

  async get(name) {
    this.debug = Boolean(process.env.NODE_DEBUG)

    if (this.cfg[name]) return this.cfg[name]

    const str = await fs.readFile(`./conf.d/${name}.toml`, 'utf8')
    const cfg = parse(str)
    applyEnvOverrides(name, cfg)
    if (this.debug) console.debug(cfg)

    if (name === 'http') {
      const tls = await loadPEM('./conf.d')
      if (tls) cfg.tls = tls
    }

    this.cfg[name] = cfg
    return cfg
  }

  getSync(name) {
    this.debug = Boolean(process.env.NODE_DEBUG)

    if (this.cfg[name]) return this.cfg[name]

    const str = fsSync.readFileSync(`./conf.d/${name}.toml`, 'utf8')
    const cfg = parse(str)
    applyEnvOverrides(name, cfg)
    if (this.debug) console.debug(cfg)

    if (name === 'http') {
      const tls = loadPEMSync('./conf.d')
      if (tls) cfg.tls = tls
    }

    this.cfg[name] = cfg
    return cfg
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
  const keyMatch = content.match(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/)
  const certMatches = [...content.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)]

  if (!keyMatch && !certMatches.length) return null

  return {
    key: keyMatch ? keyMatch[0] + '\n' : null,
    cert: certMatches.length ? certMatches.map((m) => m[0]).join('\n') + '\n' : null,
  }
}

export default new Config()
