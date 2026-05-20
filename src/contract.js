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

    logger.info('[testbump] (Scenario A → T(old) on C(new)) Synthesizing hybrid environment...')
    const { stdout } = await workspace.syncDependencies(worktreeA, cwd, 'A')
    logger.info(`[testbump] ${stdout}`)

    const testOldOnNew = await run(runCmd, worktreeA, execOptions)

    logger.info(`[testbump] (Scenario A → T(old) on C(new)) Are old contracts intact? (attempts: ${testOldOnNew.attempt}) ${testOldOnNew.pass ? '✅ YES' : '❌ NO'}`)
    if (!testOldOnNew.pass) logger.error(testOldOnNew.stdout || testOldOnNew.stderr)
    logger.info(testOldOnNew.stdout)
    logger.info(testOldOnNew.stderr)
    return testOldOnNew.pass
  }

  const scenarioB = async () => {
    logger.info('[testbump] (Scenario B → T(new) on C(old)) Overlaying test files...')
    await workspace.overlayFiles(testFiles, cwd, worktreeB)

    logger.info('[testbump] (Scenario B → T(new) on C(old)) Synthesizing hybrid environment...')
    const { stdout } = await workspace.syncDependencies(worktreeB, cwd, 'B')
    logger.info(`[testbump] ${stdout}`)

    const testNewOnOld = await run(runCmd, worktreeB, execOptions)

    logger.info(`[testbump] (Scenario B → T(new) on C(old)) Are there new test contracts? (attempts: ${testNewOnOld.attempt}) ${!testNewOnOld.pass ? '✅ YES' : '➖ NO'}`)
    logger.info(testNewOnOld.stdout)
    logger.info(testNewOnOld.stderr)
    if (!testNewOnOld.pass) logger.error(testNewOnOld.stdout || testNewOnOld.stderr)
    return testNewOnOld.pass
  }

  // Parallel Execution!
  const [testOldOnNewPass, testNewOnOldPass] = await Promise.all([scenarioA(), scenarioB()])

  return { testOldOnNewPass, testNewOnOldPass }
}
