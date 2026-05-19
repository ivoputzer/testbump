import { relative, join, dirname } from 'node:path'
import { exec, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import fs, { existsSync } from 'node:fs'
import { exit } from 'node:process'
import { fileURLToPath } from 'node:url'

const execAsync = promisify(exec)

// Execute a shell command safely natively
export const run = async (cmd, cwd) => {
  try {
    const { stdout } = await execAsync(cmd, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return { stdout, pass: true }
  } catch (err) {
    return { stdout: err.stdout || err.message, pass: false }
  }
}

// Figure out what is source code vs tests
export const categorizeFiles = (allTrackedFiles, testFiles) => {
  const sourceFiles = allTrackedFiles.filter(f => !testFiles.includes(f) && !f.includes('package.json'))
  return { sourceFiles, testFiles }
}

// The Test Driven Bump Logic
export function bumpStringFor ({ testOldOnNewPass, testNewOnOldPass }) {
  if (!testOldOnNewPass) return 'major'
  if (!testNewOnOldPass) return 'minor'
  return 'patch'
}

// Overlay files
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

export const bump = async (cwd) => {
  const worktree = join(cwd, '.bump-worktree')
  const resultsPath = join(cwd, '.testbump-files.json')

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
    const pkgPath = join(cwd, 'package.json')
    if (!existsSync(pkgPath)) throw new Error('No package.json found.')

    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    const testCmd = pkg.scripts?.test
    if (!testCmd) throw new Error('No "test" script found in package.json.')

    // DISCOVERY PHASE: Run custom reporter, piping output strictly to JSON to avoid user console logs.
    const reporterPath = fileURLToPath(new URL('./lib/reporter.js', import.meta.url))
    await run(`${testCmd} --test-reporter="${reporterPath}" --test-reporter-destination="${resultsPath}"`, cwd)

    if (!existsSync(resultsPath)) {
      throw new Error('No test files discovered! Testbump requires at least one test file to form a contract.')
    }

    const testFiles = JSON.parse(await readFile(resultsPath, 'utf8')).map(p => relative(cwd, p))
    if (testFiles.length === 0) {
      throw new Error('No test files discovered! Testbump requires at least one test file to form a contract.')
    }

    const gitFilesResult = await run('git ls-files', cwd)
    if (!gitFilesResult.pass) throw new Error('Not a git repository.')

    const allFiles = gitFilesResult.stdout.split('\n').filter(Boolean)
    const { sourceFiles } = categorizeFiles(allFiles, testFiles)

    const lastTagResult = await run('git describe --tags --abbrev=0', cwd)
    if (!lastTagResult.pass || !lastTagResult.stdout.trim()) {
      throw new Error('No baseline git tag found! Please manually create your first tag (e.g., `git tag 0.0.1`) to establish the baseline contract.')
    }

    teardown() // Clean up any stale state before starting matrix

    const tag = lastTagResult.stdout.trim()
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
