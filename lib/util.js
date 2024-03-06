import os from 'node:os'

import pkgJson from '../package.json' with { type: 'json' }

function setEnv() {
  if (process.env.NODE_ENV !== undefined) return

  /* c8 ignore next 9 */
  switch (os.hostname()) {
    case 'mbp.simerson.net':
    case 'imac27.simerson.net':
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

export { setEnv, meta, mapToDbColumn }
