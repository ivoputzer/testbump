export const createGit = (cwd, { run, execSync }) => {
  const execute = async (cmd) => {
    const result = await run(cmd, cwd)
    return {
      pass: result.pass,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    }
  }

  const executeOrThrow = async (cmd) => {
    const result = await execute(cmd)
    if (!result.pass) {
      throw new Error(`Git error executing "${cmd}":\n${result.stderr || result.stdout}`)
    }
    return result.stdout
  }

  return {
    isRepository: async () => (await execute('git status')).pass,

    getLatestTag: async () => {
      const res = await execute('git describe --tags --abbrev=0')
      return res.pass && res.stdout ? res.stdout : null
    },

    listFiles: async () => {
      const res = await execute('git ls-files')
      if (!res.pass) throw new Error('Not a git repository.')
      return res.stdout.split('\n').filter(Boolean)
    },

    createWorktree: async (path, tag) => executeOrThrow(`git worktree add "${path}" ${tag}`),

    removeWorktreeSync: (path) => {
      if (!execSync) return
      try {
        execSync(`git worktree remove --force "${path}"`, { cwd, stdio: 'ignore' })
      } catch {}
    },

    resetAndClean: async () => executeOrThrow('git reset --hard && git clean -fd'),

    add: async (files = '.') => executeOrThrow(`git add ${files}`),

    commit: async (message) => executeOrThrow(`git commit -m "${message}"`),

    createTag: async (name, message) => executeOrThrow(`git tag ${name} -m "${message}"`)
  }
}
