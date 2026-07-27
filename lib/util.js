import os from 'node:os'

import pkgJson from '../package.json' with { type: 'json' }

function setEnv() {
  if (process.env.NODE_ENV !== undefined) return

  /* c8 ignore next 9 */
  switch (os.hostname()) {
    case 'm5.home.simerson.net':
    case 'm3.home.simerson.net':
    case 'imac27.home.simerson.net':
      process.env.NODE_ENV = 'development'
      break
    default:
      process.env.NODE_ENV = 'test'
  }
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`)
}

const meta = {
  api: {
    version: pkgJson.version,
  },
}

/**
 * Recursively order object keys so serialized output is stable — an unsorted
 * dump reshuffles on unrelated edits and makes diffs unreadable.
 */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== 'object') return value
  // Date and friends would be flattened to {} by the key walk below.
  if (Object.getPrototypeOf(value) !== Object.prototype) return value

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, sortKeys(value[k])]),
  )
}

/** Human-friendly JSON: sorted, shallow-indented, newline-terminated. */
function toJson(value) {
  return `${JSON.stringify(sortKeys(value), null, 1)}\n`
}

function mapToDbColumn(args, maps) {
  args = JSON.parse(JSON.stringify(args)) // don't mutate the original

  for (const [key, val] of Object.entries(maps)) {
    if (args[key] !== undefined) {
      args[val] = args[key]
      delete args[key]
    }
  }
  return args
}

export { setEnv, meta, mapToDbColumn, sortKeys, toJson }
