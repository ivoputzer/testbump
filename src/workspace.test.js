import { describe, it } from 'node:test'
import { equal, rejects, deepEqual } from 'node:assert/strict'
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
})
