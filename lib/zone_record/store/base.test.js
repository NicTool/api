import fs from 'node:fs'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import * as RR from '@nictool/dns-resource-record'

import { checkPut, mergeChanges } from './base.js'

async function put(current, changes, zone) {
  const target = mergeChanges(current, changes)
  await checkPut(current, target, changes, async () => zone)
  return target
}

describe('zone_record checkPut', () => {
  // as the API takes it: the covered type and times as text
  const rrsig = {
    ...new RR.RRSIG(null).getCanonical(),
    'type covered': 'A',
    'signature expiration': '20030212123200',
    'signature inception': '20030113123200',
  }
  delete rrsig.class

  it('checks an RRSIG edit against its own owner', async () => {
    assert.equal((await put(rrsig, { signature: 'BAUG' })).signature, 'BAUG')
    await assert.rejects(put(rrsig, { 'signers name': 'other.example.' }), { code: 'STORE_INVALID' })
  })

  it('checks an RRSIG edit against a relative owner under its zone', async () => {
    const www = { ...rrsig, owner: 'www', labels: 3 }
    assert.equal((await put(www, { signature: 'BAUG' }, 'example.com')).signature, 'BAUG')
    await assert.rejects(put(www, { 'signers name': 'other.example.' }, 'example.com'), {
      code: 'STORE_INVALID',
    })
  })

  it('takes rdata sent back as stored, even when it is invalid', async () => {
    const a = { id: 1, zid: 1, owner: 'a.example.com.', ttl: 300, type: 'A', address: '1.2.3' }
    assert.equal((await put(a, { ...a, ttl: 600 })).ttl, 600)
    await assert.rejects(put(a, { ...a, address: '1.2.4' }), { code: 'STORE_INVALID' })
  })

  it('refuses the text "undefined" for a field the record lacks', async () => {
    const { flags, ...naptr } = JSON.parse(fs.readFileSync('lib/zone_record/test/rrs/naptr.json'))
    await assert.rejects(put(naptr, { flags: 'undefined' }), { code: 'STORE_INVALID' })
  })
})
