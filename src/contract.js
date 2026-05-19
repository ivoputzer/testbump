export const calculateSemanticBump = ({ testOldOnNewPass, testNewOnOldPass }) => {
  if (!testOldOnNewPass) return 'major'
  if (!testNewOnOldPass) return 'minor'
  return 'patch'
}

export const evaluateMatrix = async ({
  workspace, wtGit, run, logger,
  cwd, worktree, runCmd, sourceFiles, testFiles
}) => {
  logger.info('\n[testbump] --- SCENARIO A: T(old) on C(new) ---')
  await workspace.overlayFiles(sourceFiles, cwd, worktree)
  const testOldOnNew = await run(runCmd, worktree)
  logger.info(`[testbump] Are old contracts intact? ${testOldOnNew.pass ? '✅ YES' : '❌ NO'}`)
  if (!testOldOnNew.pass) logger.error(testOldOnNew.stdout || testOldOnNew.stderr)

  await wtGit.resetAndClean()

  logger.info('\n[testbump] --- SCENARIO B: T(new) on C(old) ---')
  await workspace.overlayFiles(testFiles, cwd, worktree)
  const testNewOnOld = await run(runCmd, worktree)
  logger.info(`[testbump] Are there new test contracts? ${!testNewOnOld.pass ? '✅ YES' : '➖ NO'}`)
  if (!testNewOnOld.pass) logger.error(testNewOnOld.stdout || testNewOnOld.stderr)

  return {
    testOldOnNewPass: testOldOnNew.pass,
    testNewOnOldPass: testNewOnOld.pass
  }
}
