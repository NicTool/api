exports.setEnv = () => {
  if (process.env.NODE_ENV !== undefined) return

  /* c8 ignore next 9 */
  switch (require('os').hostname()) {
    case 'mbp.simerson.net':
    case 'imac27.simerson.net':
      process.env.NODE_ENV = 'development'
      break
    default:
      process.env.NODE_ENV = 'test'
  }
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`)
}

exports.meta = {
  api: {
    version: require('../package.json').version,
  },
}

exports.mapToDbColumn = function (args, maps) {
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
