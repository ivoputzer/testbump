import { describe, it, before, after } from 'node:test'
import { equal, rejects } from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const bump = join(import.meta.dirname, '..', 'bin', 'bump.js')

// CRITICAL NODE QUIRK: Strip internal IPC variables for tests.
// Without this, executing `testbump` via `exec` inside an existing `node --test` suite
// causes the nested test runners to hijack the parent's IPC pipe and hang.
const getCleanEnv = () => {
  const env = { ...process.env }
  delete env.NODE_TEST_IPC
  delete env.NODE_TEST_CONTEXT
  return env
}

describe('Integration E2E (failure)', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'testbump-e2e-fail-'))
  const env = getCleanEnv()

  after(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  it('fails gracefully when missing package.json', async () => {
    await rejects(
      execAsync(`node "${bump}"`, { cwd, env }),
      (err) => {
        equal(err.code, 1)
        equal(err.stderr.includes('[testbump] Error: No package.json found.'), true)
        return true
      }
    )
  })

  it('fails gracefully when missing git tag', async () => {
    await execAsync('git init', { cwd })
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    await writeFile(join(cwd, 'test.js'), 'import {test} from \'node:test\'; test(\'dummy\', ()=>{});')

    await rejects(
      execAsync(`node "${bump}"`, { cwd, env }),
      (err) => {
        equal(err.code, 1)
        equal(err.stderr.includes('[testbump] Error: No baseline git tag found!'), true)
        return true
      }
    )
  })
})

describe('Integration E2E (success)', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'testbump-e2e-'))
  const env = getCleanEnv()

  after(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  before(async () => {
    await execAsync('git init', { cwd })
    await execAsync('git config user.email "test@bump.local"', { cwd })
    await execAsync('git config user.name "test"', { cwd })

    const pkgJson = JSON.stringify({
      type: 'module',
      scripts: { test: 'node --test' }
    })
    await writeFile(join(cwd, 'package.json'), pkgJson)

    const srcCodeOld = 'export const sum = (a, b) => a + b\n'
    await writeFile(join(cwd, 'index.js'), srcCodeOld)

    const testCodeOld = `
import { test } from 'node:test'
import { equal } from 'node:assert/strict'
import { sum } from './index.js'

test('sum', () => equal(sum(1, 2), 3))
`
    await writeFile(join(cwd, 'test.js'), testCodeOld)

    await execAsync('git add .', { cwd })
    await execAsync('git commit -m "initial contract"', { cwd })
    await execAsync('git tag v0.0.1 -m "0.0.1"', { cwd })
  })

  it('scenario: PATCH (no API changes)', async () => {
    const srcCodePatch = 'export const sum = (a, b) => a + b\n// patch comment'
    await writeFile(join(cwd, 'index.js'), srcCodePatch)

    const { stdout } = await execAsync(`node "${bump}"`, { cwd, env })
    equal(stdout.trim(), 'patch')
  })

  it('scenario: MINOR (new contract added, fails against old logic)', async () => {
    const srcCodeNew = `
export const sum = (a, b) => a + b
export const sub = (a, b) => a - b
`
    await writeFile(join(cwd, 'index.js'), srcCodeNew)

    const testCodeMinor = `
import { test } from 'node:test'
import { equal } from 'node:assert/strict'
import { sum, sub } from './index.js'

test('sum', () => equal(sum(1, 2), 3))
test('sub', () => equal(sub(2, 1), 1))
`
    await writeFile(join(cwd, 'test.js'), testCodeMinor)

    const { stdout } = await execAsync(`node "${bump}"`, { cwd, env })
    equal(stdout.trim(), 'minor')
  })

  it('scenario: MAJOR (break previous contract entirely)', async () => {
    const srcCodeMajor = 'export const sum = (a, b) => a + b + 1\n'
    await writeFile(join(cwd, 'index.js'), srcCodeMajor)

    const testCodeOld = `
import { test } from 'node:test'
import { equal } from 'node:assert/strict'
import { sum } from './index.js'

test('sum', () => equal(sum(1, 2), 3))
`
    await writeFile(join(cwd, 'test.js'), testCodeOld)

    const { stdout } = await execAsync(`node "${bump}"`, { cwd, env })
    equal(stdout.trim(), 'major')
  })
})
