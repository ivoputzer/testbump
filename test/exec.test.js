import { describe, it } from 'node:test'
import { equal, match } from 'node:assert/strict'
import { run } from '../src/exec.js'

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

  it('aborts runaway processes using timeout', async () => {
    const result = await run('sleep 10', process.cwd(), { timeout: 100 })
    equal(result.pass, false)
    match(result.stderr, /Process timed out after 100ms/)
  })

  it('retries failed commands based on retry configuration', async () => {
    const result = await run('node -e "process.exit(1)"', process.cwd(), { retries: 2 })

    equal(result.pass, false)
    equal(result.attempt, 2)
  })
})
