import { describe, it } from 'node:test'
import { equal, match, deepEqual, rejects } from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'

import { run, bumpStringFor, overlayFiles, getTestCommand } from '../index.js'
import customReporter from '../lib/reporter.js'

describe('Module', async () => {
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

  // describe('.run', () => {
  //   it('returns pass: true for successful commands and streams stdout', async () => {
  //     const result = await run('echo "hello"')
  //     equal(result.pass, true)
  //     match(result.stdout, /hello/)
  //   })

  //   it('returns pass: false and captures stderr for failed commands', async () => {
  //     const result = await run('ls /non-existent-directory-12345')
  //     equal(result.pass, false)
  //     equal(result.stderr.length > 0, true)
  //   })
  // })

  describe('.getTestCommand', () => {
    it('throws if package.json does not exist', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-test-'))
      await rejects(getTestCommand(cwd), /No package\.json found/)
    })

    it('throws if package.json has no test script', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-test-'))
      await writeFile(join(cwd, 'package.json'), '{}')
      await rejects(getTestCommand(cwd), /No "test" script found/)
    })

    it('returns the test script', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-test-'))
      await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }))
      const cmd = await getTestCommand(cwd)
      equal(cmd, 'vitest')
    })
  })

  describe('.bumpStringFor', () => {
    it('returns major (breaking) when T(old) fails on C(new)', () => {
      equal(bumpStringFor({ testOldOnNewPass: false, testNewOnOldPass: true }), 'major')
    })
    it('returns minor (feature) when T(old) passes on C(new) AND T(new) fails on C(old)', () => {
      equal(bumpStringFor({ testOldOnNewPass: true, testNewOnOldPass: false }), 'minor')
    })
    it('returns patch (fix) when T(old) passes on C(new) AND T(new) passes on C(old)', () => {
      equal(bumpStringFor({ testOldOnNewPass: true, testNewOnOldPass: true }), 'patch')
    })
  })

  describe('.overlayFiles', () => {
    it('copies existing files using injected pure fs mock', async ({ mock }) => {
      const existsSync = mock.fn((file) => file.includes('exists.txt'))
      const mkdir = mock.fn(Function.prototype)
      const cp = mock.fn(Function.prototype)

      const files = ['exists.txt', 'missing.txt']
      const source = join('/', 'src')
      const destination = join('/', 'dest')

      await overlayFiles(files, source, destination, { existsSync, promises: { mkdir, cp } })

      equal(existsSync.mock.callCount(), 2)
      equal(mkdir.mock.callCount(), 1)
      equal(cp.mock.callCount(), 1)
    })
  })
})
