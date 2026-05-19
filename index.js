import { relative, join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import fs, { existsSync } from 'node:fs'
import { exit } from 'node:process'
import { fileURLToPath } from 'node:url'
import { createGit } from './src/git.js'
import { run } from './src/exec.js'

// Exporting to not break existing external consumers of testbump during refactor
export { run }

export const getTestCommand = async (cwd) => {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) throw new Error('No package.json found.')

  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  if (!pkg.scripts?.test) throw new Error('No "test" script found in package.json.')

  return pkg.scripts.test
}

export const discoverTestFiles = async (testCmd, cwd, resultsPath, globs = []) => {
  const reporterPath = fileURLToPath(new URL('./lib/reporter.js', import.meta.url))
  let cmd = `${testCmd} --test-reporter="${reporterPath}" --test-reporter-destination="${resultsPath}"`
  if (globs.length > 0) cmd += ' ' + globs.map(g => `"${g}"`).join(' ')

  await run(cmd, cwd)

  if (!existsSync(resultsPath)) {
    throw new Error('No test files discovered! Testbump requires at least one test file to form a contract.')
  }

  const testFiles = JSON.parse(await readFile(resultsPath, 'utf8')).map(p => relative(cwd, p))
  if (testFiles.length === 0) {
    throw new Error('No test files discovered! Testbump requires at least one test file to form a contract.')
  }

  return testFiles
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

export const bump = async (cwd, options = {}) => {
  const worktree = join(cwd, '.bump-worktree')
  const resultsPath = join(cwd, '.testbump-files.json')

  // Phase 1: Initialize Git Adapter
  const git = createGit(cwd, { run, execSync })

  const log = (...args) => { if (options.verbose) console.error(...args) }

  const teardown = () => {
    git.removeWorktreeSync(worktree)
    try { fs.rmSync(resultsPath, { force: true }) } catch {}
  }

  const handleSignal = () => {
    teardown()
    exit(1)
  }

  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)

  try {
    log('[testbump] Execution initiated. Extracting context...')

    const testCmd = await getTestCommand(cwd)
    const globs = options.globs || []
    const runCmd = globs.length > 0 ? `${testCmd} ` + globs.map(g => `"${g}"`).join(' ') : testCmd

    log(`[testbump] Executing test script: \`${runCmd}\``)

    const testFiles = await discoverTestFiles(testCmd, cwd, resultsPath, globs)
    log(`[testbump] Discovered ${testFiles.length} test file(s) forming the contract.`)

    const allFiles = await git.listFiles()
    const sourceFiles = allFiles.filter(f => !testFiles.includes(f) && f !== 'package.json')
    log(`[testbump] Categorized ${sourceFiles.length} source file(s) tracking API implementation.`)

    const tag = await git.getLatestTag()
    if (!tag) {
      throw new Error('No baseline git tag found! Please manually create your first tag (e.g., `git tag 0.0.1`) to establish the baseline contract.')
    }
    log(`[testbump] Found baseline tag: ${tag}`)

    teardown()

    await git.createWorktree(worktree, tag)

    // Create a specific git adapter scoped purely to the worktree path!
    const wtGit = createGit(worktree, { run, execSync })

    log('\n[testbump] --- SCENARIO A: T(old) on C(new) ---')
    await overlayFiles(sourceFiles, cwd, worktree)
    const testOldOnNew = await run(runCmd, worktree)
    log(`[testbump] Are old contracts intact? ${testOldOnNew.pass ? '✅ YES' : '❌ NO'}`)
    if (options.verbose && !testOldOnNew.pass) log(testOldOnNew.stdout || testOldOnNew.stderr)

    await wtGit.resetAndClean()

    log('\n[testbump] --- SCENARIO B: T(new) on C(old) ---')
    await overlayFiles(testFiles, cwd, worktree)
    const testNewOnOld = await run(runCmd, worktree)
    log(`[testbump] Are there new test contracts? ${!testNewOnOld.pass ? '✅ YES' : '➖ NO'}`)
    if (options.verbose && !testNewOnOld.pass) log(testNewOnOld.stdout || testNewOnOld.stderr)

    const bumpStr = bumpStringFor({ testOldOnNewPass: testOldOnNew.pass, testNewOnOldPass: testNewOnOld.pass })
    log(`\n[testbump] Conclusion: Incrementing as '${bumpStr.toUpperCase()}'.`)

    return bumpStr
  } finally {
    process.off('SIGINT', handleSignal)
    process.off('SIGTERM', handleSignal)
    teardown()
  }
}

export const init = async (cwd, options = {}) => {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) throw new Error('No package.json found. Please run `npm init` first.')

  const git = createGit(cwd, { run, execSync })
  if (!(await git.isRepository())) throw new Error('Not a git repository. Please run `git init` first.')

  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  pkg.scripts = pkg.scripts || {}
  pkg.scripts.bump = 'npm version $(npx testbump)'

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  let message = '[testbump] Successfully configured "bump" script in package.json.\n'

  const tag = await git.getLatestTag()

  if (!tag) {
    const v = pkg.version || '0.0.1'
    const commitMsg = options.message || options.tagMessage || `chore: baseline ${v}`

    // Phase 1 skip: we leave npm logic as-is until the Workspace adapter
    const npmRes = await run(`npm version ${v} -m "${commitMsg}" --allow-same-version --force`, cwd)

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
