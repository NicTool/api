import fs from 'node:fs/promises'
import fsSync from 'node:fs'

import YAML from 'yaml'

import { setEnv } from './util.js'
setEnv()

class Config {
  constructor(opts = {}) {
    this.cfg = {}
    this.getEnv(opts)
  }

  async getEnv(opts = {}) {
    this.env = process.env.NODE_ENV ?? opts.env ?? ''
    this.debug = Boolean(process.env.NODE_DEBUG)
    if (this.debug) console.log(`debug: true, env: ${this.env}`)
  }

  async get(name, env) {
    this.getEnv()

    const cacheKey = [name, env ?? this.env].join(':')
    if (this.cfg?.[cacheKey]) return this.cfg[cacheKey] // cached

    const str = await fs.readFile(`./conf.d/${name}.yml`, 'utf8')
    const cfg = YAML.parse(str)
    if (this.debug) console.debug(cfg)

    this.cfg[cacheKey] = applyDefaults(cfg[env ?? this.env], cfg.default)
    return this.cfg[cacheKey]
  }

  getSync(name, env) {
    this.getEnv()

    const cacheKey = [name, env ?? this.env].join(':')
    if (this.cfg?.[cacheKey]) return this.cfg[cacheKey] // cached

    const str = fsSync.readFileSync(`./conf.d/${name}.yml`, 'utf8')
    const cfg = YAML.parse(str)

    this.cfg[cacheKey] = applyDefaults(cfg[env ?? this.env], cfg.default)
    return this.cfg[cacheKey]
  }
}

function applyDefaults(cfg = {}, defaults = {}) {
  for (const d in defaults) {
    if (d === "__proto__" || d === "constructor") continue;
    if ([undefined, null].includes(cfg[d])) {
      cfg[d] = defaults[d]
    } else if (typeof cfg[d] === 'object' && typeof defaults[d] === 'object') {
      cfg[d] = applyDefaults(cfg[d], defaults[d])
    }
  }
  return cfg
}

export default new Config()
