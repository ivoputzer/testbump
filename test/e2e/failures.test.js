import { describe, it, after } from 'node:test'
import { match, equal, rejects } from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { cleanEnvironment, execAsync, updateModuleTest, writeJson } from '../util.js'

describe('e2e/failures', async () => {
  const bump = join(import.meta.dirname, '..', '..', 'bin', 'bump.js')
  const cwd = await mkdtemp(join(tmpdir(), 'testbump-e2e-fail-'))
  const env = cleanEnvironment()

  after(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  it('fails gracefully when missing package.json', async () => {
    await rejects(
      execAsync(`node "${bump}"`, { cwd, env }),
      (err) => {
        equal(err.code, 1)
        match(err.stderr, /Error: No package\.json found/)
        return true
      }
    )
  })

  it('fails gracefully when missing git tag', async () => {
    await execAsync('git init', { cwd })
    await writeJson(cwd, 'package.json', { scripts: { test: 'node --test' } })
    await updateModuleTest(cwd, "import { test } from 'node:test'; test('dummy', ()=>{})")
    await rejects(
      execAsync(`node "${bump}"`, { cwd, env }),
      (err) => {
        equal(err.code, 1)
        match(err.stderr, /Error: No baseline git tag found/)
        return true
      }
    )
  })
})
