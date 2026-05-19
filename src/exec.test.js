import { describe, it } from 'node:test'
import { equal, match } from 'node:assert/strict'
import { run } from './exec.js'

describe('Exec Adapter', () => {
  it('returns pass: true for successful commands and streams stdout', async () => {
    const result = await run('echo "hello"')
    equal(result.pass, true)
    match(result.stdout, /hello/)
  })

  it('returns pass: false and captures stderr for failed commands', async () => {
    const result = await run('ls /non-existent-directory-12345')
    equal(result.pass, false)
    equal(result.stderr.length > 0, true)
  })
})
