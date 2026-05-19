import { relative, join, dirname } from 'node:path'
import { spawn, execSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import fs, { existsSync } from 'node:fs'
import { exit } from 'node:process'
import { fileURLToPath } from 'node:url'

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

export const bump = async (cwd, options = {}) => {
  const worktree = join(cwd, '.bump-worktree')
  const resultsPath = join(cwd, '.testbump-files.json')

  // Renamed options.dryRun to options.verbose
  const log = (...args) => { if (options.verbose) console.error(...args) }

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
    log('[testbump] Execution initiated. Extracting context...')
    const testCmd = await getTestCommand(cwd)
    log(`[testbump] Executing test script: \`${testCmd}\``)

    const testFiles = await discoverTestFiles(testCmd, cwd, resultsPath)
    log(`[testbump] Discovered ${testFiles.length} test file(s) forming the contract.`)

    const gitFilesResult = await run('git ls-files', cwd)
    if (!gitFilesResult.pass) throw new Error('Not a git repository.')

    const allFiles = gitFilesResult.stdout.split('\n').filter(Boolean)
    const sourceFiles = allFiles.filter(f => !testFiles.includes(f) && f !== 'package.json')
    log(`[testbump] Categorized ${sourceFiles.length} source file(s) tracking API implementation.`)

    const tag = await getBaselineTag(cwd)
    log(`[testbump] Found baseline tag: ${tag}`)

    teardown()

    const worktreeAdd = await run(`git worktree add "${worktree}" ${tag}`, cwd)
    if (!worktreeAdd.pass) throw new Error('Failed to create git worktree.')

    log('\n[testbump] --- SCENARIO A: T(old) on C(new) ---')
    await overlayFiles(sourceFiles, cwd, worktree)
    const testOldOnNew = await run(testCmd, worktree)
    log(`[testbump] Are old contracts intact? ${testOldOnNew.pass ? '✅ YES' : '❌ NO'}`)
    if (options.verbose && !testOldOnNew.pass) log(testOldOnNew.stdout || testOldOnNew.stderr)

    await run('git reset --hard && git clean -fd', worktree)

    log('\n[testbump] --- SCENARIO B: T(new) on C(old) ---')
    await overlayFiles(testFiles, cwd, worktree)
    const testNewOnOld = await run(testCmd, worktree)
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

export const init = async (cwd) => {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) throw new Error('No package.json found. Please run `npm init` first.')

  const gitCheck = await run('git status', cwd)
  if (!gitCheck.pass) throw new Error('Not a git repository. Please run `git init` first.')

  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  pkg.scripts = pkg.scripts || {}
  pkg.scripts.bump = 'npm version $(npx testbump)'

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  // We strictly add and commit only the package.json to avoid committing unfinished user work
  await run('git add package.json', cwd)
  const commitRes = await run('git commit -m "chore: setup testbump"', cwd)

  let message = '[testbump] Successfully configured "bump" script in package.json.\n'

  const tags = await run('git describe --tags --abbrev=0', cwd)

  if (!tags.pass || !tags.stdout.trim()) {
    const v = pkg.version || '0.0.0'

    // We attempt to use `npm version` because it also updates package-lock.json if present
    const npmRes = await run(`npm version ${v} --allow-same-version`, cwd)

    if (npmRes.pass) {
      message += `[testbump] Created baseline tag: v${v}`
    } else {
      // Fallback directly to git tag if npm fails (e.g., dirty working tree)
      await run(`git tag v${v}`, cwd)
      message += `[testbump] Created baseline git tag: v${v}`
    }
  } else {
    message += `[testbump] Baseline tag already exists: ${tags.stdout.trim()}`
  }

  return message
}
