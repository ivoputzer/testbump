export const calculateSemanticBump = ({ testOldOnNewPass, testNewOnOldPass }) => {
  if (!testOldOnNewPass) return 'major'
  if (!testNewOnOldPass) return 'minor'
  return 'patch'
}

export const evaluateMatrix = async ({ workspace, run, logger, cwd, worktreeA, worktreeB, runCmd, sourceFiles, testFiles }) => {
  // Hardcoded for now, but we could eventually pass these from the CLI
  const execOptions = { retries: 2, timeout: 60000 }

  const scenarioA = async () => {
    logger.info('[testbump] (Scenario A → T(old) on C(new)) Overlaying source files...')
    await workspace.overlayFiles(sourceFiles, cwd, worktreeA)
    const testOldOnNew = await run(runCmd, worktreeA, execOptions)

    logger.info(`[testbump] (Scenario A → T(old) on C(new)) Are old contracts intact? ${testOldOnNew.pass ? '✅ YES' : '❌ NO'}`)
    if (!testOldOnNew.pass) logger.error(testOldOnNew.stdout || testOldOnNew.stderr)
    return testOldOnNew.pass
  }

  const scenarioB = async () => {
    logger.info('[testbump] (Scenario B → T(new) on C(old)) Overlaying test files...')
    await workspace.overlayFiles(testFiles, cwd, worktreeB)

    logger.info('[testbump] (Scenario B) Syncing dependencies...')
    await workspace.installDependencies(worktreeB)

    const testNewOnOld = await run(runCmd, worktreeB, execOptions)

    logger.info(`[testbump] (Scenario B → T(new) on C(old)) Are there new test contracts? ${!testNewOnOld.pass ? '✅ YES' : '➖ NO'}`)
    if (!testNewOnOld.pass) logger.error(testNewOnOld.stdout || testNewOnOld.stderr)
    return testNewOnOld.pass
  }

  // BOOM: Parallel Execution!
  const [testOldOnNewPass, testNewOnOldPass] = await Promise.all([scenarioA(), scenarioB()])

  return { testOldOnNewPass, testNewOnOldPass }
}
