import { describe, it } from 'node:test'
import { equal, match, deepEqual } from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'

import { run, categorizeFiles, bumpStringFor, overlayFiles } from '../index.js'
import customReporter from '../lib/reporter.js'

describe('Module', async () => {
  describe('lib/.customReporter', () => {
    it('yields unique test files natively extracted from test events', async () => {
      async function * source () {
        yield { data: { file: '/path/to/test1.js' } }
        yield { data: { file: '/path/to/test2.js' } }
        yield { data: { file: '/path/to/test1.js' } } // duplicate
        yield { type: 'test:pass', data: {} } // event without file
      }

      const reporter = customReporter(source())
      const { value } = await reporter.next()

      deepEqual(JSON.parse(value), ['/path/to/test1.js', '/path/to/test2.js'])
    })
  })

  describe('.run', () => {
    it('run adds pass pass: true for successful commands', async () => {
      const result = await run('echo "hello"')
      equal(result.pass, true)
      match(result.stdout, /hello/)
    })
  })

  describe('.categorizeFiles', () => {
    it('removes package.json file', () => {
      const allFiles = ['index.js', 'package.json']
      const testFiles = []
      const result = categorizeFiles(allFiles, testFiles)

      deepEqual(result.sourceFiles, ['index.js'])
    })

    it('removes tests from source files', () => {
      const allFiles = ['index.js', 'test.js']
      const testFiles = ['test.js']
      const result = categorizeFiles(allFiles, testFiles)

      deepEqual(result.sourceFiles, ['index.js'])
    })

    it('separates source from tests', () => {
      const allFiles = ['index.js', 'test.js', 'package.json', 'README.md']
      const testFiles = ['test.js']

      const result = categorizeFiles(allFiles, testFiles)
      deepEqual(result.testFiles, ['test.js'])
      deepEqual(result.sourceFiles, ['index.js', 'README.md'])
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

      const expectedSrc = join(source, 'exists.txt')
      const expectedDst = join(destination, 'exists.txt')

      deepEqual(mkdir.mock.calls[0].arguments, [dirname(expectedDst), { recursive: true }])
      deepEqual(cp.mock.calls[0].arguments, [expectedSrc, expectedDst, { force: true }])
    })

    it('Integration', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'testbump-test-'))
      const srcDir = join(tmp, 'src')
      const dstDir = join(tmp, 'dest')
      await mkdir(srcDir)
      await writeFile(join(srcDir, 'file.txt'), 'hello')
      await overlayFiles(['file.txt'], srcDir, dstDir)
      equal(existsSync(join(dstDir, 'file.txt')), true)
    })
  })
})
