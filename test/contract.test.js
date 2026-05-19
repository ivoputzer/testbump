export const calculateSemanticBump = ({ testOldOnNewPass, testNewOnOldPass }) => {
  if (!testOldOnNewPass) return 'major'
  if (!testNewOnOldPass) return 'minor'
  return 'patch'
}

export const evaluateMatrix = async ({
  workspace, run, logger,
  cwd, worktreeA, worktreeB, runCmd, sourceFiles, testFiles
}) => {
  const scenarioA = async () => {
    logger.info('[testbump] [Scenario A] Overlaying source files to test T(old) on C(new)...')
    await workspace.overlayFiles(sourceFiles, cwd, worktreeA)
    const testOldOnNew = await run(runCmd, worktreeA)

    logger.info(`[testbump] [Scenario A] Are old contracts intact? ${testOldOnNew.pass ? '✅ YES' : '❌ NO'}`)
    if (!testOldOnNew.pass) logger.error(testOldOnNew.stdout || testOldOnNew.stderr)
    return testOldOnNew.pass
  }

  const scenarioB = async () => {
    logger.info('[testbump] [Scenario B] Overlaying test files to test T(new) on C(old)...')
    await workspace.overlayFiles(testFiles, cwd, worktreeB)
    const testNewOnOld = await run(runCmd, worktreeB)

    logger.info(`[testbump] [Scenario B] Are there new test contracts? ${!testNewOnOld.pass ? '✅ YES' : '➖ NO'}`)
    if (!testNewOnOld.pass) logger.error(testNewOnOld.stdout || testNewOnOld.stderr)
    return testNewOnOld.pass
  }

  // Execute in parallel and await both
  const [testOldOnNewPass, testNewOnOldPass] = await Promise.all([scenarioA(), scenarioB()])

  return { testOldOnNewPass, testNewOnOldPass }
}
