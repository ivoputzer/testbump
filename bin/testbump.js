#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { existsSync, cpSync, mkdirSync, readFileSync } from 'node:fs'
import { runCommand, extractTestFilesFromJUnit, categorizeFiles, calculateTDB } from '../index.js'

const OLD_DIR = join(process.cwd(), '.old-state')

try {
  // Get package.json test command
  if (!existsSync('package.json')) throw new Error('No package.json found.')
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  const testCmd = pkg.scripts?.test

  if (!testCmd) throw new Error('No "test" script found in package.json.')

  // Discover Test Files using the JUnit Trick!
  // If the user has a broken test initially, this will fail gracefully
  const junitResult = runCommand(`${testCmd} --test-reporter=junit`, execSync)
  const testFiles = extractTestFilesFromJUnit(junitResult.stdout || '', process.cwd())

  if (testFiles.length === 0) {
    throw new Error('No test files discovered! TDB requires at least one passing test file to form a contract.')
  }

  // Categorize Tracked Files
  const gitFilesResult = runCommand('git ls-files', execSync)
  if (!gitFilesResult.pass) throw new Error('Not a git repository.')

  const allFiles = gitFilesResult.stdout.split('\n').filter(Boolean)
  const { sourceFiles } = categorizeFiles(allFiles, testFiles)

  // Git Worktree Setup - Check for Baseline Contract!
  // (Removed --match="v*" so it catches your 0.0.0-draft tag!)
  const lastTagResult = runCommand('git describe --tags --abbrev=0', execSync)
  if (!lastTagResult.pass || !lastTagResult.stdout.trim()) {
    throw new Error('No baseline git tag found! Please manually create your first tag (e.g., `git tag 0.0.1`) to establish the baseline contract.')
  }

  if (existsSync(OLD_DIR)) runCommand(`git worktree remove --force ${OLD_DIR}`, execSync)
  runCommand(`git worktree add ${OLD_DIR} ${lastTagResult.stdout.trim()}`, execSync)

  // Helper to overlay files cleanly
  const overlayFiles = (files) => {
    files.forEach(file => {
      const src = join(process.cwd(), file)
      const dest = join(OLD_DIR, file)
      if (existsSync(src)) {
        mkdirSync(dirname(dest), { recursive: true })
        cpSync(src, dest, { force: true })
      }
    })
  }

  // TDB Scenario A: T(old) on C(new)
  overlayFiles(sourceFiles)
  const testOldOnNewPass = runCommand(testCmd, execSync, OLD_DIR).pass

  // Reset overlay
  runCommand('git reset --hard && git clean -fd', execSync, OLD_DIR)

  // TDB Scenario B: T(new) on C(old)
  overlayFiles(testFiles)
  const testNewOnOldPass = runCommand(testCmd, execSync, OLD_DIR).pass

  // Calculate and Output!
  const bump = calculateTDB({ testOldOnNewPass, testNewOnOldPass })
  console.log(bump)
} catch (err) {
  // Print error to stderr so it doesn't accidentally get parsed as a bump command
  console.error(`\x1b[31m[testbump error]\x1b[0m ${err.message}`)
  process.exit(1)
} finally {
  // Bulletproof cleanup: This runs NO MATTER WHAT happens above.
  if (existsSync(OLD_DIR)) {
    runCommand(`git worktree remove --force ${OLD_DIR}`, execSync)
  }
}
