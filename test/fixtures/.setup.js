const group = require('../../lib/group')
const user = require('../../lib/user')
// const session = require('../../lib/session')

const userCase = require('./user.json')
const groupCase = require('./group.json')

const setup = async () => {
  await createTestGroup()
  await createTestUser()
  // await createTestSession()
  await user._mysql.disconnect()
  await group._mysql.disconnect()
  process.exit()
}

setup()

async function createTestGroup() {
  let g = group.get({ nt_group_id: groupCase.nt_group_id })
  if (g.length === 1) return

  await group.create(groupCase)
}

async function createTestUser() {
  let u = await user.get({ nt_user_id: userCase.nt_user_id })
  if (u.length === 1) return

  const instance = JSON.parse(JSON.stringify(userCase))
  instance.password = 'Wh@tA-Decent#P6ssw0rd'

  await user.create(instance)
}

async function createTestSession() {
  this.sessionId = await session.create({
    nt_user_id: userCase.nt_user_id,
    nt_user_session: 12345,
  })
}
