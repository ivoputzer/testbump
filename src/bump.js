import { join } from 'node:path'
import { exit } from 'node:process'
import { evaluateMatrix, calculateSemanticBump } from './contract.js'

export const executeBump = async (cwd, { git, createGit, workspace, run, logger, options }) => {
  const worktree = join(cwd, '.bump-worktree')
  const resultsPath = join(cwd, '.testbump-files.json')

  const teardown = () => {
    git.removeWorktreeSync(worktree)
    workspace.removeFileSync(resultsPath)
  }

  const handleSignal = () => { teardown(); exit(1) }
  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)

  try {
    logger.info('[testbump] Execution initiated. Extracting context...')

    const testCmd = await workspace.getTestCommand()
    const globs = options.globs || []
    const runCmd = globs.length > 0 ? `${testCmd} ` + globs.map(g => `"${g}"`).join(' ') : testCmd

    logger.info(`[testbump] Executing test script: \`${runCmd}\``)

    const testFiles = await workspace.discoverContractFiles(testCmd, resultsPath, globs)
    logger.info(`[testbump] Discovered ${testFiles.length} test file(s) forming the contract.`)

    const allFiles = await git.listFiles()
    const sourceFiles = allFiles.filter(f => !testFiles.includes(f) && f !== 'package.json')
    logger.info(`[testbump] Categorized ${sourceFiles.length} source file(s) tracking API implementation.`)

    const tag = await git.getLatestTag()
    if (!tag) {
      throw new Error('No baseline git tag found! Please manually create your first tag (e.g., `git tag 0.0.1`) to establish the baseline contract.')
    }
    logger.info(`[testbump] Found baseline tag: ${tag}`)

    teardown()

    await git.createWorktree(worktree, tag)
    const wtGit = createGit(worktree)

    const scenarios = await evaluateMatrix({
      workspace, wtGit, run, logger, cwd, worktree, runCmd, sourceFiles, testFiles
    })

    const bumpStr = calculateSemanticBump(scenarios)
    logger.info(`\n[testbump] Conclusion: Incrementing as '${bumpStr.toUpperCase()}'.`)

    return bumpStr
  } finally {
    process.off('SIGINT', handleSignal)
    process.off('SIGTERM', handleSignal)
    teardown()
  }
}
