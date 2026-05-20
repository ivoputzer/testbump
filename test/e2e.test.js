import { describe, it, before, after } from 'node:test'
import { match, equal, rejects } from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
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

describe('Integration E2E (cli)', async () => {
  it('outputs help text natively with --help', async () => {
    const { stdout } = await execAsync(`node "${bump}" --help`)
    equal(stdout.includes('Usage:'), true)
    equal(stdout.includes('testbump [options]'), true)
  })

  it('outputs help text natively with -h', async () => {
    const { stdout } = await execAsync(`node "${bump}" -h`)
    equal(stdout.includes('Usage:'), true)
  })

  it('outputs version natively with --version', async () => {
    const { stdout } = await execAsync(`node "${bump}" --version`)
    // Matches standard semver (e.g., 1.1.0)
    equal(/^\d+\.\d+\.\d+/.test(stdout.trim()), true)
  })

  it('outputs version natively with -v', async () => {
    const { stdout } = await execAsync(`node "${bump}" -v`)
    equal(/^\d+\.\d+\.\d+/.test(stdout.trim()), true)
  })

  it('outputs detailed info to stderr while preserving string output on --verbose', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'testbump-verbose-'))
    const env = getCleanEnv()

    await execAsync('git init', { cwd })
    await execAsync('git config user.email "test@bump.local"', { cwd })
    await execAsync('git config user.name "test"', { cwd })

    await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    await writeFile(join(cwd, 'index.js'), 'export const a = 1;')
    await writeFile(join(cwd, 'test.js'), 'import {test} from "node:test"; test("ok", ()=>{});')

    await execAsync('git add . && git commit -m "init" && git tag v1.0.0 -m "1.0.0"', { cwd })

    const { stdout, stderr } = await execAsync(`node "${bump}" --verbose`, { cwd, env })

    // Output should still just be 'patch' for stdout to allow for standard npm version chaining
    equal(stdout.trim(), 'patch')
    equal(stderr.includes('[testbump] Execution initiated.'), true)

    // stderr should contain our matrix explanation
    match(stderr, /T\(old\) on C\(new\)/)
    match(stderr, /T\(new\) on C\(old\)/)

    await rm(cwd, { recursive: true, force: true })
  })

  it('outputs human string to stdout to actively break npm chaining on --dry-run', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'testbump-dryrun-'))
    const env = getCleanEnv()

    await execAsync('git init', { cwd })
    await execAsync('git config user.email "test@bump.local"', { cwd })
    await execAsync('git config user.name "test"', { cwd })

    await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    await writeFile(join(cwd, 'index.js'), 'export const a = 1;')
    await writeFile(join(cwd, 'test.js'), 'import {test} from "node:test"; test("ok", ()=>{});')

    await execAsync('git add . && git commit -m "init" && git tag v1.0.0 -m "1.0.0"', { cwd })

    const { stdout, stderr } = await execAsync(`node "${bump}" --dry-run`, { cwd, env })

    // Output is explicitly NOT a valid semver string so it will break $(npm version ...)
    equal(stdout.includes('[testbump] Dry run complete. Would bump: patch'), true)
    equal(stderr.trim(), '')

    await rm(cwd, { recursive: true, force: true })
  })

  describe('Integration E2E (--init)', async () => {
    it('bootstraps a project successfully', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-init-'))
      const env = getCleanEnv()

      await execAsync('git init', { cwd })
      await execAsync('git config user.email "test@bump.local"', { cwd })
      await execAsync('git config user.name "test"', { cwd })

      // Setup blank project without testbump
      const pkgJson = JSON.stringify({ version: '1.2.3' })
      await writeFile(join(cwd, 'package.json'), pkgJson)

      // Must commit something so git tags have a target HEAD
      await execAsync('git add . && git commit -m "initial file"', { cwd })

      const { stdout } = await execAsync(`node "${bump}" --init`, { cwd, env })

      // Verify Console Output
      equal(stdout.includes('Successfully configured "bump" script'), true)
      equal(stdout.includes('Created baseline tag: v1.2.3'), true)

      // Verify Package.json mutated
      const updatedPkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
      equal(updatedPkg.scripts.bump, 'npm version $(npx testbump)')

      // Verify Tag actually exists natively
      const { stdout: tagOut } = await execAsync('git describe --tags --abbrev=0', { cwd })
      equal(tagOut.trim(), 'v1.2.3')

      await rm(cwd, { recursive: true, force: true })
    })

    it('fails gracefully if not a git repository', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-init-fail-'))
      await writeFile(join(cwd, 'package.json'), '{}')

      await rejects(
        execAsync(`node "${bump}" --init`, { cwd }),
        (err) => {
          equal(err.code, 1)
          equal(err.stderr.includes('[testbump] Initialization Error: Not a git repository'), true)
          return true
        }
      )

      await rm(cwd, { recursive: true, force: true })
    })

    it('allows custom messages during initialization', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-init-custom-'))
      const env = getCleanEnv()

      await execAsync('git init', { cwd })
      await execAsync('git config user.email "test@bump.local"', { cwd })
      await execAsync('git config user.name "test"', { cwd })

      await writeFile(join(cwd, 'package.json'), JSON.stringify({ version: '1.0.0' }))
      await execAsync('git add . && git commit -m "initial file"', { cwd })

      // We pass a single message to be used for the baseline
      await execAsync(`node "${bump}" --init --init-message "baseline setup"`, { cwd, env })

      // Verify there is only ONE new commit since "initial file"
      const { stdout: commitLog } = await execAsync('git log -1 --pretty=%B', { cwd })
      equal(commitLog.trim(), 'baseline setup')

      // Verify Tag exists on that exact commit
      const { stdout: tagLog } = await execAsync('git tag -n1', { cwd })
      equal(tagLog.includes('baseline setup'), true)

      await rm(cwd, { recursive: true, force: true })
    })
  })
})

describe('Integration E2E (custom scopes)', async () => {
  it('scopes matrix to specific test files when positional arguments are provided', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'testbump-scopes-'))
    const env = getCleanEnv()

    await execAsync('git init', { cwd })
    await execAsync('git config user.email "test@bump.local"', { cwd })
    await execAsync('git config user.name "test"', { cwd })

    await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))

    // Create Baseline Code with 2 discrete features and tests
    await writeFile(join(cwd, 'index.js'), 'export const a = 1;\nexport const b = 2;')
    await writeFile(join(cwd, 'a.test.js'), 'import {test} from "node:test"; import assert from "node:assert"; import {a} from "./index.js"; test("a", () => assert.equal(a, 1));')
    await writeFile(join(cwd, 'b.test.js'), 'import {test} from "node:test"; import assert from "node:assert"; import {b} from "./index.js"; test("b", () => assert.equal(b, 2));')

    await execAsync('git add . && git commit -m "init" && git tag v1.0.0 -m "1.0.0"', { cwd })

    // BREAK THE CONTRACT for feature 'b' on the new HEAD
    await writeFile(join(cwd, 'index.js'), 'export const a = 1;\nexport const b = 3; // broken logic')

    // If we run normal testbump, it should detect 'b' breaking and return MAJOR
    const { stdout: outMajor } = await execAsync(`node "${bump}"`, { cwd, env })
    equal(outMajor.trim(), 'major')

    // But if we artificially scope it ONLY to test 'a', it ignores 'b', thus old contracts pass -> PATCH
    const { stdout: outPatch } = await execAsync(`node "${bump}" a.test.js`, { cwd, env })
    equal(outPatch.trim(), 'patch')

    await rm(cwd, { recursive: true, force: true })
  })
})
