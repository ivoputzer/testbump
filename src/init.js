export const executeInit = async (cwd, { git, workspace, options }) => {
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
