import { describe, it } from 'node:test'
import { equal, rejects } from 'node:assert/strict'
import { createWorkspace } from '../src/workspace.js'

describe('Workspace Adapter', () => {
  it('getTestCommand() throws if missing package.json', async ({ mock }) => {
    const fs = { existsSync: mock.fn(() => false) }
    const ws = createWorkspace('/mock', { fs })

    await rejects(ws.getTestCommand(), (err) => {
      equal(err.message, 'No package.json found.')
      return true
    })
  })

  it('getTestCommand() throws if missing test script', async ({ mock }) => {
    const fs = { existsSync: mock.fn(() => true) }
    const fsPromises = { readFile: mock.fn(async () => '{}') }
    const ws = createWorkspace('/mock', { fs, fsPromises })

    await rejects(ws.getTestCommand(), (err) => {
      equal(err.message, 'No "test" script found in package.json.')
      return true
    })
  })

  it('getTestCommand() returns test script', async ({ mock }) => {
    const fs = { existsSync: mock.fn(() => true) }
    const fsPromises = { readFile: mock.fn(async () => '{"scripts":{"test":"node --test"}}') }
    const ws = createWorkspace('/mock', { fs, fsPromises })

    equal(await ws.getTestCommand(), 'node --test')
  })

  it('overlayFiles() filters existence and calls mkdir and cp', async ({ mock }) => {
    const fs = { existsSync: mock.fn((file) => file.includes('exists.txt')) }
    const mkdir = mock.fn()
    const cp = mock.fn()
    const ws = createWorkspace('/mock', { fs, fsPromises: { mkdir, cp } })

    await ws.overlayFiles(['exists.txt', 'missing.txt'], '/src', '/dest')

    equal(fs.existsSync.mock.callCount(), 2)
    equal(mkdir.mock.callCount(), 1)
    equal(cp.mock.callCount(), 1)
  })

  it('configureBumpScript() writes to package.json and returns version', async ({ mock }) => {
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

  it('removeFileSync() fails silently without throwing', ({ mock }) => {
    const fs = { rmSync: mock.fn(() => { throw new Error('Boom') }) }
    const ws = createWorkspace('/mock', { fs })
    ws.removeFileSync('/fake/path') // Should not throw
    equal(fs.rmSync.mock.callCount(), 1)
  })

  it('npmVersion() executes npm version command', async ({ mock }) => {
    const run = mock.fn(async () => ({ pass: true }))
    const ws = createWorkspace('/mock', { run })
    await ws.npmVersion('1.0.0', 'chore: init')
    equal(run.mock.calls[0].arguments[0].includes('npm version 1.0.0'), true)
  })

  it('discoverContractFiles() parses test runner JSON output', async ({ mock }) => {
    const run = mock.fn(async () => {})
    const fs = { existsSync: mock.fn(() => true) }
    // Mock the file written by the native test reporter
    const fsPromises = { readFile: mock.fn(async () => '["/mock/test.js", "/mock/other.test.js"]') }

    const ws = createWorkspace('/mock', { fs, fsPromises, run })
    const files = await ws.discoverContractFiles('node --test', '/results.json')

    equal(files.length, 2)
    equal(files[0], 'test.js') // Paths become relative to cwd
  })
})
