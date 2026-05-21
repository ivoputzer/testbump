import { describe, it } from 'node:test'
import { equal, rejects, match } from 'node:assert/strict'
import { createGit } from '../src/git.js'

describe('src/git (adapter)', () => {
  describe('.isRepository()', () => {
    it('uses git status to determine when inside a git repository', async ({ mock }) => {
      const runPass = mock.fn(async () => ({ pass: true, stdout: '', stderr: '' }))
      const gitTrue = createGit('/mock', { run: runPass })
      equal(await gitTrue.isRepository(), true)
      equal(runPass.mock.calls[0].arguments[0], 'git status')
    })

    it('returns false when not inside a git repository', async ({ mock }) => {
      const runFail = mock.fn(async () => ({ pass: false, stdout: '', stderr: '' }))
      const gitFalse = createGit('/mock', { run: runFail })
      equal(await gitFalse.isRepository(), false)
    })
  })

  describe('.getLatestTag()', () => {
    it('returns string if present, null if missing', async ({ mock }) => {
      const runPass = mock.fn(async () => ({ pass: true, stdout: 'v1.0.0\n', stderr: '' }))
      equal(await createGit('/mock', { run: runPass }).getLatestTag(), 'v1.0.0')
    })

    it('returns null if missing', async ({ mock }) => {
      const runFail = mock.fn(async () => ({ pass: false, stdout: '', stderr: 'fatal: no tags' }))
      equal(await createGit('/mock', { run: runFail }).getLatestTag(), null)
    })
  })

  describe('.listFiles()', () => {
    it('returns array of tracked files', async ({ mock }) => {
      const runPass = mock.fn(async () => ({ pass: true, stdout: 'index.js\npackage.json\n', stderr: '' }))
      const git = createGit('/mock', { run: runPass })
      const files = await git.listFiles()
      equal(files.length, 2)
      equal(files[0], 'index.js')
    })

    it('throws if not a git repo', async ({ mock }) => {
      const runFail = mock.fn(async () => ({ pass: false, stdout: '', stderr: '' }))
      const git = createGit('/mock', { run: runFail })
      await rejects(git.listFiles(), /Not a git repository/)
    })
  })

  describe('.resetAndClean()', () => {
    it('throws formatted errors on failed critical commands', async ({ mock }) => {
      const runFail = mock.fn(async () => ({ pass: false, stdout: '', stderr: 'Merge conflict' }))
      const git = createGit('/mock', { run: runFail })

      await rejects(git.resetAndClean(), (err) => {
        match(err.message, /Git error executing "git reset --hard && git clean -fd"/)
        match(err.message, /Merge conflict/)
        return true
      })
    })
  })

  describe('.removeWorktreeSync()', () => {
    it('uses execSync defensively', ({ mock }) => {
      const execSync = mock.fn()
      const git = createGit('/mock', { run: {}, execSync })
      git.removeWorktreeSync('/path/to/worktree')

      equal(execSync.mock.callCount(), 1)
      equal(execSync.mock.calls[0].arguments[0], 'git worktree remove --force "/path/to/worktree"')
    })
  })
})
