import { describe, it } from 'node:test'
import { equal } from 'node:assert/strict'
import { calculateSemanticBump, evaluateMatrix } from '../src/contract.js'

describe('Contract Domain Logic', () => {
  describe('calculateSemanticBump()', () => {
    it('returns major when T(old) fails on C(new)', () => {
      equal(calculateSemanticBump({ testOldOnNewPass: false, testNewOnOldPass: true }), 'major')
    })
    it('returns minor when T(old) passes on C(new) AND T(new) fails on C(old)', () => {
      equal(calculateSemanticBump({ testOldOnNewPass: true, testNewOnOldPass: false }), 'minor')
    })
    it('returns patch when T(old) passes on C(new) AND T(new) passes on C(old)', () => {
      equal(calculateSemanticBump({ testOldOnNewPass: true, testNewOnOldPass: true }), 'patch')
    })
  })

  describe('evaluateMatrix()', () => {
    it('orchestrates scenarios and returns correct pass states', async ({ mock }) => {
      const overlayFiles = mock.fn(async () => {})
      const workspace = { overlayFiles }
      const wtGit = { resetAndClean: mock.fn(async () => {}) }

      // First call (Scenario A) fails, Second call (Scenario B) passes
      const run = mock.fn(async () => ({ pass: overlayFiles.mock.calls.length === 1, stdout: '', stderr: '' }))
      const logger = { info: mock.fn(), error: mock.fn() }

      const result = await evaluateMatrix({
        workspace,
        wtGit,
        run,
        logger,
        cwd: '/',
        worktree: '/wt',
        runCmd: 'test',
        sourceFiles: [],
        testFiles: []
      })

      equal(result.testOldOnNewPass, true)   // Scenario A
      equal(result.testNewOnOldPass, false)  // Scenario B
      equal(workspace.overlayFiles.mock.callCount(), 2)
      equal(run.mock.callCount(), 2)
      equal(wtGit.resetAndClean.mock.callCount(), 1)
    })
  })
})
