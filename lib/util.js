exports.setEnv = () => {
  if (process.env.NODE_ENV !== undefined) return

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
