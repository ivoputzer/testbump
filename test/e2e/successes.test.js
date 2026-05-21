import { describe, it, after, before } from 'node:test'
import { match } from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { cleanEnvironment, createModule, createModuleVersion, execAsync, updateModuleSource, updateModuleTest } from '../util.js'

describe('e2e/successes', async () => {
  const bump = join(import.meta.dirname, '..', '..', 'bin', 'bump.js')
  const cwd = await mkdtemp(join(tmpdir(), 'testbump-e2e-'))
  const env = cleanEnvironment()

  after(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  before(async () => {
    await createModule(cwd, { private: true }, { install: false })
    await updateModuleSource(cwd, 'export const sum = (a, b) => a + b\n')
    await updateModuleTest(cwd, `
      import { test } from 'node:test'
      import { equal } from 'node:assert/strict'
      import { sum } from './index.js'
      test('sum', () => equal(sum(1, 2), 3))
    `)
    await createModuleVersion(cwd, 'initial commit', 'v0.0.1')
  })

  it('scenario: no api changes (patch)', async () => {
    await updateModuleSource(cwd, `
      export const sum = (a, b) => a + b // patch comment
    `)

    const { stdout } = await execAsync(`node "${bump}"`, { cwd, env })
    match(stdout, /patch/)
  })

  it('scenario: adds new contract which fails against old logic (minor)', async () => {
    await updateModuleSource(cwd, `
      export const sum = (a, b) => a + b
      export const sub = (a, b) => a - b
    `)
    await updateModuleTest(cwd, `
      import { test } from 'node:test'
      import { equal } from 'node:assert/strict'
      import { sum, sub } from './index.js'

      test('sum', () => equal(sum(1, 2), 3))
      test('sub', () => equal(sub(2, 1), 1))
    `)

    const { stdout } = await execAsync(`node "${bump}"`, { cwd, env })
    match(stdout, /minor/)
  })

  it('scenario: breaks previous contract entirely (major)', async () => {
    await updateModuleSource(cwd, `
      export const sum = (a, b) => a + b + 1
    `)

    const { stdout } = await execAsync(`node "${bump}"`, { cwd, env })
    match(stdout, /major/)
  })
})
