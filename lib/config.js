const fs = require('fs/promises')

const YAML = require('yaml')

class config {
  constructor(opts = {}) {
    this.cfg = {}
    this.debug = process.env.NODE_DEBUG ? true : false
    this.env = process.env.NODE_ENV ?? opts.env
    if (this.debug) console.log(`debug: true, env: ${this.env}`)
  }

  async get(name, env) {
    const cacheKey = [name, env ?? this.env].join(':')
    if (this.cfg?.[cacheKey]) return this.cfg[cacheKey] // cached

    const str = await fs.readFile(`./conf.d/${name}.yml`, 'utf8')
    const cfg = YAML.parse(str)
    // if (this.debug) console.log(cfg)

    this.cfg[cacheKey] = applyDefaults(cfg[env ?? this.env], cfg.default)
    return this.cfg[cacheKey]
  }

  getSync(name, env) {
    const cacheKey = [name, env ?? this.env].join(':')
    if (this.cfg?.[cacheKey]) return this.cfg[cacheKey] // cached

    const str = require('fs').readFileSync(`./conf.d/${name}.yml`, 'utf8')
    const cfg = YAML.parse(str)

    this.cfg[cacheKey] = applyDefaults(cfg[env ?? this.env], cfg.default)
    return this.cfg[cacheKey]
  }
}

function applyDefaults(cfg = {}, defaults = {}) {
  for (const d in defaults) {
    if (cfg[d] === undefined) {
      cfg[d] = defaults[d]
    }
    else if (typeof cfg[d] === 'object' && typeof defaults[d] === 'object') {
      cfg[d] = applyDefaults(cfg[d], defaults[d])
    }
  }
  return cfg
}

module.exports = new config()
