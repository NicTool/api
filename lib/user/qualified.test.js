import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { splitQualifiedUsername } from './qualified.js'

describe('qualified usernames', () => {
  it('uses the configured group for an unqualified username', () => {
    assert.deepEqual(splitQualifiedUsername('alice', 'NicTool'), {
      username: 'alice',
      groupName: 'NicTool',
    })
  })

  it('preserves @ characters in the group name', () => {
    assert.deepEqual(splitQualifiedUsername('alice@Operations@London', 'NicTool'), {
      username: 'alice',
      groupName: 'Operations@London',
    })
  })
})
