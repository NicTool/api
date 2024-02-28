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
  // create an instance, so we don't mangle the original
  const newArgs = JSON.parse(JSON.stringify(args))

  for (const [key, val] of Object.entries(maps)) {
    if (newArgs[key] !== undefined) {
      newArgs[val] = newArgs[key]
      delete newArgs[key]
    }
  }
  return newArgs
}

export { setEnv, meta, mapToDbColumn }
