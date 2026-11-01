import assert from 'node:assert/strict'
import { test } from 'node:test'

import Permission from '../lib/permission/index.js'
import User from '../lib/user/index.js'
import { init, start } from './index.js'

test('server does not come up when permissions fail to migrate', async (t) => {
  t.mock.method(Permission, 'migrate', async () => {
    throw new Error('bad store')
  })

  await assert.rejects(init(), /bad store/)

  const started = await start().catch((err) => err)
  if (started.stop) await started.stop()
  assert.match(started.message ?? '', /bad store/)
})

test('server stop waits for store disconnection', async (t) => {
  const server = await init()
  let enterDisconnect
  let releaseDisconnect
  const entered = new Promise((resolve) => {
    enterDisconnect = resolve
  })
  const released = new Promise((resolve) => {
    releaseDisconnect = resolve
  })

  t.mock.method(User, 'disconnect', async () => {
    enterDisconnect()
    await released
  })

  let stopped = false
  const stopping = server.stop().then(() => {
    stopped = true
  })
  await entered
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(stopped, false)

  releaseDisconnect()
  await stopping
  assert.equal(stopped, true)
})
