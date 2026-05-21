import { describe, it } from 'node:test'
import { match, doesNotMatch, equal } from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cleanEnvironment, execAsync, createModule, updateModule, updateModuleSource, updateModuleTest, createModuleVersion, createModuleCommit } from '../util.js'

describe('e2e/dependencies', () => {
  const bump = join(import.meta.dirname, '..', '..', 'bin', 'bump.js')
  /*
  What are we testing?
  ---
  We are verifying the "Dependency Recycling" logic and the "Hybridization" of package.json across Git history.

  1. Logic Isolation: We must ensure that a test failure is a genuine Contract Breach (API change) and not an Infrastructure Failure (Missing or wrong dependency version).
  2. Performance: We must recycle the parent node_modules whenever possible to ensure testbump remains the fastest tool in the CI pipeline.

  The Recycling Rulebook:
  - Implementation (dependencies) always follows the Source Code being evaluated.
  - Contracts (devDependencies) always follow the Test Suite being executed.
  - If the resulting Hybrid Environment matches the parent, RECYCLE (Zero Network).
  - If the environment drifts or is missing, INSTALL (Deterministic Fallback).
*/
  describe('dependency management', () => {
    it('gracefully falls back to npm install if parent node_modules is missing', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'dependencies-matrix-missing-parent-'))
      const env = cleanEnvironment()

      await createModule(cwd, {
        dependencies: { 'is-number': '7.0.0' }
      })

      await updateModuleSource(cwd, `
        import { createRequire } from 'node:module'
        const require = createRequire(import.meta.url)
        const isNumber = require('is-number')
        export const run = () => isNumber(42)
      `)

      await updateModuleTest(cwd, `
        import { test } from 'node:test'
        import { ok } from 'node:assert/strict'
        import { run } from './index.js'
        test('works', () => ok(run()))
      `)

      await createModuleVersion(cwd, 'baseline', '1.0.0')

      // Patch modification (no dependency change)
      await updateModuleSource(cwd, `
        import { createRequire } from 'node:module'
        const require = createRequire(import.meta.url)
        const isNumber = require('is-number')
        export const run = () => isNumber(42) // patch comment
      `)

      await createModuleCommit(cwd, 'patch without updating dependencies')

      // Simulate a cold CI environment.
      await rm(join(cwd, 'node_modules'), { recursive: true, force: true })
      const { stdout, stderr } = await execAsync(`node "${bump}" --verbose`, { cwd, env })

      // If it failed to fallback to npm install, we'd get MODULE_NOT_FOUND and a 'major' bump.
      doesNotMatch(stderr, /MODULE_NOT_FOUND/)

      // Because leeching failed, we SHOULD see the npm install network output
      match(stderr, /added \d+ packages? in/)
      equal(stdout.trim(), 'patch')

      await rm(cwd, { recursive: true, force: true })
    })

    it('recycles parent node_modules and does zero network calls when dependencies do not drift', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'dependencies-recycling-'))
      const env = cleanEnvironment()

      await createModule(cwd, {
        dependencies: { 'is-number': '6.0.0' },
        devDependencies: { 'is-odd': '3.0.0' }
      })

      await updateModuleSource(cwd, 'export const a = 1')
      await updateModuleTest(cwd, `
        import { test } from 'node:test'
        import { ok } from 'node:assert/strict'
        import { a } from './index.js'
        test('ok', () => ok(a === 1))
      `)

      await createModuleVersion(cwd, 'baseline', '1.0.0')
      await updateModuleSource(cwd, 'export const a = 1 // just a comment')
      await createModuleCommit(cwd, 'patch without changes to package.json')

      const { stdout, stderr } = await execAsync(`node "${bump}" --verbose`, { cwd, env })

      // If leeching is active, npm install is NEVER called, so its output shouldn't exist
      doesNotMatch(stderr, /added \d+ packages/)
      equal(stdout.trim(), 'patch')

      await rm(cwd, { recursive: true, force: true })
    })
  })

  describe('dependency resolution', () => {
  /*
    What are we testing?
    ---
    We are verifying the correct package.json resolution of `workspace.syncDependencies`.
    Because Code implementation (tracked via `dependencies`) and Test contracts (tracked via `devDependencies`)
    can drift at different rates across Git history, a naive `npm install` of any single historical `package.json` is insufficient.

    We test that the engine correctly hybridizes the environment:
    - Scenario A: Implementation (New) + Contracts (Old)
    - Scenario B: Implementation (Old) + Contracts (New)

    # Why is this crucial?
    To ensure "Test-Driven Bumps" are logically sound, we must isolate Logic Failures
    from Infrastructure Failures. If a worktree fails with `MODULE_NOT_FOUND`,
    it creates a False Positive (Scenario A) or a False Negative (Scenario B).
    By synthesizing a hybrid `package.json`, we guarantee that every evaluation runs in its native habitat.
    This ensures that if a test fails, it is because of a genuine Contract Breach (API change), not a missing dependency.

    # The Matrix Rulebook
    1. dependencies (Code) always follow the Source Code being evaluated.
    2. devDependencies (Tests) always follow the Test Suite being executed.
 */
    it('bumps patch when dependencies change but contract is preserved', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'dependencies-matrix-patch-'))
      const env = cleanEnvironment()

      await createModule(cwd, {
        dependencies: { 'is-number': '6.0.0' },
        devDependencies: { 'is-even': '1.0.0' }
      })

      await updateModuleSource(cwd, `
        import { createRequire } from 'node:module'

        const require = createRequire(import.meta.url)
        const isNumber = require('is-number') // only making sure the dependency is installed

        export const run = () => true
      `)

      await updateModuleTest(cwd, `
        import { createRequire } from 'node:module'
        import { test } from 'node:test'
        import { ok } from 'node:assert/strict'
        import { run } from './index.js'

        const require = createRequire(import.meta.url)
        const isEven = require('is-even') // only making sure the dev-dependency installed

        test('contract', () => ok(run()))
      `)

      await createModuleVersion(cwd, 'baseline', '1.0.0')

      await updateModule(cwd, {
        dependencies: { 'is-number': '7.0.0' },
        devDependencies: { 'is-odd': '3.0.1' } // simulating a totally different test utility
      })

      await updateModuleTest(cwd, `
        import { createRequire } from 'node:module'
        import { test } from 'node:test'
        import { ok } from 'node:assert/strict'
        import { run } from './index.js'

        const require = createRequire(import.meta.url)
        const isEven = require('is-odd') // only making sure the new dev-dependency installed

        test('contract', () => ok(run()))
      `)

      await createModuleCommit(cwd, 'upgraded dependencies')
      const { stdout, stderr } = await execAsync(`node "${bump}" --verbose`, { cwd, env })

      doesNotMatch(stderr, /MODULE_NOT_FOUND/)
      equal(stdout.trim(), 'patch')

      await rm(cwd, { recursive: true, force: true })
    })

    it('bumps minor when upgrading dependencies while adding a non breaking feature', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'dependencies-matrix-minor-'))
      const env = cleanEnvironment()

      await createModule(cwd, {
        dependencies: { 'is-number': '6.0.0' },
        devDependencies: { 'is-odd': '3.0.0' }
      })

      await updateModuleSource(cwd, `
        export const a = 1
      `)

      await updateModuleTest(cwd, `
        import { createRequire } from 'node:module'
        import { test } from 'node:test'
        import { ok } from 'node:assert/strict'
        import { a } from './index.js'

        const require = createRequire(import.meta.url)
        const isOdd = require('is-odd')

        ok(isOdd(a))
      `)

      await createModuleVersion(cwd, 'baseline', '1.0.0')

      await updateModule(cwd, {
        dependencies: { 'is-number': '7.0.0' },
        devDependencies: { 'is-even': '1.0.0', 'is-odd': '3.0.1' }
      })

      await updateModuleSource(cwd, `
        export const a = 1
        export const b = 2
      `)

      await updateModuleTest(cwd, `
        import { createRequire } from 'node:module'
        import { test } from 'node:test'
        import { ok } from 'node:assert/strict'
        import { a, b } from './index.js'

        const require = createRequire(import.meta.url)
        const isEven = require('is-even')
        const isOdd = require('is-odd')

        ok(isOdd(a))
        ok(isEven(b))
      `)

      await createModuleCommit(cwd, 'adds new feature without breaking previous implementation')

      const { stdout, stderr } = await execAsync(`node "${bump}" --verbose`, { cwd, env })

      doesNotMatch(stderr, /MODULE_NOT_FOUND/)
      equal(stdout.trim(), 'minor')
      await rm(cwd, { recursive: true, force: true })
    })

    it('bumps patch when dependency version drift is ignored if the contract remains stable', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'dependencies-matrix-patch2-'))
      const env = cleanEnvironment()

      await createModule(cwd, {
        dependencies: { 'is-number': '6.0.0' }
      })

      await updateModuleSource(cwd, `
        import { createRequire } from 'node:module'

        const require = createRequire(import.meta.url)
        const pkg = require('is-number/package.json')

        export const run = () => {
          if(pkg.version !== '6.0.0') throw new Error('C(old) requires version 6.0.0')
          return true
        }
      `)

      await updateModuleTest(cwd, `
        import { test } from 'node:test'
        import { ok } from 'node:assert/strict'
        import { run } from './index.js'
        ok(run())
      `)

      await createModuleVersion(cwd, 'baseline', '1.0.0')

      await updateModule(cwd, {
        dependencies: { 'is-number': '7.0.0' }
      })

      await updateModuleSource(cwd, `
        import { createRequire } from 'node:module'

        const require = createRequire(import.meta.url)
        const pkg = require('is-number/package.json')

        export const run = () => {
          if(pkg.version !== '7.0.0') throw new Error('C(new) requires version 7.0.0')
          return true
        }
      `)

      await createModuleCommit(cwd, 'upgraded dependencies')

      const { stdout, stderr } = await execAsync(`node "${bump}" --verbose`, { cwd, env })

      doesNotMatch(stderr, /MODULE_NOT_FOUND/)
      doesNotMatch(stderr, /Error: C\((old|new)\) requires version (6|7).0.0/)
      equal(stdout.trim(), 'patch')
      await rm(cwd, { recursive: true, force: true })
    })

    it('bumps major when dependencies upgrade causes logical break in old contract', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'dependencies-matrix-major-'))
      const env = cleanEnvironment()

      await createModule(cwd, { dependencies: { 'is-number': '6.0.0' } })

      await updateModuleSource(cwd, `
        import { createRequire } from 'node:module'
        const require = createRequire(import.meta.url)
        const isNumber = require('is-number')

        export const validate = (val) => isNumber(val) // C(old) returns a boolean
      `)

      await updateModuleTest(cwd, `
        import { test } from 'node:test'
        import { equal } from 'node:assert/strict'
        import { validate } from './index.js'

        test('contract expects a boolean', () => equal(validate(42), true))
      `)

      await createModuleVersion(cwd, 'baseline', '1.0.0')

      await updateModule(cwd, { dependencies: { 'is-number': '7.0.0' } })

      await updateModuleSource(cwd, `
        import { createRequire } from 'node:module'
        const require = createRequire(import.meta.url)
        const isNumber = require('is-number')

        export const validate = (val) => {
          return { isValid: isNumber(val) } // C(new) was refactored due to the upgrade and now returns an Object!
        }
      `)

      await createModuleCommit(cwd, 'upgraded dependencies and changed return signature')

      const { stdout, stderr } = await execAsync(`node "${bump}" --verbose`, { cwd, env })

      doesNotMatch(stderr, /MODULE_NOT_FOUND/)
      equal(stdout.trim(), 'major')

      await rm(cwd, { recursive: true, force: true })
    })
  })
})
