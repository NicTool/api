import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it, before, after, beforeEach } from 'node:test'

import GroupRepoFile from '../group/store/file.js'
import PermissionRepoFile from '../permission/store/file.js'
import Credentials from '../user/credentials.js'
import UserRepoFile from '../user/store/file.js'
import FileStore, { nextId, resolveCodec } from './file.js'
import { seed } from '../../test/seed.js'

const envKeys = ['NICTOOL_DATA_STORE', 'NICTOOL_DATA_STORE_PATH', 'NICTOOL_CONF_DIR']

describe('file store', () => {
  const savedEnv = {}
  let tmp

  it('allocates after the highest existing id', () => {
    assert.equal(nextId([]), 1)
    assert.equal(nextId([{ id: 9 }, { id: 2 }, {}]), 10)
    assert.equal(nextId([{ id: 9 }], 12), 13)
    assert.throws(() => nextId([{ id: 0xffffffff }]), /id space exhausted/)
  })

  before(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-filestore-'))
  })

  after(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) process.env[key] = val
      else delete process.env[key]
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  beforeEach(() => {
    for (const key of envKeys) delete process.env[key]
    // NICTOOL_CONF_DIR points somewhere without an api.json, so storeConfig
    // resolves purely from the env vars each test sets.
    process.env.NICTOOL_CONF_DIR = path.join(tmp, 'no-such-conf')
    process.env.NICTOOL_DATA_STORE_PATH = tmp
  })

  it(`writes .json for a json store and .toml for a toml store`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    await seed(new FileStore('zone'), 'zone', [{ id: 1 }])
    assert.equal(fs.existsSync(path.join(tmp, 'zone.json')), true)

    process.env.NICTOOL_DATA_STORE = 'toml'
    await seed(new FileStore('zone'), 'zone', [{ id: 1 }])
    assert.equal(fs.existsSync(path.join(tmp, 'zone.toml')), true)
  })

  it(`round-trips rows through the json codec`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    const store = new FileStore('rt')

    await seed(store, 'rt', [{ id: 1, zone: 'example.com', deleted: false }])

    assert.deepEqual(await store.load('rt'), [{ id: 1, zone: 'example.com', deleted: false }])
  })

  it(`preserves null through json, which TOML cannot`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    const jsonStore = new FileStore('nulls')
    await seed(jsonStore, 'nulls', [{ id: 1, last_publish: null }])

    const [jsonRow] = await jsonStore.load('nulls')
    assert.equal(jsonRow.last_publish, null, 'json keeps the null')

    process.env.NICTOOL_DATA_STORE = 'toml'
    const tomlStore = new FileStore('nulls')
    await seed(tomlStore, 'nulls', [{ id: 1, last_publish: null }])

    const [tomlRow] = await tomlStore.load('nulls')
    assert.equal(tomlRow.last_publish, undefined, 'toml drops it — hence the repair in the zone store')
  })

  it(`returns an empty list when the file does not exist`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    assert.deepEqual(await new FileStore('absent').load('absent'), [])
  })

  it(`returns an empty list when the key is missing or not an array`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    fs.writeFileSync(path.join(tmp, 'odd.json'), JSON.stringify({ odd: 'not-an-array' }))

    assert.deepEqual(await new FileStore('odd').load('odd'), [])
  })

  it(`creates missing parent directories on write`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    process.env.NICTOOL_DATA_STORE_PATH = path.join(tmp, 'deep', 'nested')

    await seed(new FileStore('zone'), 'zone', [{ id: 1 }])

    assert.equal(fs.existsSync(path.join(tmp, 'deep', 'nested', 'zone.json')), true)
  })

  it(`fails loudly rather than writing inside the package when no path is set`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    delete process.env.NICTOOL_DATA_STORE_PATH

    await assert.rejects(() => new FileStore('zone').load('zone'), /no path is configured/)
  })

  it(`defaults to the json codec for an unrecognized type`, () => {
    process.env.NICTOOL_DATA_STORE = 'nonsense'
    assert.equal(resolveCodec().ext, 'json')
  })

  for (const type of ['json', 'toml']) {
    it(`never lets a ${type} load read a half-written file`, async (t) => {
      process.env.NICTOOL_DATA_STORE = type
      const store = new FileStore('torn')
      const rows = Array.from({ length: 50 }, (_, id) => ({ id, owner: `host${id}.example.com.` }))
      await seed(store, 'torn', rows)

      const rename = fsp.rename
      let seen
      t.mock.method(fsp, 'rename', async (from, to) => {
        seen = await store.load('torn').then(
          (r) => r.length,
          (err) => err.message,
        )
        await rename(from, to)
      })
      await seed(store, 'torn', [...rows, { id: 50, owner: 'new.example.com.' }])

      assert.equal(seen, rows.length)
      assert.equal((await store.load('torn')).length, rows.length + 1)
      assert.deepEqual(
        fs.readdirSync(tmp).filter((f) => f.endsWith('.tmp')),
        [],
      )
    })

    it(`keeps the mode of an existing ${type} file`, { skip: process.platform === 'win32' }, async () => {
      process.env.NICTOOL_DATA_STORE = type
      const store = new FileStore('moded')
      await seed(store, 'moded', [{ id: 1 }])
      fs.chmodSync(store.filePath, 0o664)
      await seed(store, 'moded', [{ id: 2 }])
      assert.equal(fs.statSync(store.filePath).mode & 0o777, 0o664)
    })

    it(`serializes ${type} id allocation and does not reuse a destroyed id`, async () => {
      process.env.NICTOOL_DATA_STORE = type
      const store = new GroupRepoFile()
      const ids = await Promise.all(
        Array.from({ length: 20 }, (_, index) => store.create({ name: `group-${index}.example` })),
      )

      assert.deepEqual(
        [...ids].sort((a, b) => a - b),
        Array.from({ length: 20 }, (_, index) => index + 1),
      )
      await store.destroy({ id: 20 })
      assert.equal(await store.create({ name: 'after-destroy.example' }), 21)
    })

    it(`keeps ${type} users created while a permission is added to a user`, async (t) => {
      process.env.NICTOOL_DATA_STORE = type
      fs.rmSync(path.join(tmp, `user.${type}`), { force: true })
      const users = new UserRepoFile()
      const uid = await users.create({ gid: 1, username: 'holder', email: 'holder@example.com' })

      // the users are created once the permission create has read the user file
      const read = FileStore.prototype._read
      const racers = []
      t.mock.method(FileStore.prototype, '_read', async function (file) {
        const data = await read.call(this, file)
        if (racers.length === 0 && file.endsWith(`user.${type}`)) {
          for (let index = 0; index < 5; index++) {
            racers.push(
              users.create({ gid: 1, username: `racer-${index}`, email: `racer-${index}@example.com` }),
            )
          }
        }
        return data
      })

      const permId = await new PermissionRepoFile().create({ uid, gid: 1, zone: { create: true } })
      const created = await Promise.all(racers)
      t.mock.restoreAll()

      const stored = await new FileStore('user').load('user')
      assert.deepEqual(
        stored.map((user) => user.id).sort((a, b) => a - b),
        [uid, ...created].sort((a, b) => a - b),
      )
      assert.equal(stored.find((user) => user.id === uid).permissions.id, permId)
    })

    for (const [label, change] of [
      ['put', (id) => new GroupRepoFile().put({ id, name: 'renamed.example' })],
      ['delete', (id) => new GroupRepoFile().delete({ id })],
      ['destroy', (id) => new GroupRepoFile().destroy({ id })],
      ['permission put', (id) => new PermissionRepoFile().put({ id, zone: { create: true } })],
    ]) {
      it(`keeps ${type} groups created during a group ${label}`, async (t) => {
        process.env.NICTOOL_DATA_STORE = type
        for (const name of ['group', 'user', 'permission']) {
          fs.rmSync(path.join(tmp, `${name}.${type}`), { force: true })
        }
        const groups = new GroupRepoFile()
        const gid = await groups.create({ name: 'target.example' })

        // the groups are created once the change has read the group file
        const read = FileStore.prototype._read
        const racers = []
        t.mock.method(FileStore.prototype, '_read', async function (file) {
          const data = await read.call(this, file)
          if (racers.length === 0 && file.endsWith(`group.${type}`)) {
            for (let index = 0; index < 5; index++) {
              racers.push(groups.create({ name: `racer-${index}.example` }))
            }
          }
          return data
        })

        assert.equal(await change(gid), true)
        assert.equal(racers.length, 5)
        const created = await Promise.all(racers)
        t.mock.restoreAll()

        const stored = (await new FileStore('group').load('group')).map((group) => group.id)
        for (const id of created) assert.ok(stored.includes(id), `group ${id} survives`)
      })
    }

    it(`does not reuse a ${type} id destroyed before last_id was recorded`, async () => {
      process.env.NICTOOL_DATA_STORE = type
      fs.rmSync(path.join(tmp, `group.${type}`), { force: true })
      await seed(new FileStore('group'), 'group', [
        { id: 19, name: 'nineteen.example' },
        { id: 20, name: 'twenty.example' },
      ])
      const groups = new GroupRepoFile()
      await groups.destroy({ id: 20 })
      assert.equal(await groups.create({ name: 'next.example' }), 21)
    })

    it(`refuses a ${type} permission with no user or group`, async () => {
      process.env.NICTOOL_DATA_STORE = type
      await assert.rejects(new PermissionRepoFile().create({ name: 'no target' }), /needs a user or group/)
    })

    it(`does not write ${type} when a change finds nothing`, async () => {
      process.env.NICTOOL_DATA_STORE = type
      fs.rmSync(path.join(tmp, `zone.${type}`), { force: true })
      assert.equal(await new FileStore('zone').mutate('zone', () => false), false)
      assert.equal(fs.existsSync(path.join(tmp, `zone.${type}`)), false)
    })

    it(`keeps ${type} users created while a login upgrades its password hash`, async (t) => {
      process.env.NICTOOL_DATA_STORE = type
      await seed(new FileStore('group'), 'group', [{ id: 1, name: 'NicTool' }])
      await seed(new FileStore('user'), 'user', [{ id: 1, gid: 1, username: 'legacy', password: 'plain' }])
      const users = new UserRepoFile()
      const forStorage = Credentials.forStorage.bind(Credentials)
      const created = []
      t.mock.method(Credentials, 'forStorage', async (pass) => {
        for (let index = 0; index < 5; index++) {
          created.push(
            await users.create({ gid: 1, username: `racer-${index}`, email: `racer-${index}@example.com` }),
          )
        }
        return forStorage(pass)
      })

      const login = await users.authenticate({ username: 'legacy', password: 'plain' })

      assert.equal(login.user.id, 1)
      const stored = await new FileStore('user').load('user')
      assert.deepEqual(
        stored.map((user) => user.id).sort((a, b) => a - b),
        [1, ...created].sort((a, b) => a - b),
      )
      assert.ok(stored.find((user) => user.id === 1).pass_salt, 'the hash was upgraded')
    })
  }
})
