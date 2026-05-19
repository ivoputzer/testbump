import { describe, it } from 'node:test'
import { deepEqual } from 'node:assert/strict'

import customReporter from '../../lib/customReporter.js'

describe('Lib', async () => {
  describe('customReporter', () => {
    it('yields unique test files natively extracted from test events', async () => {
      async function * mockSource () {
        yield { data: { file: '/path/to/test1.js' } }
        yield { data: { file: '/path/to/test2.js' } }
        yield { data: { file: '/path/to/test1.js' } }
        yield { type: 'test:pass', data: {} }
      }
      const reporter = customReporter(mockSource())
      const result = await reporter.next()
      deepEqual(JSON.parse(result.value), ['/path/to/test1.js', '/path/to/test2.js'])
    })
  })
})
