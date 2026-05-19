// ==> index.js <==
import { join } from 'node:path'
import { exit } from 'node:process'
import { execSync } from 'node:child_process'
import fs from 'node:fs'

import { createGit } from './src/git.js'
import { createWorkspace } from './src/workspace.js'
import { run } from './src/exec.js'

export { run }

export function bumpStringFor ({ testOldOnNewPass, testNewOnOldPass }) {
  if (!testOldOnNewPass) return 'major'
  if (!testNewOnOldPass) return 'minor'
  return 'patch'
}

export const bump = async (cwd, options = {}) => {
  const worktree = join(cwd, '.bump-worktree')
  const resultsPath = join(cwd, '.testbump-files.json')

  const git = createGit(cwd, { run, execSync })
  const workspace = createWorkspace(cwd, { fs, fsPromises: fs.promises, run })

  const log = (...args) => { if (options.verbose) console.error(...args) }

  const teardown = () => {
    git.removeWorktreeSync(worktree)
    workspace.removeFileSync(resultsPath)
  }

  const handleSignal = () => {
    teardown()
    exit(1)
  }

  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)

  try {
    log('[testbump] Execution initiated. Extracting context...')

    const testCmd = await workspace.getTestCommand()
    const globs = options.globs || []
    const runCmd = globs.length > 0 ? `${testCmd} ` + globs.map(g => `"${g}"`).join(' ') : testCmd

    log(`[testbump] Executing test script: \`${runCmd}\``)

    const testFiles = await workspace.discoverContractFiles(testCmd, resultsPath, globs)
    log(`[testbump] Discovered ${testFiles.length} test file(s) forming the contract.`)

    const allFiles = await git.listFiles()
    const sourceFiles = allFiles.filter(f => !testFiles.includes(f) && f !== 'package.json')
    log(`[testbump] Categorized ${sourceFiles.length} source file(s) tracking API implementation.`)

    const tag = await git.getLatestTag()
    if (!tag) {
      throw new Error('No baseline git tag found! Please manually create your first tag (e.g., `git tag 0.0.1`) to establish the baseline contract.')
    }
    log(`[testbump] Found baseline tag: ${tag}`)

    teardown()

    await git.createWorktree(worktree, tag)
    const wtGit = createGit(worktree, { run, execSync })

    log('\n[testbump] --- SCENARIO A: T(old) on C(new) ---')
    await workspace.overlayFiles(sourceFiles, cwd, worktree)
    const testOldOnNew = await run(runCmd, worktree)
    log(`[testbump] Are old contracts intact? ${testOldOnNew.pass ? '✅ YES' : '❌ NO'}`)
    if (options.verbose && !testOldOnNew.pass) log(testOldOnNew.stdout || testOldOnNew.stderr)

    await wtGit.resetAndClean()

    log('\n[testbump] --- SCENARIO B: T(new) on C(old) ---')
    await workspace.overlayFiles(testFiles, cwd, worktree)
    const testNewOnOld = await run(runCmd, worktree)
    log(`[testbump] Are there new test contracts? ${!testNewOnOld.pass ? '✅ YES' : '➖ NO'}`)
    if (options.verbose && !testNewOnOld.pass) log(testNewOnOld.stdout || testNewOnOld.stderr)

    const bumpStr = bumpStringFor({ testOldOnNewPass: testOldOnNew.pass, testNewOnOldPass: testNewOnOld.pass })
    log(`\n[testbump] Conclusion: Incrementing as '${bumpStr.toUpperCase()}'.`)

    return bumpStr
  } finally {
    process.off('SIGINT', handleSignal)
    process.off('SIGTERM', handleSignal)
    teardown()
  }
}

export const init = async (cwd, options = {}) => {
  const git = createGit(cwd, { run, execSync })
  const workspace = createWorkspace(cwd, { fs, fsPromises: fs.promises, run })

  if (!(await git.isRepository())) {
    throw new Error('Not a git repository. Please run `git init` first.')
  }

  const v = await workspace.configureBumpScript()
  let message = '[testbump] Successfully configured "bump" script in package.json.\n'

  const tag = await git.getLatestTag()

  if (!tag) {
    const commitMsg = options.message || options.tagMessage || `chore: baseline ${v}`
    const npmRes = await workspace.npmVersion(v, commitMsg)

    if (npmRes.pass) {
      message += `[testbump] Created baseline tag: v${v}`
    } else {
      await git.add('package.json')
      await git.commit(commitMsg)
      await git.createTag(`v${v}`, commitMsg)
      message += `[testbump] Created baseline tag: v${v}`
    }
  } else {
    message += `[testbump] Baseline tag already exists: ${tag}`
  }

  return message
}
