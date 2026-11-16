import fs from 'node:fs'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import * as RR from '@nictool/dns-resource-record'

import { checkPut, mergeChanges } from './base.js'

function put(current, changes) {
  const target = mergeChanges(current, changes)
  checkPut(current, target, changes)
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

  it('checks an RRSIG edit against its own owner', () => {
    assert.equal(put(rrsig, { signature: 'BAUG' }).signature, 'BAUG')
    assert.throws(() => put(rrsig, { 'signers name': 'other.example.' }), { code: 'STORE_INVALID' })
  })

  it('takes rdata sent back as stored, even when it is invalid', () => {
    const a = { id: 1, zid: 1, owner: 'a.example.com.', ttl: 300, type: 'A', address: '1.2.3' }
    assert.equal(put(a, { ...a, ttl: 600 }).ttl, 600)
    assert.throws(() => put(a, { ...a, address: '1.2.4' }), { code: 'STORE_INVALID' })
  })

  it('refuses the text "undefined" for a field the record lacks', () => {
    const { flags, ...naptr } = JSON.parse(fs.readFileSync('lib/zone_record/test/rrs/naptr.json'))
    assert.throws(() => put(naptr, { flags: 'undefined' }), { code: 'STORE_INVALID' })
  })
})
