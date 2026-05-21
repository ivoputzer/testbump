import { describe, it } from 'node:test'
import { equal, rejects } from 'node:assert/strict'
import { createWorkspace } from '../src/workspace.js'

describe('src/workspace (adapter)', () => {
  describe('.getTestCommand()', () => {
    it('throws if missing package.json', async ({ mock }) => {
      const fs = { existsSync: mock.fn(() => false) }
      const ws = createWorkspace('/mock', { fs })

      await rejects(ws.getTestCommand(), (err) => {
        equal(err.message, 'No package.json found.')
        return true
      })
    })

    it('throws if missing test script', async ({ mock }) => {
      const fs = { existsSync: mock.fn(() => true) }
      const fsPromises = { readFile: mock.fn(async () => '{}') }
      const ws = createWorkspace('/mock', { fs, fsPromises })

      await rejects(ws.getTestCommand(), (err) => {
        equal(err.message, 'No "test" script found in package.json.')
        return true
      })
    })

    it('returns test script', async ({ mock }) => {
      const fs = { existsSync: mock.fn(() => true) }
      const fsPromises = { readFile: mock.fn(async () => '{"scripts":{"test":"node --test"}}') }
      const ws = createWorkspace('/mock', { fs, fsPromises })

      equal(await ws.getTestCommand(), 'node --test')
    })
  })

  describe('.overlayFiles()', () => {
    it('filters existence and calls mkdir and cp', async ({ mock }) => {
      const fs = { existsSync: mock.fn((file) => file.includes('exists.txt')) }
      const mkdir = mock.fn()
      const copyFile = mock.fn()
      const ws = createWorkspace('/mock', { fs, fsPromises: { mkdir, copyFile } })

      await ws.overlayFiles(['exists.txt', 'missing.txt'], '/src', '/dest')

      equal(fs.existsSync.mock.callCount(), 2)
      equal(mkdir.mock.callCount(), 1)
      equal(copyFile.mock.callCount(), 1)
    })
  })

  describe('.configureBumpScript()', () => {
    it('writes to package.json and returns version', async ({ mock }) => {
      const fs = { existsSync: mock.fn(() => true) }
      const readFile = mock.fn(async () => '{"version":"1.2.3"}')
      const writeFile = mock.fn(async () => {})

      const ws = createWorkspace('/mock', { fs, fsPromises: { readFile, writeFile } })
      const version = await ws.configureBumpScript()

      equal(version, '1.2.3')
      equal(writeFile.mock.callCount(), 1)

      const writtenData = JSON.parse(writeFile.mock.calls[0].arguments[1])
      equal(writtenData.scripts.bump, 'npm version $(npx testbump)')
    })
  })

  describe('.removeFileSync()', () => {
    it('fails silently without throwing', ({ mock }) => {
      const fs = { rmSync: mock.fn(() => { throw new Error('Boom') }) }
      const ws = createWorkspace('/mock', { fs })
      ws.removeFileSync('/fake/path') // Should not throw
      equal(fs.rmSync.mock.callCount(), 1)
    })
  })

  describe('.npmVersion()', () => {
    it('executes npm version command', async ({ mock }) => {
      const run = mock.fn(async () => ({ pass: true }))
      const ws = createWorkspace('/mock', { run })
      await ws.npmVersion('1.0.0', 'chore: init')
      equal(run.mock.calls[0].arguments[0].includes('npm version 1.0.0'), true)
    })
  })

  describe('.discoverContractFiles()', () => {
    it('parses test runner JSON output', async ({ mock }) => {
      const run = mock.fn(async () => {})
      const fs = { existsSync: mock.fn(() => true) }
      const fsPromises = { readFile: mock.fn(async () => '["/mock/test.js", "/mock/other.test.js"]') }

      const ws = createWorkspace('/mock', { fs, fsPromises, run })
      const files = await ws.discoverContractFiles('node --test', '/results.json')

      equal(files.length, 2)
      equal(files[0], 'test.js') // Paths become relative to cwd
    })
  })

  describe('.syncDependencies()', () => {
    it('synthesizes correct hybrid package.json for Scenario A and triggers install if drifted', async ({ mock }) => {
      const fs = { existsSync: mock.fn(() => true) }
      // devDependencies drifted!
      const wtPkg = JSON.stringify({ dependencies: { a: '2' }, devDependencies: { test: '1' } })
      const parentPkg = JSON.stringify({ dependencies: { a: '2' }, devDependencies: { test: '2' } })

      let writtenPkg = ''
      const fsPromises = {
        readFile: mock.fn(async (p) => p.includes('worktree') ? wtPkg : parentPkg),
        writeFile: mock.fn(async (p, data) => { writtenPkg = data })
      }
      const run = mock.fn(async () => ({ pass: true }))

      const ws = createWorkspace('/mock', { fs, fsPromises, run })
      await ws.syncDependencies('/worktree', '/parent', 'A')

      const result = JSON.parse(writtenPkg)
      equal(result.dependencies.a, '2') // New deps
      equal(result.devDependencies.test, '1') // Old devDeps
      equal(run.mock.callCount(), 1) // Network triggered because devDependencies drifted!
      equal(run.mock.calls[0].arguments[0].includes('--no-package-lock'), true)
    })

    it('synthesizes correct hybrid package.json for Scenario B and triggers install if drifted', async ({ mock }) => {
      const fs = { existsSync: mock.fn(() => true) }
      // dependencies drifted!
      const wtPkg = JSON.stringify({ dependencies: { a: '1' }, devDependencies: { test: '2' } })
      const parentPkg = JSON.stringify({ dependencies: { a: '2' }, devDependencies: { test: '2' } })

      let writtenPkg = ''
      const fsPromises = {
        readFile: mock.fn(async (p) => p.includes('worktree') ? wtPkg : parentPkg),
        writeFile: mock.fn(async (p, data) => { writtenPkg = data })
      }
      const run = mock.fn(async () => ({ pass: true }))

      const ws = createWorkspace('/mock', { fs, fsPromises, run })
      await ws.syncDependencies('/worktree', '/parent', 'B')

      const result = JSON.parse(writtenPkg)
      equal(result.dependencies.a, '1') // Old deps
      equal(result.devDependencies.test, '2') // New devDeps
      equal(run.mock.callCount(), 1) // Network triggered because dependencies drifted!
    })

    it('skips npm install and leverages leeching if hybrid matches parent', async ({ mock }) => {
      const fs = { existsSync: mock.fn(() => true) }
      // No drift! Parent and Worktree are identical.
      const wtPkg = JSON.stringify({ dependencies: { a: '1' }, devDependencies: { test: '1' } })
      const parentPkg = JSON.stringify({ dependencies: { a: '1' }, devDependencies: { test: '1' } })

      const fsPromises = {
        readFile: mock.fn(async (p) => p.includes('worktree') ? wtPkg : parentPkg),
        writeFile: mock.fn(async () => {})
      }
      const run = mock.fn()

      const ws = createWorkspace('/mock', { fs, fsPromises, run })

      await ws.syncDependencies('/worktree', '/parent', 'A')
      await ws.syncDependencies('/worktree', '/parent', 'B')

      // Run was NEVER called! Weaponized leeching active.
      equal(run.mock.callCount(), 0)
    })
  })
})
