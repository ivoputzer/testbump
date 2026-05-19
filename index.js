import { relative, join, dirname } from 'node:path'
import { spawn, execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import fs, { existsSync } from 'node:fs'
import { exit } from 'node:process'
import { fileURLToPath } from 'node:url'

// 1. Buffer-Safe Run natively streaming stdout/stderr
export const run = (command, cwd) => {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('close', code => {
      resolve({ stdout, stderr, pass: code === 0 })
    })
  })
}

// 2. Extracted Helpers for readability
export const getTestCommand = async (cwd) => {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) throw new Error('No package.json found.')
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  if (!pkg.scripts?.test) throw new Error('No "test" script found in package.json.')
  return pkg.scripts.test
}

export const discoverTestFiles = async (testCmd, cwd, resultsPath) => {
  const reporterPath = fileURLToPath(new URL('./lib/reporter.js', import.meta.url))
  await run(`${testCmd} --test-reporter="${reporterPath}" --test-reporter-destination="${resultsPath}"`, cwd)

  if (!existsSync(resultsPath)) {
    throw new Error('No test files discovered! Testbump requires at least one test file to form a contract.')
  }

  const testFiles = JSON.parse(await readFile(resultsPath, 'utf8')).map(p => relative(cwd, p))
  if (testFiles.length === 0) {
    throw new Error('No test files discovered! Testbump requires at least one test file to form a contract.')
  }

  return testFiles
}

export const getBaselineTag = async (cwd) => {
  const { pass, stdout } = await run('git describe --tags --abbrev=0', cwd)
  if (!pass || !stdout.trim()) {
    throw new Error('No baseline git tag found! Please manually create your first tag (e.g., `git tag 0.0.1`) to establish the baseline contract.')
  }
  return stdout.trim()
}

export function bumpStringFor ({ testOldOnNewPass, testNewOnOldPass }) {
  if (!testOldOnNewPass) return 'major'
  if (!testNewOnOldPass) return 'minor'
  return 'patch'
}

export async function overlayFiles (files, source, destination, { existsSync, promises: { mkdir, cp } } = fs) {
  for (const file of files) {
    const src = join(source, file)
    const dst = join(destination, file)
    if (existsSync(src)) {
      await mkdir(dirname(dst), { recursive: true })
      await cp(src, dst, { force: true })
    }
  }
}

// 3. Main Orchestrator
export const bump = async (cwd) => {
  const worktree = join(cwd, '.bump-worktree')
  const resultsPath = join(cwd, '.testbump-files.json')

  // Synchronous teardown required for exit event handlers
  const teardown = () => {
    try { execSync(`git worktree remove --force "${worktree}"`, { cwd, stdio: 'ignore' }) } catch {}
    try { fs.rmSync(resultsPath, { force: true }) } catch {}
  }

  const handleSignal = () => {
    teardown()
    exit(1)
  }

  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)

  try {
    const testCmd = await getTestCommand(cwd)
    const testFiles = await discoverTestFiles(testCmd, cwd, resultsPath)

    const gitFilesResult = await run('git ls-files', cwd)
    if (!gitFilesResult.pass) throw new Error('Not a git repository.')

    // Inline categorization logic
    const allFiles = gitFilesResult.stdout.split('\n').filter(Boolean)
    const sourceFiles = allFiles.filter(f => !testFiles.includes(f) && f !== 'package.json')

    const tag = await getBaselineTag(cwd)

    teardown() // Clean up any stale state before starting matrix

    const worktreeAdd = await run(`git worktree add "${worktree}" ${tag}`, cwd)
    if (!worktreeAdd.pass) throw new Error('Failed to create git worktree.')

    // Scenario A: T(old) on C(new)
    await overlayFiles(sourceFiles, cwd, worktree)
    const testOldOnNewPass = (await run(testCmd, worktree)).pass

    await run('git reset --hard && git clean -fd', worktree)

    // Scenario B: T(new) on C(old)
    await overlayFiles(testFiles, cwd, worktree)
    const testNewOnOldPass = (await run(testCmd, worktree)).pass

    return bumpStringFor({ testOldOnNewPass, testNewOnOldPass })
  } finally {
    process.off('SIGINT', handleSignal)
    process.off('SIGTERM', handleSignal)
    teardown()
  }
}
