'use strict'

const path = require('node:path')

const group = require('../lib/group')
const user = require('../lib/user')
// const session = require('../lib/session')
const userCase = require('./v3/user.json')
const groupCase = require('./v3/group.json')

switch (process.argv[2]) {
  case 'setup':
    setup()
    break
  case 'teardown':
    teardown()
    break
  default:
    console.log(
      `\nusage:\tnode ${path.basename(process.argv[1])} [ setup | teardown ]\n`,
    )
}

async function setup() {
  await createTestGroup()
  await createTestUser()
  // await createTestSession()
  await user._mysql.disconnect()
  await group._mysql.disconnect()
  process.exit(0)
}

async function createTestGroup() {
  let g = group.get({ id: groupCase.id })
  if (g.length === 1) return

  await group.create(groupCase)
}

async function createTestUser() {
  let u = await user.get({ id: userCase.id })
  if (u.length === 1) return

  const instance = JSON.parse(JSON.stringify(userCase))
  instance.password = 'Wh@tA-Decent#P6ssw0rd'

  await user.create(instance)
}

// async function createTestSession() {
//   this.sessionId = await session.create({
//     nt_user_id: userCase.nt_user_id,
//     nt_user_session: '3.0.0',
//   })
// }

async function teardown() {
  // await destroyTestSession()
  await destroyTestUser()
  await destroyTestGroup()
  // await user._mysql.disconnect()
  // await group._mysql.disconnect()
  process.exit(0)
}

async function destroyTestGroup() {
  await group.destroy({ id: groupCase.id })
}

async function destroyTestUser() {
  await user.destroy({ id: userCase.id })
}

// async function destroyTestSession() {
//   await session.destroy({ nt_user_id: ... })
// }