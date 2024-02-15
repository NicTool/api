
const group = require('../lib/group')
// const session = require('../lib/session')
const user = require('../lib/user')
const userCase = require('./fixtures/user.json')
const groupCase = require('./fixtures/group.json')

const setup = async () => {

  await createTestGroup()
  await createTestUser()
  // await createTestSession()
  await user._mysql.disconnect()
  await group._mysql.disconnect()
  process.exit(1)
}

setup()

async function createTestGroup () {
	let g = group.read({ nt_group_id: groupCase.nt_group_id })
	if (g.length === 1) return

  await group.create(groupCase)
}

async function createTestUser () {
  let u = await user.read({ nt_user_id: userCase.nt_user_id })
  if (u.length === 1) return

  const instance = JSON.parse(JSON.stringify(userCase))
  instance.password = 'Wh@tA-Decent#P6ssw0rd'

  await user.create(instance)
}

async function createTestSession () {

  this.sessionId = await session.create({
    nt_user_id: userCase.nt_user_id,
    nt_user_session: 12345,
  })
}