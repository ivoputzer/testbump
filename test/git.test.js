import { describe, it } from 'node:test'
import { equal, rejects } from 'node:assert/strict'
import { createGit } from '../src/git.js'

describe('Git Adapter', () => {
  it('isRepository() returns boolean based on git status', async ({ mock }) => {
    const runPass = mock.fn(async () => ({ pass: true, stdout: '', stderr: '' }))
    const gitTrue = createGit('/mock', { run: runPass })
    equal(await gitTrue.isRepository(), true)
    equal(runPass.mock.calls[0].arguments[0], 'git status')

    const runFail = mock.fn(async () => ({ pass: false, stdout: '', stderr: '' }))
    const gitFalse = createGit('/mock', { run: runFail })
    equal(await gitFalse.isRepository(), false)
  })

  it('getLatestTag() returns string if present, null if missing', async ({ mock }) => {
    const runPass = mock.fn(async () => ({ pass: true, stdout: 'v1.0.0\n', stderr: '' }))
    equal(await createGit('/mock', { run: runPass }).getLatestTag(), 'v1.0.0')

    const runFail = mock.fn(async () => ({ pass: false, stdout: '', stderr: 'fatal: no tags' }))
    equal(await createGit('/mock', { run: runFail }).getLatestTag(), null)
  })

  it('listFiles() returns array of tracked files', async ({ mock }) => {
    const runPass = mock.fn(async () => ({ pass: true, stdout: 'index.js\npackage.json\n', stderr: '' }))
    const git = createGit('/mock', { run: runPass })
    const files = await git.listFiles()
    equal(files.length, 2)
    equal(files[0], 'index.js')
  })

  it('listFiles() throws if not a git repo', async ({ mock }) => {
    const runFail = mock.fn(async () => ({ pass: false, stdout: '', stderr: '' }))
    const git = createGit('/mock', { run: runFail })
    await rejects(git.listFiles(), /Not a git repository/)
  })

  it('throws formatted errors on failed critical commands', async ({ mock }) => {
    const runFail = mock.fn(async () => ({ pass: false, stdout: '', stderr: 'Merge conflict' }))
    const git = createGit('/mock', { run: runFail })

    await rejects(git.resetAndClean(), (err) => {
      equal(err.message.includes('Git error executing "git reset --hard && git clean -fd"'), true)
      equal(err.message.includes('Merge conflict'), true)
      return true
    })
  })

  it('removeWorktreeSync uses execSync defensively', ({ mock }) => {
    const execSync = mock.fn()
    const git = createGit('/mock', { run: {}, execSync })
    git.removeWorktreeSync('/path/to/worktree')

    equal(execSync.mock.callCount(), 1)
    equal(execSync.mock.calls[0].arguments[0], 'git worktree remove --force "/path/to/worktree"')
  })
})
