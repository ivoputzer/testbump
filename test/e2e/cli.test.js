import { describe, it } from 'node:test'
import { match, equal, rejects } from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { cleanEnvironment, execAsync, createModule, createModuleCommit, updateModuleSource, updateModuleTest, createModuleVersion, readJson, writeJson } from '../util.js'

describe('e2e/cli', () => {
  const bump = join(import.meta.dirname, '..', '..', 'bin', 'bump.js')

  describe('--help', () => {
    it('outputs help text natively with --help', async () => {
      const { stdout } = await execAsync(`node "${bump}" --help`)
      equal(stdout.includes('Usage:'), true) // fixme: replace with match
      equal(stdout.includes('testbump [options]'), true) // fixme: replace with match
    })

    it('outputs help text natively with -h', async () => {
      const { stdout } = await execAsync(`node "${bump}" -h`)
      equal(stdout.includes('Usage:'), true) // fixme: replace with match
    })
  })

  describe('--version', () => {
    it('outputs version natively with --version', async () => {
      const { stdout } = await execAsync(`node "${bump}" --version`)
      // Matches standard semver (e.g., 1.1.0)
      equal(/^\d+\.\d+\.\d+/.test(stdout.trim()), true)
    })

    it('outputs version natively with -v', async () => {
      const { stdout } = await execAsync(`node "${bump}" -v`)
      equal(/^\d+\.\d+\.\d+/.test(stdout.trim()), true)
    })
  })

  describe('--verbose', () => {
    it('outputs detailed info to stderr while preserving string output on --verbose', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-verbose-'))
      const env = cleanEnvironment()

      await createModule(cwd, { scripts: { test: 'node --test' } })
      await updateModuleSource(cwd, 'export const a = 1')
      await updateModuleTest(cwd, "import { test } from 'node:test'; test('ok', Function.prototype)")
      await createModuleVersion(cwd, 'baseline', '1.0.0')

      const { stdout, stderr } = await execAsync(`node "${bump}" --verbose`, { cwd, env })

      equal(stdout.trim(), 'patch')

      // stderr should contain execution steps
      match(stderr, /Execution initiated/)
      match(stderr, /Executing test script: `node --test`/)

      // stderr should contain our matrix explanation
      match(stderr, /T\(old\) on C\(new\)/)
      match(stderr, /T\(new\) on C\(old\)/)

      await rm(cwd, { recursive: true, force: true })
    })
  })

  describe('--dry-run', () => {
    it('outputs human string to stdout to actively break npm chaining on --dry-run', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-dryrun-'))
      const env = cleanEnvironment()

      await createModule(cwd, { scripts: { test: 'node --test' } })
      await updateModuleSource(cwd, 'export const a = 1')
      await updateModuleTest(cwd, "import { test } from 'node:test'; test('ok', Function.prototype)")
      await createModuleVersion(cwd, 'baseline', '1.0.0')

      const { stdout, stderr } = await execAsync(`node "${bump}" --dry-run`, { cwd, env })

      // output is explicitly not a valid semver string so it will break $(npm version ...)
      match(stdout, /Dry run complete/)
      match(stdout, /patch/)

      // --dry-run does not automatically trigger --verbose they can be chained though
      equal(stderr.trim(), '', 'stderr should be empty')

      await rm(cwd, { recursive: true, force: true })
    })
  })

  describe('positionals', () => {
    it('scopes matrix to specific test files when positional arguments are provided', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-scopes-'))
      const env = cleanEnvironment()

      await createModule(cwd, { scripts: { test: 'node --test' } })

      // create baseline code with 2 discrete features and tests
      await updateModuleSource(cwd, 'export const a = 1;\nexport const b = 2;')
      await updateModuleTest(cwd, `
        import { test } from 'node:test'
        import { equal } from 'node:assert'
        import { a } from './index.js'
        test('a', () => equal(a, 1))
      `, 'a.test.js')
      await updateModuleTest(cwd, `
        import { test } from 'node:test'
        import { equal } from 'node:assert'
        import { b } from './index.js'
        test('b', () => equal(b, 2))
      `, 'b.test.js')

      await createModuleVersion(cwd, 'baseline', '1.0.0')

      // break for feature 'b' on the new HEAD
      await updateModuleSource(cwd, 'export const a = 1;\nexport const b = 3; // broken logic')

      // if we run normal testbump, it should detect 'b' breaking -> major
      const { stdout: major } = await execAsync(`node "${bump}"`, { cwd, env })
      equal(major.trim(), 'major')

      // but if we artificially scope it only to test 'a', it ignores 'b', thus old contracts pass -> patch
      const { stdout: patch } = await execAsync(`node "${bump}" a.test.js`, { cwd, env })
      equal(patch.trim(), 'patch')

      await rm(cwd, { recursive: true, force: true })
    })
  })

  describe('--init', () => {
    it('bootstraps a project successfully', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-init-'))
      const env = cleanEnvironment()

      // setup blank project without testbump
      await createModule(cwd, { version: '1.2.3' })

      // commit something so git tags have a target HEAD
      await createModuleCommit(cwd, 'intial commit')

      const { stdout } = await execAsync(`node "${bump}" --init`, { cwd, env })

      match(stdout, /Successfully configured "bump" script/)
      match(stdout, /Created baseline tag: v1\.2\.3/)

      // verify package.json .scripts mutated
      const { scripts } = await readJson(cwd, 'package.json')

      equal(scripts.bump, 'npm version $(npx testbump)')

      // verify git tag actually exists natively
      const { stdout: tags } = await execAsync('git describe --tags --abbrev=0', { cwd })
      equal(tags.trim(), 'v1.2.3')

      await rm(cwd, { recursive: true, force: true })
    })

    it('allows custom messages during initialization via --init-message', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-init-message-'))
      const env = cleanEnvironment()

      // setup blank project without testbump
      await createModule(cwd, { version: '1.2.3' })

      // commit something so git tags have a target HEAD
      await createModuleCommit(cwd, 'intial commit')

      // we pass a single message to be used for the baseline
      await execAsync(`node "${bump}" --init --init-message "baseline setup"`, { cwd, env })

      // verify there is only ONE new commit since "initial file"
      const { stdout: commit } = await execAsync('git log -1 --pretty=%B', { cwd })
      match(commit, /baseline setup/)

      // verify Tag exists on that exact commit
      const { stdout: tag } = await execAsync('git tag -n1', { cwd })
      match(tag, /v1.2.3/)
      match(tag, /baseline setup/)

      await rm(cwd, { recursive: true, force: true })
    })

    it('fails gracefully if not a git repository', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'testbump-init-fail-'))

      await writeJson(cwd, 'package.json', {})
      await rejects(
        execAsync(`node "${bump}" --init`, { cwd }),
        (err) => {
          equal(err.code, 1)
          match(err.stderr, /Initialization Error: Not a git repository/)
          return true
        }
      )

      await rm(cwd, { recursive: true, force: true })
    })
  })
})
