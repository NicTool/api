import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'

const contracts = [
  {
    name: 'audit',
    methods: [
      'insertZoneLog',
      'insertZoneRecordLog',
      'insertGlobalLog',
      'listGlobal',
      'listZones',
      'listZoneRecords',
    ],
  },
  {
    name: 'authz',
    methods: [
      'getObjectGroupId',
      'isInGroupTree',
      'isActiveGroup',
      'isActiveObject',
      'getDirectDelegateAccess',
      'getDelegatedZoneIds',
      'delegatedRecordIdsInZone',
      'zoneDelegationForRecord',
      'liveSessionGroup',
      'permissionRecord',
    ],
  },
  {
    name: 'delegation',
    methods: ['create', 'getDelegated', 'getDelegates', 'put', 'delete', 'writeLog'],
  },
  {
    name: 'permission',
    methods: ['create', 'get', 'getGroup', 'put', 'delete', 'destroy'],
  },
]

describe('new subsystem store stubs', () => {
  for (const backend of ['mongodb', 'elasticsearch']) {
    it(`dispatches all new subsystems to ${backend}`, () => {
      const source = `await Promise.all([
        import('./lib/audit/index.js'),
        import('./lib/authz/index.js'),
        import('./lib/delegation/index.js'),
        import('./lib/permission/index.js'),
      ])`
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
        cwd: process.cwd(),
        env: { ...process.env, NICTOOL_DATA_STORE: backend },
        encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr)
    })

    for (const contract of contracts) {
      it(`${contract.name} has a loud ${backend} stub`, async () => {
        const { default: Repo } = await import(`./${contract.name}/store/${backend}.js`)
        const repo = new Repo()
        for (const method of contract.methods) {
          assert.ok(Object.hasOwn(Repo.prototype, method), `${method} must be explicit`)
          await assert.rejects(() => repo[method]({}), /not yet implemented/)
        }
      })
    }
  }
})
