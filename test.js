'use strict'

import path from 'node:path'

import Group from './lib/group.js'
import User from './lib/user.js'
import Session from './lib/session.js'
import Permission from './lib/permission.js'
import Nameserver from './lib/nameserver.js'

import groupCase from './lib/test/group.json' with { type: 'json' }
import userCase from './lib/test/user.json' with { type: 'json' }
import groupCaseR from './routes/test/group.json' with { type: 'json' }
import userCaseR from './routes/test/user.json' with { type: 'json' }
import nsCaseR from './routes/test/nameserver.json' with { type: 'json' }

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
  await Group.create(groupCase)
  await Group.create(groupCaseR)
  await User.create(userCase)
  await User.create(userCaseR)
  // await createTestSession()
  await User.mysql.disconnect()
  await Group.mysql.disconnect()
  process.exit(0)
}

// async function createTestSession() {
//   await Session.create({
//     nt_user_id: userCase.nt_user_id,
//     nt_user_session: '3.0.0',
//     last_access: parseInt(Date.now(), 10),
//   })
// }

async function teardown() {
  await Nameserver.destroy({ id: nsCaseR.id })
  await Nameserver.destroy({ id: nsCaseR.id - 1 })
  await Permission.destroy({ id: userCase.id })
  await Permission.destroy({ id: userCase.id - 1 })
  await Session.delete({ nt_user_id: userCase.id })
  await User.destroy({ id: userCase.id })
  await User.destroy({ id: userCaseR.id })
  await Group.destroy({ id: groupCase.id })
  await Group.destroy({ id: groupCaseR.id })
  await User.mysql.disconnect()
  await Group.mysql.disconnect()
  process.exit(0)
}
