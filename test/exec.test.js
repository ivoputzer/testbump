import { describe, it } from 'node:test'
import { equal, match, ok } from 'node:assert/strict'
import { run } from '../src/exec.js'

describe('src/exec (adapter)', () => {
  describe('.run()', () => {
    describe('.stdout', () => {
      it('bufferizes stdout into .stderr response object', async () => {
        const { stdout } = await run('echo "success"')
        match(stdout, /success/)
      })
    })

    describe('.stderr', () => {
      it('bufferizes stderr into .stderr response object', async () => {
        const { stderr } = await run('echo "failure" >&2')
        match(stderr, /failure/)
      })
    })

    describe('.pass', () => {
      it('is true for successful commands and streams stdout', async () => {
        const { pass } = await run('echo "hello world"')
        ok(pass)
      })

      it('is false and captures stderr for failed commands', async () => {
        const { pass } = await run('ls /non-existent-directory-12345')
        ok(!pass)
      })
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
})
