import assert from 'node:assert/strict'
import { test } from 'node:test'

import User from '../lib/user/index.js'
import { init } from './index.js'

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
