// ==> index.js <==
import { execSync } from 'node:child_process'
import fs from 'node:fs'

import { createGit } from './src/git.js'
import { createWorkspace } from './src/workspace.js'
import { run } from './src/exec.js'
import { executeBump } from './src/bump.js'
import { executeInit } from './src/init.js'

// Backwards compatibility for external tools referencing `run`
export { run }

const createLogger = (verbose) => ({
  info: (...args) => { if (verbose) console.error(...args) },
  error: (...args) => { if (verbose) console.error(...args) }
})

export const bump = async (cwd, options = {}) => {
  const gitFactory = (targetCwd) => createGit(targetCwd, { run, execSync })

  const git = gitFactory(cwd)
  const workspace = createWorkspace(cwd, { fs, fsPromises: fs.promises, run })
  const logger = createLogger(options.verbose)

  return executeBump(cwd, {
    git,
    createGit: gitFactory,
    workspace,
    run,
    logger,
    options
  })
}

export const init = async (cwd, options = {}) => {
  const git = createGit(cwd, { run, execSync })
  const workspace = createWorkspace(cwd, { fs, fsPromises: fs.promises, run })

  return executeInit(cwd, { git, workspace, options })
}
