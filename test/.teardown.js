const group = require('../lib/group')
// const session = require('../lib/session')
const user = require('../lib/user')
const userCase = require('./fixtures/user.json')
const groupCase = require('./fixtures/group.json')

const teardown = async () => {
  // await destroyTestSession()
  await destroyTestUser()
  await destroyTestGroup()
  await user._mysql.disconnect()
  await group._mysql.disconnect()
  process.exit(1)
}

teardown()

async function destroyTestGroup() {
  await group.destroy({ nt_group_id: groupCase.nt_group_id })
}

async function destroyTestUser() {
  await user.destroy({ nt_user_id: userCase.nt_user_id })
}

async function destroyTestSession() {
  // await session.destroy({ nt_user_id: ... })
}
