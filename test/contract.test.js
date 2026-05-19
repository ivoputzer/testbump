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
    it('orchestrates scenarios in parallel and returns correct pass states', async ({ mock }) => {
      const workspace = {
        overlayFiles: mock.fn(async () => {}),
        installDependencies: mock.fn(async () => {})
      }

      // Scenario A passes (run in wtA), Scenario B fails (run in wtB)
      const run = mock.fn(async (cmd, path) => ({ pass: path === '/wtA', stdout: '', stderr: '' }))

      const logger = { info: mock.fn(), error: mock.fn() }
      const result = await evaluateMatrix({ workspace, run, logger, cwd: '/', worktreeA: '/wtA', worktreeB: '/wtB', runCmd: 'test', sourceFiles: [], testFiles: [] })

      equal(result.testOldOnNewPass, true)   // Scenario A logic
      equal(result.testNewOnOldPass, false)  // Scenario B logic
      equal(workspace.overlayFiles.mock.callCount(), 2)
      equal(workspace.installDependencies.mock.callCount(), 2)
      equal(run.mock.callCount(), 2)
    })
  })
})
